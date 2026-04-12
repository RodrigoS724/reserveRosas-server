import { execute, withTransaction } from './db.js'
import { registrarMarcaModelo } from './motos.js'
import { normalizeDate, normalizeHora } from './utils.js'

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

function ensureNotFutureDate(dateIso) {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const todayIso = `${y}-${m}-${d}`
  if (String(dateIso || '') > todayIso) {
    throw new Error('No se pueden seleccionar fechas de aprontes posteriores a hoy')
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
    `ALTER TABLE aprontes ADD COLUMN garantia_espera_desde DATETIME NULL`,
    `ALTER TABLE aprontes ADD COLUMN garantia_notificada TINYINT DEFAULT 0`,
    `ALTER TABLE aprontes ADD COLUMN garantia_notificada_at DATETIME NULL`
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
  validateRequired(data)
  const payload = normalizeAprontePayload(data)
  const fechaNormalizada = normalizeDate(payload.fecha)
  const horaNormalizada = normalizeHora(payload.hora)
  ensureNotFutureDate(fechaNormalizada)

  return withTransaction(async (conn) => {
    await validarCupoDisponible(conn, fechaNormalizada, horaNormalizada)

    const [result] = await conn.execute(
      `INSERT INTO aprontes (
        nombre, fecha, hora,
        telefono, localidad, observaciones,
        marca, modelo, factura,
        estado, repuestos_garantia,
        correo_alerta_garantia, dias_alerta_garantia, fecha_alerta_garantia,
        garantia_espera_desde, garantia_notificada, garantia_notificada_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.nombre,
        fechaNormalizada,
        horaNormalizada,
        payload.telefono,
        payload.localidad,
        payload.observaciones,
        payload.marca,
        payload.modelo,
        payload.factura,
        payload.estado,
        payload.repuestos_garantia,
        payload.correo_alerta_garantia,
        payload.dias_alerta_garantia,
        payload.fecha_alerta_garantia,
        payload.estado === 'ENTREGADA ESPERA DE GARANTIA' ? new Date() : null,
        0,
        null
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
    'SELECT * FROM aprontes ORDER BY fecha DESC, hora DESC'
  )
  return rows
}

export async function actualizarApronte(id, data) {
  await ensureAprontesSchema()
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

    const merged = {
      ...anterior,
      ...data
    }

    validateRequired(merged)
    const payload = normalizeAprontePayload(merged)
    const fechaNormalizada = normalizeDate(payload.fecha)
    const horaNormalizada = normalizeHora(payload.hora)
    ensureNotFutureDate(fechaNormalizada)
    const estadoAnterior = normalizeEstadoApronte(anterior.estado)
    const estadoNuevo = normalizeEstadoApronte(payload.estado)
    const entraEspera = estadoNuevo === 'ENTREGADA ESPERA DE GARANTIA' && estadoAnterior !== 'ENTREGADA ESPERA DE GARANTIA'
    const saleEspera = estadoNuevo !== 'ENTREGADA ESPERA DE GARANTIA'

    const mismoHorario = fechaNormalizada === anterior.fecha && horaNormalizada === anterior.hora
    if (!mismoHorario) {
      await validarCupoDisponible(conn, fechaNormalizada, horaNormalizada, apronteId)
    }

    await conn.execute(
      `UPDATE aprontes
       SET nombre = ?, fecha = ?, hora = ?,
           telefono = ?, localidad = ?, observaciones = ?,
           marca = ?, modelo = ?, factura = ?,
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

export async function borrarApronte(id) {
  await ensureAprontesSchema()
  await execute('DELETE FROM aprontes WHERE id = ?', [id])
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




