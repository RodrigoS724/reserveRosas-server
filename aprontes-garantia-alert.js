import nodemailer from 'nodemailer'
import {
  obtenerAprontesPendientesAlertaGarantia,
  marcarApronteGarantiaNotificado
} from './aprontes.js'
import { getAprontesAlertConfig } from './aprontes-alert-config.js'

let schedulerStarted = false
let schedulerTimer = null

function parseSmtpPort() {
  const raw = Number(process.env.SMTP_PORT || '587')
  return Number.isFinite(raw) ? raw : 587
}

function smtpSecureByPort(port) {
  const env = String(process.env.SMTP_SECURE || '').toLowerCase()
  if (env === '1' || env === 'true' || env === 'yes') return true
  if (env === '0' || env === 'false' || env === 'no') return false
  return port === 465
}

function smtpRejectUnauthorized() {
  const env = String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || '').toLowerCase()
  if (env === '0' || env === 'false' || env === 'no') return false
  if (env === '1' || env === 'true' || env === 'yes') return true
  return true
}

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim()
  const user = String(process.env.SMTP_USER || '').trim()
  const pass = String(process.env.SMTP_PASS || '').trim()
  const from = String(process.env.SMTP_FROM || user).trim()
  const port = parseSmtpPort()
  const secure = smtpSecureByPort(port)
  const rejectUnauthorized = smtpRejectUnauthorized()
  return { host, port, secure, user, pass, from, rejectUnauthorized }
}

function normalizeDate(value) {
  const date = new Date(String(value || '').replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return null
  return date
}

function shouldNotify(apronte, defaultDays = 7) {
  const fechaPactada = String(apronte?.fecha_alerta_garantia || '').trim()
  if (fechaPactada) {
    const todayIso = new Date().toISOString().slice(0, 10)
    return todayIso >= fechaPactada
  }

  const dias = Number(apronte?.dias_alerta_garantia || defaultDays || 7)
  const limiteDias = Number.isFinite(dias) && dias > 0 ? Math.floor(dias) : 7
  const base = normalizeDate(apronte?.garantia_espera_desde)
    || normalizeDate(`${apronte?.fecha || ''} ${apronte?.hora || '00:00'}`)
  if (!base) return false

  const diffMs = Date.now() - base.getTime()
  const diffDias = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  return diffDias >= limiteDias
}

function buildReminderText(apronte, limiteDias) {
  const repuestos = String(apronte?.repuestos_garantia || '').trim() || 'Sin repuestos cargados'
  const fechaPactada = String(apronte?.fecha_alerta_garantia || '').trim()
  return [
    'Alerta de garantia pendiente de repuestos',
    '',
    `Apronte ID: ${apronte?.id || '-'}`,
    `Cliente: ${apronte?.nombre || '-'}`,
    `Telefono: ${apronte?.telefono || '-'}`,
    `Moto: ${(apronte?.marca || '-')} ${(apronte?.modelo || '-')}`,
    `Factura: ${apronte?.factura || '-'}`,
    `Estado: ${apronte?.estado || '-'}`,
    `Fecha pactada de alerta: ${fechaPactada || '-'}`,
    `Dias limite configurados: ${limiteDias}`,
    '',
    'Repuestos en garantia:',
    repuestos
  ].join('\n')
}

async function enviarAlertaApronte(apronte) {
  const cfg = getAprontesAlertConfig()
  const smtp = getSmtpConfig()
  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
    console.warn('[AprontesGarantia] SMTP incompleto, alerta omitida.')
    return false
  }

  const to = String(apronte?.correo_alerta_garantia || cfg.default_email || '').trim()
  if (!to) return false

  const limiteDias = Number.isFinite(Number(apronte?.dias_alerta_garantia))
    ? Number(apronte?.dias_alerta_garantia)
    : Number(cfg.default_dias_alerta || 7)

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    tls: { rejectUnauthorized: smtp.rejectUnauthorized },
    auth: { user: smtp.user, pass: smtp.pass }
  })

  await transporter.sendMail({
    from: smtp.from,
    to,
    subject: `Apronte en espera de garantia sin repuestos (#${apronte?.id || ''})`,
    text: buildReminderText({ ...apronte, correo_alerta_garantia: to }, limiteDias)
  })

  await marcarApronteGarantiaNotificado(apronte.id)
  return true
}

async function schedulerTick() {
  try {
    const cfg = getAprontesAlertConfig()
    const pendientes = await obtenerAprontesPendientesAlertaGarantia()
    if (!Array.isArray(pendientes) || pendientes.length === 0) return

    for (const apronte of pendientes) {
      if (!shouldNotify(apronte, Number(cfg.default_dias_alerta || 7))) continue
      try {
        await enviarAlertaApronte(apronte)
      } catch (error) {
        console.error('[AprontesGarantia] Error enviando alerta:', error)
      }
    }
  } catch (error) {
    console.error('[AprontesGarantia] Error en scheduler:', error)
  }
}

export function startAprontesGarantiaAlertScheduler() {
  if (schedulerStarted) return
  schedulerStarted = true
  schedulerTick()
  schedulerTimer = setInterval(schedulerTick, 60 * 60 * 1000)
}

export function stopAprontesGarantiaAlertScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
  }
  schedulerStarted = false
}
