export const APP_ROLES = ['superadmin', 'administrador', 'ventas', 'caja', 'taller']

export const ALL_PERMISSIONS = [
  'agenda',
  'reservas',
  'registros',
  'aprontes',
  'historial',
  'ajustes',
  'vehiculos',
  'config',
  'usuarios',
  'auditoria'
]

const DEFAULT_PERMISSIONS = {
  superadmin: [...ALL_PERMISSIONS],
  administrador: ['agenda', 'reservas', 'registros', 'aprontes', 'historial', 'ajustes', 'vehiculos', 'usuarios', 'auditoria'],
  ventas: ['agenda', 'reservas', 'registros', 'aprontes', 'historial'],
  caja: ['agenda', 'reservas', 'registros', 'aprontes', 'historial'],
  taller: ['reservas', 'aprontes', 'historial']
}

const ROLE_ALIASES = {
  superadmin: 'superadmin',
  superAdmin: 'superadmin',
  super: 'superadmin',
  admin: 'administrador',
  administrador: 'administrador',
  user: 'ventas',
  ventas: 'ventas',
  caja: 'caja',
  taller: 'taller'
}

export function normalizeRole(role) {
  const raw = String(role || '').trim()
  return ROLE_ALIASES[raw] || 'ventas'
}

export function getDefaultPermissions(role) {
  return [...(DEFAULT_PERMISSIONS[normalizeRole(role)] || DEFAULT_PERMISSIONS.ventas)]
}

export function normalizePermissions(role, permissions) {
  const normalizedRole = normalizeRole(role)
  const allowed = new Set(ALL_PERMISSIONS)
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return getDefaultPermissions(normalizedRole)
  }
  const unique = new Set()
  for (const permission of permissions) {
    if (allowed.has(permission)) unique.add(permission)
  }
  return Array.from(unique)
}

export function parsePermissions(raw, role) {
  const normalizedRole = normalizeRole(role)
  if (!raw) return getDefaultPermissions(normalizedRole)
  try {
    const parsed = JSON.parse(raw)
    return normalizePermissions(normalizedRole, parsed)
  } catch {
    return getDefaultPermissions(normalizedRole)
  }
}

export function getActor(payload) {
  const actor = payload?.actor && typeof payload.actor === 'object' ? payload.actor : payload || {}
  return {
    username: String(actor.username || actor.actor_username || '').trim(),
    role: normalizeRole(actor.role || actor.actor_role || '')
  }
}

export function isTallerRole(role) {
  return normalizeRole(role) === 'taller'
}

export function canApproveApronte(role) {
  const normalizedRole = normalizeRole(role)
  return normalizedRole === 'superadmin' || normalizedRole === 'administrador' || normalizedRole === 'caja'
}

export function requiresCajaApproval(role) {
  return normalizeRole(role) === 'ventas'
}

export function assertCanCreateReserva(role) {
  if (isTallerRole(role)) {
    throw new Error('El taller no puede crear reservas')
  }
}

export function assertCanDeleteReserva(role) {
  if (isTallerRole(role)) {
    throw new Error('El taller no puede eliminar reservas')
  }
}

export function assertCanMoveReserva(role) {
  if (isTallerRole(role)) {
    throw new Error('El taller no puede mover reservas')
  }
}

export function assertCanUpdateReserva(role) {
  if (isTallerRole(role)) {
    throw new Error('El taller no puede modificar reservas')
  }
}

export function assertCanEditReservaNotes(role) {
  if (isTallerRole(role)) {
    throw new Error('El taller no puede editar notas de reservas')
  }
}

export function assertCanCreateApronte(role) {
  if (isTallerRole(role)) {
    throw new Error('El taller no puede crear aprontes')
  }
}

export function assertCanDeleteApronte(role) {
  if (isTallerRole(role)) {
    throw new Error('El taller no puede eliminar aprontes')
  }
}

export function assertCanUpdateApronte(role) {
  if (isTallerRole(role)) {
    throw new Error('El taller no puede modificar aprontes')
  }
}