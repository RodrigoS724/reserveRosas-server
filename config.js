import fs from 'node:fs'
import path from 'node:path'
import { execute } from './db.js'
import { SERVER_ENV_PATH } from './paths.js'

function getEnvPath() {
  const envPath = process.env.API_ENV_PATH
  if (envPath && String(envPath).trim()) {
    return envPath
  }
  return SERVER_ENV_PATH
}

export function readEnvText() {
  const envPath = getEnvPath()
  if (!fs.existsSync(envPath)) return ''
  return fs.readFileSync(envPath, 'utf-8')
}

export function writeEnvText(text) {
  const envPath = getEnvPath()
  const dir = path.dirname(envPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(envPath, text || '', 'utf-8')

  const lines = String(text || '').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key) {
      process.env[key] = value
    }
  }
}

export async function testDb() {
  try {
    await execute('SELECT 1 as ok')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  }
}
