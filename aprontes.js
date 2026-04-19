import { execute, withTransaction } from './db.js'
import { registrarMarcaModelo } from './motos.js'
import { normalizeDate, normalizeHora } from './utils.js'
import {
  assertCanCreateApronte,
  assertCanDeleteApronte,
  canApproveApronte,
  getActor,
  isTallerRole,
  normalizeRole,
  requiresCajaApproval
} from './access-control.js'

const ESTADOS_APRONTE = new Set([
  'APRONTE',
  'ENTREGADA',
  'ENTREGADA ESPERA DE GARANTIA'
])

let schemaReady = false

function normalizeEstadoApronte(value) {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')

  if (!raw) return 'APRONTE'
  if (raw === 'ENTREGADA ESPERA DE GARATIA') return 'ENTREGADA ESPERA DE GARANTIA'
  if (raw === 'ENTREGADA ESPERA GARANTIA') return 'ENTREGADA ESPERA DE GARANTIA'
  if (raw === 'ESPERA DE GARANTIA') return 'ENTREGADA ESPERA DE GARANTIA'
  if (ESTADOS_APRONTE.has(raw)) return raw
  return 'APRONTE'
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email) return ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function normalizeDiasAlerta(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 7
  const days = Math.floor(n)
  if (days < 1) return 1
  if (days > 90) return 90
  return days
}

function normalizeOptionalDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  return normalizeDate(raw)
}

function buildApronteMutationInput(anterior, incoming, actorRole) {
  if (isTallerRole(actorRole)) {
    return {
      ...anterior,
      estado: incoming?.estado ?? anterior?.estado
    }
  }
  return {
    ...anterior,
    ...incoming
  }
}

async function ensureAprontesSchema() {
  if (schemaReady) return

  const statements = [
    `ALTER TABLE aprontes ADD COLUMN estado VARCHAR(60) DEFAULT 'APRONTE'`,
    `ALTER TABLE aprontes ADD COLUMN repuestos_garantia TEXT`,
    `ALTER TABLE aprontes ADD COLUMN correo_alerta_garantia VARCHAR(255)`,
    `ALTER TABLE aprontes ADD COLUMN dias_alerta_garantia INT DEFAULT 7`,
    `ALTER TABLE aprontes ADD COLUMN fecha_alerta_garantia DATE NULL`,
    `ALTER TABLE aprontes ADD COLUMN numero_motor VARCHAR(100)`,
    `ALTER TABLE aprontes ADD COLUMN garantia_espera_desde DATETIME NULL`,
    `ALTER TABLE aprontes ADD COLUMN garantia_notificada TINYINT DEFAULT 0`,
    `ALTER TABLE aprontes ADD COLUMN garantia_notificada_at DATETIME NULL`,
    `ALTER TABLE aprontes ADD COLUMN created_by_username VARCHAR(255) NULL`,
    `ALTER TABLE aprontes ADD COLUMN created_by_role VARCHAR(50) NULL`,
    `ALTER TABLE aprontes ADD COLUMN caja_aprobado TINYINT DEFAULT 1`,
    `ALTER TABLE aprontes ADD COLUMN caja_aprobado_at DATETIME NULL`,
    `ALTER TABLE aprontes ADD COLUMN caja_aprobado_por VARCHAR(255) NULL`
  ]

  for (const sql of statements) {
    try {
      await execute(sql)
    } catch (error) {
      const msg = String(error?.message || '').toLowerCase()
      if (!msg.includes('duplicate column')) {
        throw error
      }
    }
  }

  schemaReady = true
}

function cleanText(value, maxLen = 255) {
  const text = String(value || '').trim()
  return text.length > maxLen ? text.slice(0, maxLen) : text
}

function validateRequired(data) {
  const required = ['nombre', 'telefono', 'localidad', 'marca', 'modelo', 'factura', 'fecha', 'hora']
  for (const key of required) {
    if (!String(data[key] || '').trim()) {
      throw new Error('Campo requerido: ' + key)
    }
  }
}

function normalizeAprontePayload(data) {
  const estado = normalizeEstadoApronte(data.estado)
  const correoAlerta = normalizeEmail(data.correo_alerta_garantia)
  const diasAlerta = normalizeDiasAlerta(data.dias_alerta_garantia)

  return {
    nombre: cleanText(data.nombre, 255),
    telefono: cleanText(data.telefono, 30),
    localidad: cleanText(data.localidad, 100),
    observaciones: cleanText(data.observaciones, 500),
    marca: cleanText(data.marca, 100),
    modelo: cleanText(data.modelo, 100),
    numero_motor: cleanText(data.numero_motor, 100),
    factura: cleanText(data.factura, 100),
    estado,
    repuestos_garantia: cleanText(data.repuestos_garantia, 1000),
    correo_alerta_garantia: correoAlerta,
    dias_alerta_garantia: diasAlerta,
    fecha_alerta_garantia: normalizeOptionalDate(data.fecha_alerta_garantia),
    fecha: data.fecha,
    hora: data.hora
  }
}

function horaEnMinutos(hora) {
  const parts = String(hora || '').split(':')
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error('Formato de hora invalido')
  }
  return h * 60 + m
}

function obtenerHoyIsoLocal() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function validarNoPasado(fechaIso) {
  const hoyIso = obtenerHoyIsoLocal()
  if (String(fechaIso || '') < hoyIso) {
    throw new Error('No se pueden seleccionar fechas de aprontes anteriores a hoy')
  }
}

function validarReglaFinDeSemana(fechaIso, hora) {
  const day = new Date(`${fechaIso}T00:00:00`).getDay()
  if (day === 0) {
    throw new Error('Los domingos no se agendan aprontes')
  }
  if (day === 6 && horaEnMinutos(hora) > 12 * 60) {
    throw new Error('Los sabados solo se permiten horarios hasta las 12:00')
  }
}

function validarFechaAgendaApronte(fechaIso, hora) {
  // Misma logica de agenda: permitir hoy/futuro y bloquear pasado.
  validarNoPasado(fechaIso)
  // Se mantienen restricciones de agenda en fin de semana.
  validarReglaFinDeSemana(fechaIso, hora)
}

async function validarCupoDisponible(conn, fecha, hora, excludeId = null) {
  const [horRows] = await conn.execute(
    'SELECT cupo FROM horarios_aprontes WHERE hora = ? AND activo = 1',
    [hora]
  )
  if (!horRows.length) {
    throw new Error('Horario de apronte no disponible')
  }

  const cupo = Number(horRows[0].cupo || 0)
  if (cupo < 1) {
    throw new Error('Cupo invalido para el horario')
  }

  const params = [fecha, hora]
  let sql = 'SELECT COUNT(*) AS total FROM aprontes WHERE fecha = ? AND hora = ?'
  if (excludeId) {
    sql += ' AND id <> ?'
    params.push(excludeId)
  }
  const [countRows] = await conn.execute(sql, params)
  const usados = Number(countRows[0]?.total || 0)
  if (usados >= cupo) {
    throw new Error('No hay cupos disponibles para ese horario')
  }
}

export async function crearApronte(data) {
  await ensureAprontesSchema()
  const actor = getActor(data)
  assertCanCreateApronte(actor.role)
  validateRequired(data)
  const payload = normalizeAprontePayload(data)
  const fechaNormalizada = normalizeDate(payload.fecha)
  const horaNormalizada = normalizeHora(payload.hora)
  validarFechaAgendaApronte(fechaNormalizada, horaNormalizada)
  const creatorRole = normalizeRole(actor.role)
  const cajaAprobado = requiresCajaApproval(creatorRole) ? 0 : 1
  const cajaAprobadoPor = cajaAprobado ? (actor.username || null) : null

  return withTransaction(async (conn) => {
    await validarCupoDisponible(conn, fechaNormalizada, horaNormalizada)

    const [result] = await conn.execute(
      `INSERT INTO aprontes (
        nombre, fecha, hora,
        telefono, localidad, observaciones,
        marca, modelo, numero_motor, factura,
        estado, repuestos_garantia,
        correo_alerta_garantia, dias_alerta_garantia, fecha_alerta_garantia,
        garantia_espera_desde, garantia_notificada, garantia_notificada_at,
        created_by_username, created_by_role, caja_aprobado, caja_aprobado_at, caja_aprobado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        payload.nombre,
        fechaNormalizada,
        horaNormalizada,
        payload.telefono,
        payload.localidad,
        payload.observaciones,
        payload.marca,
        payload.modelo,
        payload.numero_motor,
        payload.factura,
        payload.estado,
        payload.repuestos_garantia,
        payload.correo_alerta_garantia,
        payload.dias_alerta_garantia,
        payload.fecha_alerta_garantia,
        payload.estado === 'ENTREGADA ESPERA DE GARANTIA' ? new Date() : null,
        0,
        null,
        actor.username || null,
        creatorRole,
        cajaAprobado,
        cajaAprobado ? new Date() : null,
        cajaAprobadoPor
      ]
    )

    try {
      await registrarMarcaModelo(conn, payload.marca, payload.modelo)
    } catch (error) {
      console.warn('[Aprontes] No se pudo registrar marca/modelo:', error)
    }

    return Number(result.insertId)
  })
}

export async function obtenerApronte(id) {
  await ensureAprontesSchema()
  const rows = await execute('SELECT * FROM aprontes WHERE id = ?', [id])
  return rows[0] ?? null
}

export async function obtenerAprontesPorFecha(fecha) {
  await ensureAprontesSchema()
  const fechaNormalizada = normalizeDate(fecha)
  const rows = await execute(
    `SELECT * FROM aprontes
     WHERE fecha = ?
     ORDER BY hora`,
    [fechaNormalizada]
  )
  return rows
}

export async function obtenerTodosLosAprontes() {
  await ensureAprontesSchema()
  const rows = await execute(
    `SELECT * FROM aprontes
     ORDER BY fecha DESC, hora DESC`
  )
  return rows
}

export async function actualizarApronte(id, data) {
  await ensureAprontesSchema()
  const actor = getActor(data)
  const apronteId = Number(id || data?.id || 0)
  if (!apronteId) {
    throw new Error('ID de apronte invalido')
  }

  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT * FROM aprontes WHERE id = ?',
      [apronteId]
    )
    const anterior = rows[0]
    if (!anterior) return

    const merged = buildApronteMutationInput(anterior, data, actor.role)

    validateRequired(merged)
    const payload = normalizeAprontePayload(merged)
    const fechaNormalizada = normalizeDate(payload.fecha)
    const horaNormalizada = normalizeHora(payload.hora)
    validarFechaAgendaApronte(fechaNormalizada, horaNormalizada)
    const estadoAnterior = normalizeEstadoApronte(anterior.estado)
    const estadoNuevo = normalizeEstadoApronte(payload.estado)
    const entraEspera = estadoNuevo === 'ENTREGADA ESPERA DE GARANTIA' && estadoAnterior !== 'ENTREGADA ESPERA DE GARANTIA'
    const saleEspera = estadoNuevo !== 'ENTREGADA ESPERA DE GARANTIA'
    const nextCajaAprobado = canApproveApronte(actor.role) && Object.prototype.hasOwnProperty.call(data || {}, 'caja_aprobado')
      ? (data?.caja_aprobado ? 1 : 0)
      : Number(anterior.caja_aprobado ?? 1)
    const cajaApprovalChanged = nextCajaAprobado !== Number(anterior.caja_aprobado ?? 1)

    const mismoHorario = fechaNormalizada === anterior.fecha && horaNormalizada === anterior.hora
    if (!mismoHorario) {
      await validarCupoDisponible(conn, fechaNormalizada, horaNormalizada, apronteId)
    }

    await conn.execute(
      `UPDATE aprontes
       SET nombre = ?, fecha = ?, hora = ?,
           telefono = ?, localidad = ?, observaciones = ?,
           marca = ?, modelo = ?, numero_motor = ?, factura = ?,
           estado = ?, repuestos_garantia = ?,
           correo_alerta_garantia = ?, dias_alerta_garantia = ?, fecha_alerta_garantia = ?,
           garantia_espera_desde = CASE
             WHEN ? THEN NOW()
             WHEN ? THEN NULL
             ELSE garantia_espera_desde
           END,
           garantia_notificada = CASE
             WHEN ? THEN 0
             WHEN ? THEN 0
             ELSE garantia_notificada
           END,
           garantia_notificada_at = CASE
             WHEN ? OR ? THEN NULL
             ELSE garantia_notificada_at
           END,
           caja_aprobado = ?,
           caja_aprobado_at = CASE
             WHEN ? THEN NOW()
             WHEN ? THEN NULL
             ELSE caja_aprobado_at
           END,
           caja_aprobado_por = CASE
             WHEN ? THEN ?
             WHEN ? THEN NULL
             ELSE caja_aprobado_por
           END
       WHERE id = ?`,
      [
        payload.nombre,
        fechaNormalizada,
        horaNormalizada,
        payload.telefono,
        payload.localidad,
        payload.observaciones,
        payload.marca,
        payload.modelo,
        payload.numero_motor,
        payload.factura,
        estadoNuevo,
        payload.repuestos_garantia,
        payload.correo_alerta_garantia,
        payload.dias_alerta_garantia,
        payload.fecha_alerta_garantia,
        entraEspera,
        saleEspera,
        entraEspera,
        saleEspera,
        entraEspera,
        saleEspera,
        nextCajaAprobado,
        cajaApprovalChanged && nextCajaAprobado === 1,
        cajaApprovalChanged && nextCajaAprobado === 0,
        cajaApprovalChanged && nextCajaAprobado === 1,
        actor.username || null,
        cajaApprovalChanged && nextCajaAprobado === 0,
        apronteId
      ]
    )

    try {
      await registrarMarcaModelo(conn, payload.marca, payload.modelo)
    } catch (error) {
      console.warn('[Aprontes] No se pudo registrar marca/modelo:', error)
    }
  })
}

export async function borrarApronte(input) {
  await ensureAprontesSchema()
  const payload = typeof input === 'object' && input !== null ? input : { id: input }
  const actor = getActor(payload)
  assertCanDeleteApronte(actor.role)
  const apronteId = Number(payload?.id || input)
  await execute('DELETE FROM aprontes WHERE id = ?', [apronteId])
}

export async function obtenerAprontesPendientesAlertaGarantia() {
  await ensureAprontesSchema()
  const rows = await execute(
    `SELECT id, nombre, telefono, marca, modelo, factura,
            estado, repuestos_garantia, correo_alerta_garantia,
            dias_alerta_garantia, fecha_alerta_garantia, garantia_espera_desde, fecha, hora
     FROM aprontes
     WHERE UPPER(TRIM(estado)) = 'ENTREGADA ESPERA DE GARANTIA'
       AND IFNULL(garantia_notificada, 0) = 0`
  )
  return rows
}

export async function marcarApronteGarantiaNotificado(id) {
  await ensureAprontesSchema()
  await execute(
    `UPDATE aprontes
     SET garantia_notificada = 1,
         garantia_notificada_at = NOW()
     WHERE id = ?`,
    [id]
  )
}




