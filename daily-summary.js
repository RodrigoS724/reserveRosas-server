import fs from 'node:fs'
import path from 'node:path'
import { obtenerReservasPorFecha } from './reservas.js'
import nodemailer from 'nodemailer'
import { SERVER_DATA_DIR } from './paths.js'

const DEFAULT_CONFIG = {
  enabled: false,
  sendTime: '07:30',
  recipients: [],
  lastSentDate: ''
}

function getConfigPath() {
  const custom = process.env.DAILY_SUMMARY_CONFIG_PATH
  if (custom && String(custom).trim()) {
    return custom
  }
  return path.join(SERVER_DATA_DIR, 'daily-summary.json')
}

function normalizeTime(raw) {
  const value = String(raw || '').trim()
  if (!/^\d{2}:\d{2}$/.test(value)) return DEFAULT_CONFIG.sendTime
  const parts = value.split(':').map(Number)
  const h = parts[0]
  const m = parts[1]
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return DEFAULT_CONFIG.sendTime
  }
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

function normalizeRecipients(list) {
  const unique = new Set()
  for (const item of list || []) {
    const email = String(item || '').trim().toLowerCase()
    if (!email) continue
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue
    unique.add(email)
  }
  return Array.from(unique)
}

function readConfig() {
  try {
    const configPath = getConfigPath()
    if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG }
    const raw = fs.readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CONFIG }
    return {
      enabled: Boolean(parsed.enabled),
      sendTime: normalizeTime(parsed.sendTime || DEFAULT_CONFIG.sendTime),
      recipients: normalizeRecipients(Array.isArray(parsed.recipients) ? parsed.recipients : []),
      lastSentDate: String(parsed.lastSentDate || '')
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

function writeConfig(config) {
  const configPath = getConfigPath()
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

export function getDailySummaryConfig() {
  return readConfig()
}

export function setDailySummaryConfig(partial) {
  const current = readConfig()
  const merged = {
    enabled: typeof partial.enabled === 'boolean' ? partial.enabled : current.enabled,
    sendTime: partial.sendTime ? normalizeTime(partial.sendTime) : current.sendTime,
    recipients: Array.isArray(partial.recipients) ? normalizeRecipients(partial.recipients) : current.recipients,
    lastSentDate: typeof partial.lastSentDate === 'string' ? partial.lastSentDate : current.lastSentDate
  }
  writeConfig(merged)
  return merged
}

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim()
  const user = String(process.env.SMTP_USER || '').trim()
  const pass = String(process.env.SMTP_PASS || '').trim()
  const from = String(process.env.SMTP_FROM || user).trim()
  const port = Number(process.env.SMTP_PORT || '587')
  const secureEnv = String(process.env.SMTP_SECURE || '').toLowerCase()
  const secure = secureEnv === '1' || secureEnv === 'true' || secureEnv === 'yes' || port === 465
  const rejectEnv = String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || '').toLowerCase()
  const rejectUnauthorized = !(rejectEnv === '0' || rejectEnv === 'false' || rejectEnv === 'no')
  return { host, port: Number.isFinite(port) ? port : 587, secure, user, pass, from, rejectUnauthorized }
}

function buildSummaryText(dateIso, reservas) {
  const header = [
    'Resumen diario de reservas (' + dateIso + ')',
    'Total: ' + reservas.length,
    ''
  ]

  const rows = reservas.map((r) => {
    const hora = r?.hora ? String(r.hora) : '--:--'
    const nombre = r?.nombre ? String(r.nombre) : 'Sin nombre'
    const telefono = r?.telefono ? String(r.telefono) : '-'
    const matricula = r?.matricula ? String(r.matricula) : '-'
    const estado = r?.estado ? String(r.estado) : 'Pendiente'
    return hora + ' | ' + nombre + ' | ' + telefono + ' | ' + matricula + ' | ' + estado
  })

  if (rows.length === 0) {
    rows.push('Sin reservas para esta fecha.')
  }

  return header.concat(rows).join('\n')
}

async function sendDailySummaryEmail(dateIso) {
  const cfg = readConfig()
  if (!cfg.enabled) return { ok: false, reason: 'disabled' }
  if (!cfg.recipients.length) return { ok: false, reason: 'no_recipients' }

  const smtp = getSmtpConfig()
  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
    return { ok: false, reason: 'smtp_missing' }
  }

  const reservasDia = await obtenerReservasPorFecha(dateIso)
  const reservas = (Array.isArray(reservasDia) ? reservasDia : []).filter((r) => {
    const estado = String(r?.estado || '').trim().toLowerCase()
    return estado !== 'cancelada' && estado !== 'cancelado'
  })
  const text = buildSummaryText(dateIso, reservas)

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    tls: { rejectUnauthorized: smtp.rejectUnauthorized },
    auth: { user: smtp.user, pass: smtp.pass }
  })

  await transporter.sendMail({
    from: smtp.from,
    to: cfg.recipients.join(','),
    subject: 'Resumen diario de reservas - ' + dateIso,
    text
  })

  setDailySummaryConfig({ lastSentDate: dateIso })
  return { ok: true, count: reservas.length }
}

export async function sendDailySummaryNow(dateIso) {
  const date = String(dateIso || '').trim()
  const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().split('T')[0]
  const previous = readConfig()

  if (!previous.enabled) {
    setDailySummaryConfig({ enabled: true })
  }

  try {
    return await sendDailySummaryEmail(normalizedDate)
  } finally {
    if (!previous.enabled) {
      setDailySummaryConfig({ enabled: false })
    }
  }
}
