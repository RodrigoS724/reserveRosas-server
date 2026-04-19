import { execute } from './db.js'

let schemaReady = false

function cleanText(value, maxLen = 255) {
  const text = String(value || '').trim()
  return text.length > maxLen ? text.slice(0, maxLen) : text
}

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function parseDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return new Date().toISOString().slice(0, 10)
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
  return d.toISOString().slice(0, 10)
}

function isAdminRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return value === 'superadmin' || value === 'administrador'
}

async function ensureSchema() {
  if (schemaReady) return

  await execute(
    `CREATE TABLE IF NOT EXISTS ventas_motos (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      fecha DATE NOT NULL,
      apronte_id BIGINT NULL,
      marca VARCHAR(100) NOT NULL,
      modelo VARCHAR(100) NOT NULL,
      cliente VARCHAR(255) NOT NULL,
      telefono VARCHAR(30) NULL,
      comentario TEXT NULL,
      vendedor VARCHAR(120) NULL,
      estado VARCHAR(60) NOT NULL DEFAULT 'en_apronte',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ventas_motos_fecha (fecha),
      INDEX idx_ventas_motos_estado (estado)
    )`
  )

  await execute(
    `CREATE TABLE IF NOT EXISTS ventas_creditos (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      fecha DATE NOT NULL,
      localidad VARCHAR(120) NOT NULL,
      telefono VARCHAR(30) NOT NULL,
      monto_solicitado DECIMAL(12,2) NOT NULL DEFAULT 0,
      concreta_venta TINYINT NOT NULL DEFAULT 0,
      financieras_json TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ventas_creditos_fecha (fecha)
    )`
  )

  schemaReady = true
}

export async function listarMotosVentas(estadoFiltro = 'todos') {
  await ensureSchema()
  const filter = String(estadoFiltro || 'todos').trim().toLowerCase()

  let where = ''
  if (filter === 'pendientes') where = "WHERE estado <> 'entregada'"
  if (filter === 'entregadas') where = "WHERE estado = 'entregada'"

  const rows = await execute(
    `SELECT id, fecha, apronte_id, marca, modelo, cliente, telefono, comentario, vendedor, estado, created_at, updated_at
     FROM ventas_motos
     ${where}
     ORDER BY fecha DESC, id DESC`
  )

  return (rows || []).map((r) => ({
    id: Number(r.id),
    fecha: String(r.fecha || ''),
    apronte_id: r.apronte_id == null ? null : Number(r.apronte_id),
    marca: String(r.marca || ''),
    modelo: String(r.modelo || ''),
    cliente: String(r.cliente || ''),
    telefono: String(r.telefono || ''),
    comentario: String(r.comentario || ''),
    vendedor: String(r.vendedor || ''),
    estado: String(r.estado || ''),
    created_at: String(r.created_at || ''),
    updated_at: String(r.updated_at || '')
  }))
}

export async function crearMotoVenta(payload = {}) {
  await ensureSchema()

  const fecha = parseDate(payload.fecha)
  const apronteId = payload.apronte_id == null || payload.apronte_id === '' ? null : Number(payload.apronte_id)
  const marca = cleanText(payload.marca, 100).toLowerCase()
  const modelo = cleanText(payload.modelo, 100).toLowerCase()
  const cliente = cleanText(payload.cliente, 255)
  const telefono = cleanPhone(payload.telefono)
  const comentario = cleanText(payload.comentario, 4000)
  const vendedor = cleanText(payload.vendedor, 120)
  const estado = cleanText(payload.estado || 'en_apronte', 60).toLowerCase()

  if (!marca || !modelo || !cliente) {
    throw new Error('Faltan datos requeridos: marca, modelo, cliente')
  }

  const result = await execute(
    `INSERT INTO ventas_motos (fecha, apronte_id, marca, modelo, cliente, telefono, comentario, vendedor, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [fecha, apronteId, marca, modelo, cliente, telefono, comentario, vendedor, estado]
  )

  return { ok: true, id: Number(result?.insertId || 0) }
}

export async function actualizarMotoVenta(payload = {}) {
  await ensureSchema()

  const id = Number(payload.id)
  if (!id) throw new Error('ID inválido')

  const fecha = parseDate(payload.fecha)
  const apronteId = payload.apronte_id == null || payload.apronte_id === '' ? null : Number(payload.apronte_id)
  const marca = cleanText(payload.marca, 100).toLowerCase()
  const modelo = cleanText(payload.modelo, 100).toLowerCase()
  const cliente = cleanText(payload.cliente, 255)
  const telefono = cleanPhone(payload.telefono)
  const comentario = cleanText(payload.comentario, 4000)
  const vendedor = cleanText(payload.vendedor, 120)
  const estado = cleanText(payload.estado || 'en_apronte', 60).toLowerCase()

  await execute(
    `UPDATE ventas_motos
     SET fecha = ?, apronte_id = ?, marca = ?, modelo = ?, cliente = ?, telefono = ?, comentario = ?, vendedor = ?, estado = ?
     WHERE id = ?`,
    [fecha, apronteId, marca, modelo, cliente, telefono, comentario, vendedor, estado, id]
  )

  return { ok: true }
}

export async function borrarMotoVenta(payload = {}) {
  await ensureSchema()
  const id = Number(payload.id)
  if (!id) throw new Error('ID inválido')

  const actorRole = payload?.actor?.role || ''
  if (!isAdminRole(actorRole)) {
    throw new Error('Solo administrador o superadmin pueden eliminar motos vendidas')
  }

  await execute('DELETE FROM ventas_motos WHERE id = ?', [id])
  return { ok: true }
}

export async function listarCreditosVentas() {
  await ensureSchema()

  const rows = await execute(
    `SELECT id, fecha, localidad, telefono, monto_solicitado, concreta_venta, financieras_json, created_at, updated_at
     FROM ventas_creditos
     ORDER BY fecha DESC, id DESC`
  )

  return (rows || []).map((r) => ({
    id: Number(r.id),
    fecha: String(r.fecha || ''),
    localidad: String(r.localidad || ''),
    telefono: String(r.telefono || ''),
    monto_solicitado: Number(r.monto_solicitado || 0),
    concreta_venta: Number(r.concreta_venta || 0) === 1,
    financieras: (() => {
      try {
        return JSON.parse(String(r.financieras_json || '{}'))
      } catch {
        return {}
      }
    })(),
    created_at: String(r.created_at || ''),
    updated_at: String(r.updated_at || '')
  }))
}

export async function crearCreditoVenta(payload = {}) {
  await ensureSchema()

  const fecha = parseDate(payload.fecha)
  const localidad = cleanText(payload.localidad, 120)
  const telefono = cleanPhone(payload.telefono)
  const monto = Number(payload.monto_solicitado || 0)
  const concreta = Boolean(payload.concreta_venta)
  const financieras = payload.financieras && typeof payload.financieras === 'object' ? payload.financieras : {}

  if (!localidad || !telefono) throw new Error('Faltan datos requeridos: localidad, telefono')

  const result = await execute(
    `INSERT INTO ventas_creditos (fecha, localidad, telefono, monto_solicitado, concreta_venta, financieras_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fecha, localidad, telefono, monto, concreta ? 1 : 0, JSON.stringify(financieras)]
  )

  return { ok: true, id: Number(result?.insertId || 0) }
}

export async function actualizarCreditoVenta(payload = {}) {
  await ensureSchema()

  const id = Number(payload.id)
  if (!id) throw new Error('ID inválido')

  const fecha = parseDate(payload.fecha)
  const localidad = cleanText(payload.localidad, 120)
  const telefono = cleanPhone(payload.telefono)
  const monto = Number(payload.monto_solicitado || 0)
  const concreta = Boolean(payload.concreta_venta)
  const financieras = payload.financieras && typeof payload.financieras === 'object' ? payload.financieras : {}

  await execute(
    `UPDATE ventas_creditos
     SET fecha = ?, localidad = ?, telefono = ?, monto_solicitado = ?, concreta_venta = ?, financieras_json = ?
     WHERE id = ?`,
    [fecha, localidad, telefono, monto, concreta ? 1 : 0, JSON.stringify(financieras), id]
  )

  return { ok: true }
}

export async function borrarCreditoVenta(payload = {}) {
  await ensureSchema()
  const id = Number(payload.id)
  if (!id) throw new Error('ID inválido')
  await execute('DELETE FROM ventas_creditos WHERE id = ?', [id])
  return { ok: true }
}

function parseMonth(value) {
  const raw = String(value || '').trim()
  const match = /^(\d{4})-(\d{2})$/.exec(raw)
  const now = new Date()
  const year = match ? Number(match[1]) : now.getUTCFullYear()
  const month = match ? Number(match[2]) : now.getUTCMonth() + 1

  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return { mes: `${year}-${String(month).padStart(2, '0')}`, desde: from, hasta: to }
}

export async function exportarMesCompleto(payload = {}) {
  await ensureSchema()
  const range = parseMonth(payload?.mes || payload)

  const [motos, creditos, reservas, aprontes] = await Promise.all([
    execute(
      `SELECT id, fecha, apronte_id, marca, modelo, cliente, telefono, comentario, vendedor, estado, created_at, updated_at
       FROM ventas_motos
       WHERE fecha >= ? AND fecha <= ?
       ORDER BY fecha, id`,
      [range.desde, range.hasta]
    ),
    execute(
      `SELECT id, fecha, localidad, telefono, monto_solicitado, concreta_venta, financieras_json, created_at, updated_at
       FROM ventas_creditos
       WHERE fecha >= ? AND fecha <= ?
       ORDER BY fecha, id`,
      [range.desde, range.hasta]
    ),
    execute(
      `SELECT id, nombre, cedula, telefono, marca, modelo, fecha, hora, estado, tipo_turno
       FROM reservas
       WHERE fecha >= ? AND fecha <= ?
       ORDER BY fecha, hora, id`,
      [range.desde, range.hasta]
    ),
    execute(
      `SELECT id, nombre, telefono, marca, modelo, fecha, hora, estado, factura
       FROM aprontes
       WHERE fecha >= ? AND fecha <= ?
       ORDER BY fecha, hora, id`,
      [range.desde, range.hasta]
    )
  ])

  return {
    ok: true,
    mes: range.mes,
    rango: { desde: range.desde, hasta: range.hasta },
    motos: motos || [],
    creditos: (creditos || []).map((c) => ({
      ...c,
      financieras: (() => {
        try {
          return JSON.parse(String(c.financieras_json || '{}'))
        } catch {
          return {}
        }
      })()
    })),
    reservas: reservas || [],
    aprontes: aprontes || []
  }
}
