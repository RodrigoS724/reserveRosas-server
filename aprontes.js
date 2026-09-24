import { execute, withTransaction } from './db.js'
import { registrarMarcaModelo } from './motos.js'
import { normalizeDate, normalizeHora } from './utils.js'
import {
  obtenerEstadoId,
  obtenerVehiculoCodigoId,
  registrarVehiculoEvento,
  upsertCliente,
  upsertVehiculoCliente
} from './db-structure.js'
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
  'LISTA PARA ENTREGAR',
  'ENTREGADA',
  'ENTREGADA ESPERA DE GARANTIA'
])

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

function cleanText(value, maxLen = 255) {
  const text = String(value || '').trim()
  return text.length > maxLen ? text.slice(0, maxLen) : text
}

function cleanOptionalDate(value) {
  const text = String(value || '').trim()
  return text || null
}

function normalizeEstado(value) {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')

  if (!raw) return 'APRONTE'
  if (raw === 'LISTO PARA ENTREGAR') return 'LISTA PARA ENTREGAR'
  if (raw === 'ENTREGADA ESPERA DE GARATIA') return 'ENTREGADA ESPERA DE GARANTIA'
  if (raw === 'ENTREGADA ESPERA GARANTIA') return 'ENTREGADA ESPERA DE GARANTIA'
  if (raw === 'ESPERA DE GARANTIA') return 'ENTREGADA ESPERA DE GARANTIA'
  return raw
}

function readSection(input, sectionName) {
  const section = input?.[sectionName]
  return section && typeof section === 'object' ? section : {}
}

class Cliente {
  constructor(data = {}) {
    const cliente = readSection(data, 'cliente')
    this.nombre = cleanText(cliente.nombre ?? data.nombre ?? '', 255)
    this.telefono = cleanText(cliente.telefono ?? data.telefono ?? '', 30)
    this.localidad = cleanText(cliente.localidad ?? data.localidad ?? '', 100)
  }
}

class Vehiculo {
  constructor(data = {}) {
    const vehiculo = readSection(data, 'vehiculo')
    this.matricula = cleanText(vehiculo.matricula ?? data.matricula ?? '', 50)
    this.marca = cleanText(vehiculo.marca ?? data.marca ?? '', 100)
    this.modelo = cleanText(vehiculo.modelo ?? data.modelo ?? '', 100)
    this.numeroMotor = cleanText(vehiculo.numero_motor ?? vehiculo.numeroMotor ?? data.numero_motor ?? '', 100)
  }
}

class Apronte {
  constructor(data = {}) {
    const apronte = readSection(data, 'apronte')
    this.nombre = cleanText(apronte.nombre ?? data.nombre ?? '', 255)
    this.telefono = cleanText(apronte.telefono ?? data.telefono ?? '', 30)
    this.localidad = cleanText(apronte.localidad ?? data.localidad ?? '', 100)
    this.observaciones = cleanText(apronte.observaciones ?? apronte.observacion ?? data.observaciones ?? data.observacion ?? '', 500)
    this.marca = cleanText(apronte.marca ?? data.marca ?? '', 100)
    this.modelo = cleanText(apronte.modelo ?? data.modelo ?? '', 100)
    this.numeroMotor = cleanText(apronte.numero_motor ?? apronte.numeroMotor ?? data.numero_motor ?? '', 100)
    this.factura = cleanText(apronte.factura ?? data.factura ?? '', 100)
    this.estado = normalizeEstado(apronte.estado ?? data.estado)
    this.repuestosGarantia = cleanText(apronte.repuestos_garantia ?? data.repuestos_garantia ?? '', 1000)
    this.correoAlertaGarantia = cleanText(apronte.correo_alerta_garantia ?? data.correo_alerta_garantia ?? '', 255)
    this.diasAlertaGarantia = Number(apronte.dias_alerta_garantia ?? data.dias_alerta_garantia ?? 7) || 7
    this.fechaAlertaGarantia = cleanOptionalDate(apronte.fecha_alerta_garantia ?? data.fecha_alerta_garantia)
  }
}

function buildApronteDomain(data = {}) {
  return {
    cliente: new Cliente(data),
    vehiculo: new Vehiculo(data),
    apronte: new Apronte(data)
  }
}

function normalizeEstadoApronte(value) {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')

  if (!raw) return 'APRONTE'
  if (raw === 'LISTO PARA ENTREGAR') return 'LISTA PARA ENTREGAR'
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

function buildApronteDomainPayload(data) {
  return buildApronteDomain(data)
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
    `CREATE TABLE IF NOT EXISTS clientes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      cedula VARCHAR(20) NOT NULL UNIQUE,
      nombre VARCHAR(255) NOT NULL,
      telefono VARCHAR(30) NULL,
      localidad VARCHAR(100) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS dt_estado_apronte (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(40) NOT NULL UNIQUE,
      nombre VARCHAR(100) NOT NULL,
      orden INT NOT NULL DEFAULT 0,
      activo TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS horarios_aprontes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      hora VARCHAR(10) NOT NULL UNIQUE,
      cupo INT NOT NULL DEFAULT 1,
      activo TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `INSERT IGNORE INTO dt_estado_apronte (codigo, nombre, orden) VALUES
      ('pendiente', 'Pendiente', 1),
      ('en_revision', 'En revision', 2),
      ('pronto', 'Pronto', 3),
      ('cancelado', 'Cancelado', 4)` ,
    `CREATE TABLE IF NOT EXISTS vehiculo_cod (
      cod BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      marca VARCHAR(100) NOT NULL,
      modelo VARCHAR(100) NOT NULL,
      tipo ENUM('moto', 'bicicleta', 'otro') NOT NULL DEFAULT 'moto',
      activo TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_vehiculo_cod (marca, modelo, tipo)
    )`,
    `CREATE TABLE IF NOT EXISTS vehiculos_cliente (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      cliente_id BIGINT UNSIGNED NOT NULL,
      cod_vehiculo BIGINT UNSIGNED NULL,
      motor VARCHAR(100) NULL,
      chasis VARCHAR(100) NULL,
      matricula VARCHAR(20) NULL,
      color VARCHAR(50) NULL,
      fecha_compra DATE NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_vehiculo_matricula (matricula)
    )`,
    `CREATE TABLE IF NOT EXISTS aprontes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      cliente_id BIGINT UNSIGNED NOT NULL,
      vehiculo_id BIGINT UNSIGNED NULL,
      mecanico_id BIGINT UNSIGNED NULL,
      nombre VARCHAR(255) NULL,
      fecha DATE NOT NULL,
      hora VARCHAR(10) NOT NULL,
      telefono VARCHAR(30) NULL,
      localidad VARCHAR(100) NULL,
      observaciones TEXT NULL,
      marca VARCHAR(100) NULL,
      modelo VARCHAR(100) NULL,
      numero_motor VARCHAR(100) NULL,
      factura VARCHAR(100) NULL,
      estado VARCHAR(60) NOT NULL DEFAULT 'APRONTE',
      repuestos_garantia TEXT NULL,
      correo_alerta_garantia VARCHAR(255) NULL,
      dias_alerta_garantia INT NOT NULL DEFAULT 7,
      fecha_alerta_garantia DATE NULL,
      garantia_espera_desde DATETIME NULL,
      garantia_notificada TINYINT NOT NULL DEFAULT 0,
      garantia_notificada_at DATETIME NULL,
      created_by_username VARCHAR(255) NULL,
      created_by_role VARCHAR(50) NULL,
      caja_aprobado TINYINT NOT NULL DEFAULT 1,
      caja_aprobado_at DATETIME NULL,
      caja_aprobado_por VARCHAR(255) NULL,
      estado_id BIGINT UNSIGNED NOT NULL,
      ingreso_id BIGINT UNSIGNED NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
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

function validarReglaFinDeSemana(fechaIso, hora) {
  const day = new Date(`${fechaIso}T00:00:00`).getDay()
  if (day === 0) {
    throw new Error('Los domingos no se agendan aprontes')
  }
  if (day === 6 && horaEnMinutos(hora) > 12 * 60) {
    throw new Error('Los sabados solo se permiten horarios hasta las 12:00')
  }
}

function validarNoPasadoSegunFechaHora(fechaIso, hora) {
  const fechaHora = new Date(`${fechaIso}T${hora}:00`)
  if (Number.isNaN(fechaHora.getTime())) {
    throw new Error('Formato de fecha u hora invalido')
  }
  if (fechaHora.getTime() < Date.now()) {
    throw new Error('No se pueden seleccionar fechas y horas de aprontes anteriores al momento actual')
  }
}

function validarFechaAgendaApronteCreacion(fechaIso, hora) {
  // Al crear, solo se permite ahora/futuro y se bloquea pasado.
  validarNoPasadoSegunFechaHora(fechaIso, hora)
  // Se mantienen restricciones de agenda en fin de semana.
  validarReglaFinDeSemana(fechaIso, hora)
}

async function validarCupoDisponible(conn, fecha, hora, excludeId = null) {
  const [horRows] = await conn.execute(
    'SELECT cupo FROM horarios_aprontes WHERE hora = ? AND activo = 1',
    [hora]
  )

  await ensureColumn('aprontes', 'observaciones', 'TEXT NULL')
  await ensureColumn('aprontes', 'observacion', 'TEXT NULL')
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
  validarFechaAgendaApronteCreacion(fechaNormalizada, horaNormalizada)
  const creatorRole = normalizeRole(actor.role)
  const cajaAprobado = requiresCajaApproval(creatorRole) ? 0 : 1
  const cajaAprobadoPor = cajaAprobado ? (actor.username || null) : null
  const { cliente, vehiculo, apronte } = buildApronteDomainPayload(payload)

  return withTransaction(async (conn) => {
    await validarCupoDisponible(conn, fechaNormalizada, horaNormalizada)

    const clienteId = await upsertCliente(conn, {
      cedula: data.cedula,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      localidad: cliente.localidad
    })

    let vehiculoId = Number(data.vehiculo_id || 0)
    if (!vehiculoId) {
      const codVehiculoId = await obtenerVehiculoCodigoId(conn, {
        marca: vehiculo.marca,
        modelo: vehiculo.modelo,
        tipo: 'moto'
      })
      vehiculoId = await upsertVehiculoCliente(conn, {
        clienteId,
        codVehiculo: codVehiculoId,
        motor: vehiculo.numeroMotor || '',
        matricula: vehiculo.matricula || '',
        color: data.color || '',
        fechaCompra: data.fecha_compra || null
      })
    }

    const estadoId = await obtenerEstadoId(conn, 'dt_estado_apronte', 'pendiente')

    const [result] = await conn.execute(
      `INSERT INTO aprontes (
        cliente_id, vehiculo_id, mecanico_id, nombre, fecha, hora,
        telefono, localidad, observacion,
        marca, modelo, numero_motor, factura,
        estado, repuestos_garantia,
        correo_alerta_garantia, dias_alerta_garantia, fecha_alerta_garantia,
        garantia_espera_desde, garantia_notificada, garantia_notificada_at,
        created_by_username, created_by_role, caja_aprobado, caja_aprobado_at, caja_aprobado_por,
        estado_id, ingreso_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)` ,
      [
        clienteId,
        vehiculoId,
        data?.mecanico_id ?? null,
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
        apronte.estado === 'ENTREGADA ESPERA DE GARANTIA' ? new Date() : null,
        0,
        null,
        actor.username || null,
        creatorRole,
        cajaAprobado,
        cajaAprobado ? new Date() : null,
        cajaAprobadoPor,
        estadoId
      ]
    )

    await registrarVehiculoEvento(conn, {
      clienteId,
      vehiculoId,
      apronteId: Number(result.insertId),
      tipoEvento: 'apronte',
      fechaEvento: new Date(),
      titulo: 'Apronte creado',
      detalle: payload.observaciones,
      numero_motor: payload.numero_motor,
      factura: payload.factura,
      color: data.color || ''
    })

    try {
      await registrarMarcaModelo(conn, payload.marca, payload.modelo)
    } catch (error) {
      console.warn('[Aprontes] No se pudo registrar marca/modelo:', error)
    }

    return { apronteId: Number(result.insertId), clienteId, vehiculoId }
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




