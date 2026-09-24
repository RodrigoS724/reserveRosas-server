import { execute, withTransaction } from './db.js'
import { getActor, isTallerRole } from './access-control.js'
import { obtenerClientePorIdOCedula } from './db-structure.js'

let schemaReady = false

async function hasColumn(tableName, columnName) {
  const rows = await execute(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  )
  return Number(rows?.[0]?.total || 0) > 0
}

async function ensureColumn(tableName, columnName, definition) {
  if (await hasColumn(tableName, columnName)) return
  await execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

async function ensureIngresosSchema() {
  if (schemaReady) return

  await execute(`
    CREATE TABLE IF NOT EXISTS ingresos (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      cliente_id BIGINT UNSIGNED NOT NULL,
      reserva_id BIGINT UNSIGNED NULL,
      vehiculo_id BIGINT UNSIGNED NULL,
      vehiculo_marca VARCHAR(255) NULL,
      vehiculo_modelo VARCHAR(255) NULL,
      vehiculo_color VARCHAR(255) NULL,
      vehiculo_matricula VARCHAR(255) NULL,
      vehiculo_motor VARCHAR(255) NULL,
      cliente_correo VARCHAR(255) NULL,
      fecha_actual DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_salida DATETIME NULL,
      fecha_egreso DATETIME NULL,
      monto DECIMAL(12,2) NOT NULL DEFAULT 0,
      trabajo_realizado TEXT NULL,
      numero_servicios VARCHAR(255) NULL,
      comentarios TEXT NULL,
      observaciones TEXT NULL,
      checklist_ingreso_json LONGTEXT NULL,
      checklist_egreso_json LONGTEXT NULL,
      trabajos_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ingresos_cliente (cliente_id),
      INDEX idx_ingresos_reserva (reserva_id)
    )
  `)

  await ensureColumn('ingresos', 'vehiculo_id', 'BIGINT UNSIGNED NULL')
  await ensureColumn('ingresos', 'vehiculo_marca', 'VARCHAR(255) NULL')
  await ensureColumn('ingresos', 'vehiculo_modelo', 'VARCHAR(255) NULL')
  await ensureColumn('ingresos', 'vehiculo_color', 'VARCHAR(255) NULL')
  await ensureColumn('ingresos', 'vehiculo_matricula', 'VARCHAR(255) NULL')
  await ensureColumn('ingresos', 'vehiculo_motor', 'VARCHAR(255) NULL')
  await ensureColumn('ingresos', 'cliente_correo', 'VARCHAR(255) NULL')
  await ensureColumn('ingresos', 'fecha_salida', 'DATETIME NULL')
  await ensureColumn('ingresos', 'numero_servicios', 'VARCHAR(255) NULL')
  await ensureColumn('ingresos', 'comentarios', 'TEXT NULL')
  await ensureColumn('ingresos', 'observaciones', 'TEXT NULL')
  await ensureColumn('ingresos', 'checklist_ingreso_json', 'LONGTEXT NULL')
  await ensureColumn('ingresos', 'checklist_egreso_json', 'LONGTEXT NULL')
  await ensureColumn('ingresos', 'trabajos_json', 'LONGTEXT NULL')

  schemaReady = true
}

function normalizeMonto(value) {
  const monto = Number(value)
  if (!Number.isFinite(monto) || monto < 0) return 0
  return Math.round(monto * 100) / 100
}

function normalizeText(value, maxLen = 4000) {
  const text = String(value || '').trim()
  return text.length > maxLen ? text.slice(0, maxLen) : text
}

function normalizeJson(value, fallback = '{}') {
  if (value == null || value === '') return fallback
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

function pickVehiculoData(input = {}) {
  return {
    vehiculo_id: Number(input.vehiculo_id ?? input.vehiculoId ?? 0) || null,
    vehiculo_marca: normalizeText(input.vehiculo_marca ?? input.marca ?? '', 255) || null,
    vehiculo_modelo: normalizeText(input.vehiculo_modelo ?? input.modelo ?? '', 255) || null,
    vehiculo_color: normalizeText(input.vehiculo_color ?? input.color ?? '', 255) || null,
    vehiculo_matricula: normalizeText(input.vehiculo_matricula ?? input.matricula ?? '', 255) || null,
    vehiculo_motor: normalizeText(input.vehiculo_motor ?? input.numero_motor ?? input.motor ?? '', 255) || null
  }
}

function pickClienteData(input = {}) {
  return {
    cliente_correo: normalizeText(input.cliente_correo ?? input.email ?? input.correo ?? '', 255) || null
  }
}

function pickClienteData(input = {}) {
  return {
    cliente_correo: normalizeText(input.cliente_correo ?? input.email ?? input.correo ?? '', 255) || null
  }
}

function pickServicioPayload(input = {}) {
  return {
    numero_servicios: normalizeText(input.numero_servicios ?? input.numeroServicios ?? '', 255) || null,
    comentarios: normalizeText(input.comentarios ?? '', 4000) || null,
    observaciones: normalizeText(input.observaciones ?? '', 4000) || null,
    checklist_ingreso_json: normalizeJson(input.checklist_ingreso ?? input.checklistIngreso ?? {}),
    checklist_egreso_json: normalizeJson(input.checklist_egreso ?? input.checklistEgreso ?? {}),
    trabajos_json: normalizeJson(input.trabajos ?? [])
  }
}

async function resolveCliente(input) {
  const clienteId = Number(input?.cliente_id ?? input?.clienteId ?? 0)
  if (Number.isInteger(clienteId) && clienteId > 0) {
    const rows = await execute('SELECT * FROM clientes WHERE id = ? LIMIT 1', [clienteId])
    return rows[0] ?? null
  }
  return obtenerClientePorIdOCedula(execute, input?.cedula ?? input?.cliente ?? input?.clienteId ?? input)
}

export async function listarIngresos() {
  await ensureIngresosSchema()
  return execute(
    `SELECT i.*, c.cedula AS cliente_cedula, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
     FROM ingresos i
     INNER JOIN clientes c ON c.id = i.cliente_id
     ORDER BY i.fecha_actual DESC, i.id DESC`
  )
}

export async function obtenerIngresosPorCliente(input) {
  await ensureIngresosSchema()
  const cliente = await resolveCliente(input)
  if (!cliente?.id) return []

  return execute(
    `SELECT i.*, c.cedula AS cliente_cedula, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
     FROM ingresos i
     INNER JOIN clientes c ON c.id = i.cliente_id
     WHERE i.cliente_id = ?
     ORDER BY i.fecha_actual DESC, i.id DESC`,
    [cliente.id]
  )
}

export async function obtenerIngreso(id) {
  await ensureIngresosSchema()
  const rows = await execute(
    `SELECT i.*, c.cedula AS cliente_cedula, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
     FROM ingresos i
     INNER JOIN clientes c ON c.id = i.cliente_id
     WHERE i.id = ?
     LIMIT 1`,
    [Number(id)]
  )
  return rows[0] ?? null
}

export async function crearIngreso(input = {}) {
  await ensureIngresosSchema()
  const actor = getActor(input)
  if (isTallerRole(actor.role)) {
    throw new Error('El taller no puede registrar ingresos')
  }

  const cliente = await resolveCliente(input)
  if (!cliente?.id) {
    throw new Error('Cliente requerido')
  }

  const reservaId = Number(input.reserva_id ?? input.reservaId ?? 0)
  const monto = normalizeMonto(input.monto)
  const trabajoRealizado = normalizeText(input.trabajo_realizado ?? input.trabajoRealizado ?? '', 4000) || null
  const vehiculo = pickVehiculoData(input)
  const clienteDatos = pickClienteData(input)
  const servicio = pickServicioPayload(input)
  const fechaSalida = input.fecha_salida || input.fechaSalida || null

  const result = await withTransaction(async (conn) => {
    const [insertResult] = await conn.execute(
      `INSERT INTO ingresos (
        cliente_id, reserva_id, vehiculo_id, vehiculo_marca, vehiculo_modelo, vehiculo_color, vehiculo_matricula, vehiculo_motor, cliente_correo,
        fecha_actual, fecha_salida, fecha_egreso, monto, trabajo_realizado, numero_servicios, comentarios, observaciones,
        checklist_ingreso_json, checklist_egreso_json, trabajos_json
       )
       VALUES (?, NULLIF(?, 0), ?, ?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), NOW()), ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        cliente.id,
        reservaId,
        vehiculo.vehiculo_id,
        vehiculo.vehiculo_marca,
        vehiculo.vehiculo_modelo,
        vehiculo.vehiculo_color,
        vehiculo.vehiculo_matricula,
        vehiculo.vehiculo_motor,
        clienteDatos.cliente_correo,
        input.fecha_actual || input.fechaActual || null,
        fechaSalida,
        monto,
        trabajoRealizado,
        servicio.numero_servicios,
        servicio.comentarios,
        servicio.observaciones,
        servicio.checklist_ingreso_json,
        servicio.checklist_egreso_json,
        servicio.trabajos_json
      ]
    )
    return Number(insertResult.insertId)
  })

  return obtenerIngreso(result)
}

export async function actualizarIngreso(input = {}) {
  await ensureIngresosSchema()
  const actor = getActor(input)
  if (isTallerRole(actor.role)) {
    throw new Error('El taller no puede editar ingresos')
  }

  const ingresoId = Number(input.id ?? input.ingreso_id ?? input.ingresoId ?? 0)
  if (!ingresoId) {
    throw new Error('Ingreso requerido')
  }

  const cliente = await resolveCliente(input)
  if (!cliente?.id) {
    throw new Error('Cliente requerido')
  }

  const reservaId = Number(input.reserva_id ?? input.reservaId ?? 0)
  const monto = normalizeMonto(input.monto)
  const trabajoRealizado = normalizeText(input.trabajo_realizado ?? input.trabajoRealizado ?? '', 4000) || null
  const vehiculo = pickVehiculoData(input)
  const clienteDatos = pickClienteData(input)
  const servicio = pickServicioPayload(input)
  const fechaSalida = input.fecha_salida || input.fechaSalida || null

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE ingresos
       SET cliente_id = ?,
           reserva_id = NULLIF(?, 0),
           vehiculo_id = ?,
           vehiculo_marca = ?,
           vehiculo_modelo = ?,
           vehiculo_color = ?,
           vehiculo_matricula = ?,
           vehiculo_motor = ?,
           cliente_correo = ?,
           fecha_actual = COALESCE(NULLIF(?, ''), fecha_actual),
           fecha_salida = COALESCE(NULLIF(?, ''), fecha_salida),
           fecha_egreso = COALESCE(NULLIF(?, ''), fecha_egreso),
           monto = ?,
           trabajo_realizado = ?,
           numero_servicios = ?,
           comentarios = ?,
           observaciones = ?,
           checklist_ingreso_json = ?,
           checklist_egreso_json = ?,
           trabajos_json = ?
       WHERE id = ?`,
      [
        cliente.id,
        reservaId,
        vehiculo.vehiculo_id,
        vehiculo.vehiculo_marca,
        vehiculo.vehiculo_modelo,
        vehiculo.vehiculo_color,
        vehiculo.vehiculo_matricula,
        vehiculo.vehiculo_motor,
        clienteDatos.cliente_correo,
        input.fecha_actual || input.fechaActual || null,
        fechaSalida,
        input.fecha_egreso || input.fechaEgreso || null,
        monto,
        trabajoRealizado,
        servicio.numero_servicios,
        servicio.comentarios,
        servicio.observaciones,
        servicio.checklist_ingreso_json,
        servicio.checklist_egreso_json,
        servicio.trabajos_json,
        ingresoId
      ]
    )
  })

  return obtenerIngreso(ingresoId)
}

export async function registrarEgreso(input = {}) {
  await ensureIngresosSchema()
  const actor = getActor(input)
  if (isTallerRole(actor.role)) {
    throw new Error('El taller no puede registrar egresos')
  }

  const ingresoId = Number(input.id ?? input.ingreso_id ?? input.ingresoId ?? 0)
  if (!ingresoId) {
    throw new Error('Ingreso requerido')
  }

  const fechaEgreso = input.fecha_egreso || input.fechaEgreso || new Date()
  const monto = input.monto == null ? null : normalizeMonto(input.monto)
  const trabajoRealizado = input.trabajo_realizado == null && input.trabajoRealizado == null
    ? null
    : normalizeText(input.trabajo_realizado ?? input.trabajoRealizado ?? '', 4000)
  const clienteDatos = pickClienteData(input)
  const servicio = pickServicioPayload(input)

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE ingresos
       SET fecha_egreso = COALESCE(?, fecha_egreso),
           monto = COALESCE(?, monto),
           trabajo_realizado = COALESCE(?, trabajo_realizado),
           cliente_correo = COALESCE(?, cliente_correo),
           checklist_egreso_json = COALESCE(NULLIF(?, ''), checklist_egreso_json),
           trabajos_json = COALESCE(NULLIF(?, ''), trabajos_json),
           observaciones = COALESCE(NULLIF(?, ''), observaciones)
       WHERE id = ?`,
        [fechaEgreso, monto, trabajoRealizado, clienteDatos.cliente_correo, servicio.checklist_egreso_json, servicio.trabajos_json, servicio.observaciones, ingresoId]
    )
  })

  return obtenerIngreso(ingresoId)
}