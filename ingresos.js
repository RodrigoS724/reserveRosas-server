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

async function resolveReserva(input = {}) {
  const reservaId = Number(input.reserva_id ?? input.reservaId ?? 0)
  if (!Number.isInteger(reservaId) || reservaId <= 0) return null

  const rows = await execute('SELECT * FROM reservas WHERE id = ? LIMIT 1', [reservaId])
  return rows[0] ?? null
}

async function getReservaDetalleColumn() {
  return hasColumn('reservas', 'detalle') ? 'detalle' : 'detalles'
}

async function ensureIngresosSchema() {
  if (schemaReady) return

  await execute(`
    CREATE TABLE IF NOT EXISTS ingresos (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      cliente_id BIGINT UNSIGNED NOT NULL,
      reserva_id BIGINT UNSIGNED NULL,
      fecha_ingreso DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_egreso DATETIME NULL,
      historia VARCHAR(255) NULL,
      INDEX idx_ingresos_cliente (cliente_id),
      INDEX idx_ingresos_reserva (reserva_id)
    )
  `)

  await ensureColumn('ingresos', 'historia', 'VARCHAR(255) NULL AFTER fecha_egreso')

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

function pickVehiculoData(input = {}, reserva = null) {
  return {
    vehiculo_id: Number(input.vehiculo_id ?? input.vehiculoId ?? reserva?.vehiculo_id ?? 0) || null,
    vehiculo_marca: normalizeText(input.vehiculo_marca ?? input.marca ?? reserva?.marca ?? '', 255) || null,
    vehiculo_modelo: normalizeText(input.vehiculo_modelo ?? input.modelo ?? reserva?.modelo ?? '', 255) || null,
    vehiculo_color: normalizeText(input.vehiculo_color ?? input.color ?? reserva?.color ?? '', 255) || null,
    vehiculo_matricula: normalizeText(input.vehiculo_matricula ?? input.matricula ?? reserva?.matricula ?? '', 255) || null,
    vehiculo_motor: normalizeText(input.vehiculo_motor ?? input.numero_motor ?? input.motor ?? reserva?.numero_motor ?? '', 255) || null
  }
}

function pickClienteData(input = {}, reserva = null) {
  return {
    cliente_correo: normalizeText(input.cliente_correo ?? input.email ?? input.correo ?? reserva?.cliente_correo ?? '', 255) || null
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

function buildHistoria(input = {}, reserva = null, cliente = null) {
  const piezas = [
    input.historia,
    reserva ? `Reserva ${reserva.id}${reserva.fecha ? ` ${reserva.fecha}` : ''}${reserva.hora ? ` ${reserva.hora}` : ''}` : null,
    cliente ? `${cliente.nombre || ''} ${cliente.cedula || ''}`.trim() : null,
    input.marca || input.modelo || input.matricula ? `${input.marca || ''} ${input.modelo || ''} ${input.matricula || ''}`.trim() : null,
    input.comentarios,
    input.observaciones
  ]
    .map((value) => normalizeText(value || '', 255))
    .filter(Boolean)

  return piezas.join(' | ').slice(0, 255) || null
}

async function resolveCliente(input, reserva = null) {
  const clienteId = Number(input?.cliente_id ?? input?.clienteId ?? 0)
  if (Number.isInteger(clienteId) && clienteId > 0) {
    const rows = await execute('SELECT * FROM clientes WHERE id = ? LIMIT 1', [clienteId])
    return rows[0] ?? null
  }
  if (Number.isInteger(Number(reserva?.cliente_id || 0)) && Number(reserva?.cliente_id || 0) > 0) {
    const rows = await execute('SELECT * FROM clientes WHERE id = ? LIMIT 1', [Number(reserva.cliente_id)])
    return rows[0] ?? null
  }
  return obtenerClientePorIdOCedula(execute, input?.cedula ?? input?.cliente ?? input?.clienteId ?? input)
}

export async function listarIngresos() {
  await ensureIngresosSchema()
  const reservaDetalleColumn = await getReservaDetalleColumn()
  return execute(
    `SELECT i.id, i.cliente_id, i.reserva_id, i.fecha_ingreso, i.fecha_egreso, i.historia,
            i.fecha_ingreso AS fecha_actual,
            c.cedula AS cliente_cedula, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
            r.fecha AS reserva_fecha, r.hora AS reserva_hora, r.${reservaDetalleColumn} AS reserva_detalles, r.estado AS reserva_estado
     FROM ingresos i
     INNER JOIN clientes c ON c.id = i.cliente_id
     LEFT JOIN reservas r ON r.id = i.reserva_id
     ORDER BY i.fecha_ingreso DESC, i.id DESC`
  )
}

export async function obtenerIngresosPorCliente(input) {
  await ensureIngresosSchema()
  const reservaDetalleColumn = await getReservaDetalleColumn()
  const cliente = await resolveCliente(input)
  if (!cliente?.id) return []

  return execute(
    `SELECT i.id, i.cliente_id, i.reserva_id, i.fecha_ingreso, i.fecha_egreso, i.historia,
            i.fecha_ingreso AS fecha_actual,
            c.cedula AS cliente_cedula, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
            r.fecha AS reserva_fecha, r.hora AS reserva_hora, r.${reservaDetalleColumn} AS reserva_detalles, r.estado AS reserva_estado
     FROM ingresos i
     INNER JOIN clientes c ON c.id = i.cliente_id
     LEFT JOIN reservas r ON r.id = i.reserva_id
     WHERE i.cliente_id = ?
     ORDER BY i.fecha_ingreso DESC, i.id DESC`,
    [cliente.id]
  )
}

export async function obtenerIngreso(id) {
  await ensureIngresosSchema()
  const reservaDetalleColumn = await getReservaDetalleColumn()
  const rows = await execute(
      `SELECT i.id, i.cliente_id, i.reserva_id, i.fecha_ingreso, i.fecha_egreso, i.historia,
        i.fecha_ingreso AS fecha_actual,
        c.cedula AS cliente_cedula, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
            r.fecha AS reserva_fecha, r.hora AS reserva_hora, r.${reservaDetalleColumn} AS reserva_detalles, r.estado AS reserva_estado
     FROM ingresos i
     INNER JOIN clientes c ON c.id = i.cliente_id
     LEFT JOIN reservas r ON r.id = i.reserva_id
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

  const reserva = await resolveReserva(input)
  if (reserva?.ingreso_id) {
    return obtenerIngreso(reserva.ingreso_id)
  }

  const cliente = await resolveCliente(input, reserva)
  if (!cliente?.id) {
    throw new Error('Cliente requerido')
  }

  const reservaId = Number(input.reserva_id ?? input.reservaId ?? reserva?.id ?? 0)
  const fechaIngreso = input.fecha_ingreso || input.fechaIngreso || input.fecha_actual || input.fechaActual || new Date()
  const historia = buildHistoria(input, reserva, cliente)

  const result = await withTransaction(async (conn) => {
    const [insertResult] = await conn.execute(
      `INSERT INTO ingresos (
        cliente_id, reserva_id, fecha_ingreso, fecha_egreso, historia
       )
       VALUES (?, NULLIF(?, 0), COALESCE(NULLIF(?, ''), NOW()), NULL, ?)` ,
      [
        cliente.id,
        reservaId,
        fechaIngreso,
        historia
      ]
    )

    const ingresoId = Number(insertResult.insertId)
    if (reservaId) {
      await conn.execute('UPDATE reservas SET ingreso_id = ? WHERE id = ? AND (ingreso_id IS NULL OR ingreso_id = 0)', [ingresoId, reservaId])
    }

    return ingresoId
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

  const reserva = await resolveReserva(input)
  const cliente = await resolveCliente(input, reserva)
  if (!cliente?.id) {
    throw new Error('Cliente requerido')
  }

  const reservaId = Number(input.reserva_id ?? input.reservaId ?? reserva?.id ?? 0)
  const fechaIngreso = input.fecha_ingreso || input.fechaIngreso || input.fecha_actual || input.fechaActual || null
  const fechaEgreso = input.fecha_egreso || input.fechaEgreso || null
  const historia = buildHistoria(input, reserva, cliente)

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE ingresos
       SET cliente_id = ?,
           reserva_id = NULLIF(?, 0),
           fecha_ingreso = COALESCE(NULLIF(?, ''), fecha_ingreso),
           fecha_egreso = COALESCE(NULLIF(?, ''), fecha_egreso),
           historia = COALESCE(NULLIF(?, ''), historia)
       WHERE id = ?`,
      [
        cliente.id,
        reservaId,
        fechaIngreso,
        fechaEgreso,
        historia,
        ingresoId
      ]
    )

    if (reservaId) {
      await conn.execute('UPDATE reservas SET ingreso_id = ? WHERE id = ? AND (ingreso_id IS NULL OR ingreso_id = 0)', [ingresoId, reservaId])
    }
  })

  return obtenerIngreso(ingresoId)
}

export async function registrarEgreso(input = {}) {
  await ensureIngresosSchema()
  const actor = getActor(input)
  if (isTallerRole(actor.role)) {
    throw new Error('El taller no puede registrar egresos')
  }

  const reserva = await resolveReserva(input)
  const ingresoId = Number(input.id ?? input.ingreso_id ?? input.ingresoId ?? reserva?.ingreso_id ?? 0)
  if (!ingresoId) {
    throw new Error('Ingreso requerido')
  }

  const fechaEgreso = input.fecha_egreso || input.fechaEgreso || new Date()

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE ingresos
       SET fecha_egreso = COALESCE(?, fecha_egreso)
       WHERE id = ?`,
        [fechaEgreso, ingresoId]
    )
  })

  return obtenerIngreso(ingresoId)
}