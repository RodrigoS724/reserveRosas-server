import crypto from 'node:crypto'
import { execute } from './db.js'
import { registrarAuditoria } from './auditoria.js'

const LOGIN_WINDOW_MS = Number(process.env.AUTH_LOGIN_WINDOW_MS || 10 * 60 * 1000)
const LOGIN_LOCK_MS = Number(process.env.AUTH_LOGIN_LOCK_MS || 15 * 60 * 1000)
const LOGIN_MAX_ATTEMPTS = Number(process.env.AUTH_LOGIN_MAX_ATTEMPTS || 5)
const loginAttempts = new Map()

const ALL_PERMISSIONS = [
  'agenda',
  'reservas',
  'aprontes',
  'historial',
  'ajustes',
  'vehiculos',
  'config',
  'usuarios',
  'auditoria'
]

function normalizeRole(role) {
  if (role === 'superadmin' || role === 'super' || role === 'admin' || role === 'user') {
    return role
  }
  return 'user'
}

export function getDefaultPermissions(role) {
  if (role === 'superadmin') return [...ALL_PERMISSIONS]
  if (role === 'super') return [...ALL_PERMISSIONS]
  if (role === 'admin') return ['agenda', 'reservas', 'aprontes', 'historial', 'ajustes', 'vehiculos']
  return ['reservas', 'historial']
}

function normalizePermissions(role, permissions) {
  const normalizedRole = normalizeRole(role)
  const allowed = new Set(ALL_PERMISSIONS)
  if (!permissions || permissions.length === 0) {
    return getDefaultPermissions(normalizedRole)
  }
  const unique = new Set()
  for (const p of permissions) {
    if (allowed.has(p)) unique.add(p)
  }
  return Array.from(unique)
}

function parsePermissions(raw, role) {
  const normalizedRole = normalizeRole(role)
  if (!raw) return getDefaultPermissions(normalizedRole)
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return normalizePermissions(normalizedRole, parsed)
    }
    return getDefaultPermissions(normalizedRole)
  } catch {
    return getDefaultPermissions(normalizedRole)
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 32)
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex')
}

const DUMMY_PASSWORD_HASH = hashPassword('reserve-rosas-auth-dummy')

function normalizeUsername(username) {
  return String(username || '').trim()
}

function normalizePassword(password) {
  return String(password || '')
}

function validatePasswordStrength(password) {
  if (password.length < 8) {
    return 'La contrasena debe tener al menos 8 caracteres'
  }
  if (!/[a-z]/.test(password)) {
    return 'La contrasena debe incluir al menos una letra minuscula'
  }
  if (!/[A-Z]/.test(password)) {
    return 'La contrasena debe incluir al menos una letra mayuscula'
  }
  if (!/[0-9]/.test(password)) {
    return 'La contrasena debe incluir al menos un numero'
  }
  return ''
}

function assertValidNewPassword(password) {
  const normalized = normalizePassword(password)
  const error = validatePasswordStrength(normalized)
  if (error) {
    throw new Error(error)
  }
  return normalized
}

function pruneOldAttempts(state, now) {
  state.attempts = state.attempts.filter((ts) => now - ts <= LOGIN_WINDOW_MS)
}

function isLoginTemporarilyBlocked(username) {
  const key = normalizeUsername(username).toLowerCase()
  if (!key) return false
  const now = Date.now()
  const state = loginAttempts.get(key)
  if (!state) return false
  if (state.lockUntil && state.lockUntil > now) return true
  if (state.lockUntil && state.lockUntil <= now) {
    loginAttempts.delete(key)
  }
  return false
}

function registerFailedLogin(username) {
  const key = normalizeUsername(username).toLowerCase()
  if (!key) return
  const now = Date.now()
  const state = loginAttempts.get(key) || { attempts: [], lockUntil: 0 }
  pruneOldAttempts(state, now)
  state.attempts.push(now)
  if (state.attempts.length >= LOGIN_MAX_ATTEMPTS) {
    state.lockUntil = now + LOGIN_LOCK_MS
  }
  loginAttempts.set(key, state)
}

function clearFailedLogins(username) {
  const key = normalizeUsername(username).toLowerCase()
  if (!key) return
  loginAttempts.delete(key)
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const hash = Buffer.from(parts[2], 'hex')
  const computed = crypto.scryptSync(password, salt, 32)
  if (hash.length !== computed.length) return false
  return crypto.timingSafeEqual(hash, computed)
}

async function ensureUsersTable() {
  await execute(
    `CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(50) NOT NULL,
      permissions_json TEXT,
      activo TINYINT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  )
}

export async function listarUsuarios() {
  await ensureUsersTable()
  const rows = await execute(
    'SELECT id, nombre, username, password_hash, role, permissions_json, activo, created_at FROM usuarios'
  )
  return rows.map((row) => ({
    id: Number(row.id),
    nombre: row.nombre,
    username: row.username,
    role: normalizeRole(row.role),
    permissions: parsePermissions(row.permissions_json, normalizeRole(row.role)),
    activo: Number(row.activo) || 0,
    created_at: row.created_at
  }))
}

export async function listarUsuariosLogin() {
  const users = await listarUsuarios()
  return users.filter((u) => u.activo).map((u) => ({
    id: u.id,
    nombre: u.nombre,
    username: u.username,
    role: u.role,
    permissions: u.permissions
  }))
}

export async function validarLogin(username, password) {
  await ensureUsersTable()
  const normalizedUsername = normalizeUsername(username)
  const normalizedPassword = normalizePassword(password)

  if (!normalizedUsername || !normalizedPassword) {
    return { ok: false, error: 'Usuario o contrasena invalida' }
  }

  if (isLoginTemporarilyBlocked(normalizedUsername)) {
    await registrarAuditoria({
      actor_username: normalizedUsername,
      actor_role: 'anon',
      accion: 'LOGIN_BLOQUEADO',
      target_username: normalizedUsername,
      detalle: 'Demasiados intentos fallidos'
    })
    return { ok: false, error: 'Acceso temporalmente bloqueado por intentos fallidos' }
  }

  const rows = await execute(
    'SELECT id, nombre, username, password_hash, role, permissions_json, activo FROM usuarios WHERE username = ? LIMIT 1',
    [normalizedUsername]
  )
  const row = rows[0]

  const storedHash = row?.password_hash || DUMMY_PASSWORD_HASH
  const passwordOk = verifyPassword(normalizedPassword, storedHash)

  if (!row || !row.password_hash || !passwordOk) {
    registerFailedLogin(normalizedUsername)
    await registrarAuditoria({
      actor_username: normalizedUsername,
      actor_role: 'anon',
      accion: 'LOGIN_FAIL',
      target_username: normalizedUsername,
      detalle: 'Credenciales invalidas'
    })
    return { ok: false, error: 'Usuario o contrasena invalida' }
  }

  if (!Number(row.activo)) {
    await registrarAuditoria({
      actor_username: row.username,
      actor_role: row.role,
      accion: 'LOGIN_FAIL',
      target_username: row.username,
      detalle: 'Usuario inactivo'
    })
    return { ok: false, error: 'Usuario inactivo' }
  }

  clearFailedLogins(normalizedUsername)

  await registrarAuditoria({
    actor_username: row.username,
    actor_role: row.role,
    accion: 'LOGIN_OK',
    target_username: row.username,
    detalle: 'Inicio de sesion exitoso'
  })

  return {
    ok: true,
    user: {
      id: Number(row.id),
      nombre: row.nombre,
      username: row.username,
      role: normalizeRole(row.role),
      permissions: parsePermissions(row.permissions_json, normalizeRole(row.role))
    }
  }
}

export async function crearUsuario(data) {
  await ensureUsersTable()
  const nombre = String(data.nombre || '').trim()
  const username = normalizeUsername(data.username)
  if (!nombre) {
    throw new Error('El nombre es obligatorio')
  }
  if (!username) {
    throw new Error('El usuario es obligatorio')
  }
  const role = normalizeRole(data.role)
  const permissions = normalizePermissions(role, data.permissions)
  const passwordHash = hashPassword(assertValidNewPassword(data.password))
  const activo = data.activo ?? 1

  await execute(
    `INSERT INTO usuarios (nombre, username, password_hash, role, permissions_json, activo)
     VALUES ( ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       nombre = VALUES(nombre),
       password_hash = VALUES(password_hash),
       role = VALUES(role),
       permissions_json = VALUES(permissions_json),
       activo = VALUES(activo)`,
    [nombre, username, passwordHash, role, JSON.stringify(permissions), activo]
  )

  await registrarAuditoria({
    actor_username: data.actor_username || 'sistema',
    actor_role: data.actor_role || 'system',
    accion: 'USUARIO_CREADO',
    target_username: username,
    detalle: 'Rol: ' + role
  })
}

export async function actualizarUsuario(data) {
  await ensureUsersTable()
  const role = normalizeRole(data.role)
  const permissions = normalizePermissions(role, data.permissions)
  const activo = data.activo ?? 1

  await execute(
    `UPDATE usuarios SET nombre = ?, username = ?, role = ?, permissions_json = ?, activo = ?
     WHERE id = ?`,
    [data.nombre, data.username, role, JSON.stringify(permissions), activo, data.id]
  )

  await registrarAuditoria({
    actor_username: data.actor_username || 'sistema',
    actor_role: data.actor_role || 'system',
    accion: 'USUARIO_ACTUALIZADO',
    target_username: data.username,
    detalle: 'Rol: ' + role + ' | activo: ' + activo
  })
}

export async function eliminarUsuario(id, actor) {
  const username = await obtenerUsernamePorId(id)
  await ensureUsersTable()
  await execute('DELETE FROM usuarios WHERE id = ?', [id])

  await registrarAuditoria({
    actor_username: actor?.username || 'sistema',
    actor_role: actor?.role || 'system',
    accion: 'USUARIO_ELIMINADO',
    target_username: username,
    detalle: 'ID: ' + id
  })
}

export async function actualizarPassword(id, password, actor) {
  const username = await obtenerUsernamePorId(id)
  await ensureUsersTable()
  const passwordHash = hashPassword(assertValidNewPassword(password))
  await execute('UPDATE usuarios SET password_hash = ? WHERE id = ?', [passwordHash, id])

  await registrarAuditoria({
    actor_username: actor?.username || 'sistema',
    actor_role: actor?.role || 'system',
    accion: 'PASSWORD_CAMBIADA',
    target_username: username,
    detalle: 'ID: ' + id
  })
}

export async function cambiarPasswordPropia(data) {
  await ensureUsersTable()
  const username = normalizeUsername(data?.username)
  const currentPassword = normalizePassword(data?.currentPassword)
  const newPassword = assertValidNewPassword(data?.newPassword)

  if (!username || !currentPassword) {
    throw new Error('Datos incompletos para cambiar contrasena')
  }
  if (currentPassword === newPassword) {
    throw new Error('La nueva contrasena debe ser distinta a la actual')
  }

  const rows = await execute(
    'SELECT id, username, role, password_hash, activo FROM usuarios WHERE username = ? LIMIT 1',
    [username]
  )
  const row = rows[0]
  if (!row || !row.password_hash) {
    throw new Error('Usuario no encontrado')
  }
  if (!Number(row.activo)) {
    throw new Error('Usuario inactivo')
  }
  if (!verifyPassword(currentPassword, row.password_hash)) {
    await registrarAuditoria({
      actor_username: row.username,
      actor_role: row.role,
      accion: 'PASSWORD_CAMBIO_FAIL',
      target_username: row.username,
      detalle: 'Contrasena actual incorrecta'
    })
    throw new Error('La contrasena actual no es correcta')
  }

  const newPasswordHash = hashPassword(newPassword)
  await execute('UPDATE usuarios SET password_hash = ? WHERE id = ?', [newPasswordHash, row.id])

  await registrarAuditoria({
    actor_username: row.username,
    actor_role: row.role,
    accion: 'PASSWORD_CAMBIO_PROPIO',
    target_username: row.username,
    detalle: 'Cambio de contrasena desde configuracion'
  })

  return { ok: true }
}

export const PermissionsCatalog = ALL_PERMISSIONS

async function obtenerUsernamePorId(id) {
  const rows = await execute('SELECT username FROM usuarios WHERE id = ? LIMIT 1', [id])
  return rows[0]?.username || null
}

