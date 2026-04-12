import mysql from 'mysql2/promise'

let pool = null

export function isMysqlConfigured() {
  return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE)
}

function ensureConfigured() {
  if (!isMysqlConfigured()) {
    throw new Error('MYSQL not configured')
  }
}

export function getPool() {
  if (pool) return pool
  ensureConfigured()
  const port = process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306
  const useSsl = String(process.env.MYSQL_SSL || '').toLowerCase()
  const sslEnabled = useSsl === '1' || useSsl === 'true' || useSsl === 'yes'
  const rejectEnv = String(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED || '').toLowerCase()
  const rejectUnauthorized = !(rejectEnv === '0' || rejectEnv === 'false' || rejectEnv === 'no')

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number.isFinite(port) ? port : 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
    ssl: sslEnabled ? { rejectUnauthorized } : undefined,
    connectTimeout: process.env.MYSQL_CONNECT_TIMEOUT
      ? Number(process.env.MYSQL_CONNECT_TIMEOUT)
      : 10000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
  })

  return pool
}

export async function execute(sql, params = []) {
  const [rows] = await getPool().execute(sql, params)
  return rows
}

export async function withTransaction(fn) {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (error) {
    try {
      await conn.rollback()
    } catch {}
    throw error
  } finally {
    conn.release()
  }
}
