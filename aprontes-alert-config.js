import fs from 'node:fs'
import path from 'node:path'
import { SERVER_DATA_DIR } from './paths.js'

const DEFAULT_CONFIG = {
  default_email: '',
  default_dias_alerta: 7
}

function getConfigPath() {
  const custom = process.env.APRONTES_ALERT_CONFIG_PATH
  if (custom && String(custom).trim()) {
    return custom
  }
  return path.join(SERVER_DATA_DIR, 'aprontes-alert-config.json')
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email) return ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function normalizeDays(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 7
  const days = Math.floor(n)
  if (days < 1) return 1
  if (days > 90) return 90
  return days
}

export function getAprontesAlertConfig() {
  try {
    const configPath = getConfigPath()
    if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG }
    const raw = fs.readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      default_email: normalizeEmail(parsed?.default_email),
      default_dias_alerta: normalizeDays(parsed?.default_dias_alerta)
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function setAprontesAlertConfig(partial) {
  const current = getAprontesAlertConfig()
  const next = {
    default_email: partial && Object.prototype.hasOwnProperty.call(partial, 'default_email')
      ? normalizeEmail(partial.default_email)
      : current.default_email,
    default_dias_alerta: partial && Object.prototype.hasOwnProperty.call(partial, 'default_dias_alerta')
      ? normalizeDays(partial.default_dias_alerta)
      : current.default_dias_alerta
  }

  const configPath = getConfigPath()
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf-8')
  return next
}
