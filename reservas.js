import { execute, withTransaction } from './db.js'
import { registrarMarcaModelo } from './motos.js'
import { normalizeDate, normalizeHora, normalizeMatricula, normalizeText } from './utils.js'
import {
  obtenerEstadoId,
  obtenerTipoTurnoId,
  obtenerVehiculoCodigoId,
  registrarVehiculoEvento,
  upsertVehiculoCliente
} from './db-structure.js'
import {
  assertCanCreateReserva,
  assertCanDeleteReserva,
  assertCanEditReservaNotes,
  assertCanMoveReserva,
  getActor,
  isTallerRole
} from './access-control.js'

function buildReservaMutationInput(anterior, incoming, actorRole) {
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

function canonicalTipoTurno(value) {
  const v = normalizeText(value)
  if (v === 'garantia') return 'Garantia'
  if (v === 'particular') return 'Particular'
  return String(value || '').trim()
}

function canonicalGarantiaTipo(value) {
  const v = normalizeText(value)
  if (v === 'service') return 'Service'
  if (v === 'reparacion') return 'Reparacion'
  return String(value || '').trim()
}

function canonicalParticularTipo(value) {
  const v = normalizeText(value)
  if (v === 'service') return 'Service'
  if (v === 'taller') return 'Taller'
  return String(value || '').trim()
}

function codigoTipoTurno(value) {
  const raw = normalizeText(value).toLowerCase()
  if (raw.includes('garant')) return 'garantia'
  if (raw.includes('particular')) return 'particular'
  return 'toma'
}

function codigoEstadoReserva(value) {
  const raw = normalizeText(value).toLowerCase()
  if (raw.includes('revision')) return 'en_revision'
  if (raw.includes('pronto')) return 'pronto'
  if (raw.includes('cancel')) return 'cancelado'
  return 'pendiente'
}

function normalizeCedula(value) {
  return String(value || '').replace(/\D/g, '')
}

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

async function upsertClienteMysql(conn, data) {
  const cedula = normalizeCedula(data.cedula)
  if (!cedula) return null
  const [rows] = await conn.execute('SELECT id FROM clientes WHERE cedula = ? LIMIT 1', [cedula])
  const id = rows[0]?.id
  if (id) {
    await conn.execute('UPDATE clientes SET nombre = ?, telefono = ? WHERE id = ?', [data.nombre, data.telefono, id])
    return Number(id)
  }
  const [result] = await conn.execute('INSERT INTO clientes (cedula, nombre, telefono) VALUES (?, ?, ?)', [cedula, data.nombre, data.telefono])
  return Number(result.insertId)
}

function upsertClienteSqlite(db, data) {
  const cedula = normalizeCedula(data.cedula)
  if (!cedula) return null
  const existente = db.prepare('SELECT id FROM clientes WHERE cedula = ? LIMIT 1').get(cedula)
  if (existente?.id) {
    db.prepare('UPDATE clientes SET nombre = ?, telefono = ? WHERE id = ?').run(data.nombre, data.telefono, existente.id)
    return Number(existente.id)
  }
  const result = db.prepare('INSERT INTO clientes (cedula, nombre, telefono) VALUES (?, ?, ?)').run(cedula, data.nombre, data.telefono)
  return Number(result.lastInsertRowid)
}

async function upsertVehiculoMysql(conn, data) {
  const matricula = normalizeMatricula(data.matricula).slice(0, 10)
  const codVehiculoId = await obtenerVehiculoCodigoId(conn, {
    marca: data.marca,
    modelo: data.modelo,
    tipo: data.tipo || 'moto'
  })
  return upsertVehiculoCliente(conn, {
    clienteId: data.clienteId,
    codVehiculo: codVehiculoId,
    motor: data.motor || data.numeroMotor || '',
    chasis: data.chasis || '',
    matricula,
    color: data.color || '',
    fechaCompra: data.fechaCompra || null
  })
}

function upsertVehiculoSqlite(db, data) {
  const matricula = normalizeMatricula(data.matricula).slice(0, 10)
  const tipo = String(data.tipo || 'moto').trim().toLowerCase()
  const marca = String(data.marca || '').trim().toLowerCase()
  const modelo = String(data.modelo || '').trim().toLowerCase()
  if (!marca || !modelo) {
    return null
  }
  const existenteCatalogo = db.prepare('SELECT cod FROM vehiculo_cod WHERE marca = ? AND modelo = ? AND tipo = ? LIMIT 1').get(marca, modelo, tipo)
  let codVehiculoId = existenteCatalogo?.cod ? Number(existenteCatalogo.cod) : null
  if (!codVehiculoId) {
    const inserted = db.prepare('INSERT INTO vehiculo_cod (marca, modelo, tipo) VALUES (?, ?, ?)').run(marca, modelo, tipo)
    codVehiculoId = Number(inserted.lastInsertRowid)
  }

  const existente = db.prepare('SELECT id FROM vehiculos_cliente WHERE matricula = ? LIMIT 1').get(matricula)
  if (existente?.id) {
    db.prepare(
      `UPDATE vehiculos_cliente
       SET cod_vehiculo = ?, motor = ?, chasis = ?, color = ?, fecha_compra = ?
       WHERE id = ?`
    ).run(codVehiculoId, data.motor || data.numeroMotor || '', data.chasis || '', data.color || '', data.fechaCompra || null, existente.id)
    return Number(existente.id)
  }
  const result = db.prepare(
    `INSERT INTO vehiculos_cliente (cliente_id, cod_vehiculo, motor, chasis, matricula, color, fecha_compra)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(data.clienteId, codVehiculoId, data.motor || data.numeroMotor || '', data.chasis || '', matricula || null, data.color || '', data.fechaCompra || null)
  return Number(result.lastInsertRowid)
}

export async function listarClientes(filtro = '') {
  const search = String(filtro || '').trim().toLowerCase()
  const cedulaLike = normalizeCedula(filtro)
  const params = []
  const whereParts = []
  const reservasByClienteId = await hasColumn('reservas', 'cliente_id')

  const reservasCountSql = reservasByClienteId
    ? '(SELECT COUNT(*) FROM reservas r WHERE r.cliente_id = c.id) AS total_reservas'
    : "(SELECT COUNT(*) FROM reservas r WHERE REPLACE(REPLACE(REPLACE(IFNULL(r.cedula, ''), '.', ''), '-', ''), ' ', '') = c.cedula) AS total_reservas"

  const ultimaReservaSql = reservasByClienteId
    ? '(SELECT MAX(r2.fecha) FROM reservas r2 WHERE r2.cliente_id = c.id) AS ultima_reserva_fecha'
    : "(SELECT MAX(r2.fecha) FROM reservas r2 WHERE REPLACE(REPLACE(REPLACE(IFNULL(r2.cedula, ''), '.', ''), '-', ''), ' ', '') = c.cedula) AS ultima_reserva_fecha"

  if (search) {
    whereParts.push('(LOWER(c.nombre) LIKE ? OR LOWER(IFNULL(c.localidad, "")) LIKE ? OR c.cedula LIKE ?)')
    params.push(`%${search}%`, `%${search}%`, `%${cedulaLike || search}%`)
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''

  const rows = await execute(
    `SELECT
       c.id,
       c.cedula,
       c.nombre,
       c.telefono,
       c.localidad,
       c.created_at,
       (SELECT COUNT(*) FROM vehiculos_cliente v WHERE v.cliente_id = c.id) AS total_vehiculos,
       ${reservasCountSql},
       (SELECT COUNT(*) FROM aprontes a WHERE a.cliente_id = c.id) AS total_aprontes,
       ${ultimaReservaSql},
       (SELECT MAX(a2.fecha) FROM aprontes a2 WHERE a2.cliente_id = c.id) AS ultimo_apronte_fecha
     FROM clientes c
     ${whereSql}
     ORDER BY c.nombre ASC, c.id ASC`,
    params
  )

  return rows
}

export async function obtenerClienteDetalle(input) {
  const clienteId = Number(input)
  const cedula = normalizeCedula(input)
  let cliente = null
  const reservasByClienteId = await hasColumn('reservas', 'cliente_id')
  const reservasDetalleColumn = await hasColumn('reservas', 'detalle') ? 'detalle' : 'detalles'

  if (Number.isInteger(clienteId) && clienteId > 0) {
    const rows = await execute('SELECT * FROM clientes WHERE id = ? LIMIT 1', [clienteId])
    cliente = rows[0] ?? null
  } else if (cedula) {
    const rows = await execute('SELECT * FROM clientes WHERE cedula = ? LIMIT 1', [cedula])
    cliente = rows[0] ?? null
  }

  if (!cliente) {
    return { cliente: null, vehiculos: [], reservas: [], aprontes: [] }
  }

  const vehiculos = await execute(
    `SELECT
       v.id,
       v.cliente_id,
       v.cod_vehiculo,
       v.motor,
       v.chasis,
       v.matricula,
       v.color,
       v.fecha_compra,
       v.created_at,
       vc.marca AS dt_vehiculo_marca,
       vc.modelo AS dt_vehiculo_modelo,
       vc.tipo AS dt_vehiculo_tipo
     FROM vehiculos_cliente v
     LEFT JOIN vehiculo_cod vc ON vc.cod = v.cod_vehiculo
     ORDER BY v.matricula ASC, v.id ASC`,
    [cliente.id]
  )

  const reservasRows = await execute(
    `SELECT
       id,
       fecha,
       hora,
       estado,
       tipo_turno,
       particular_tipo,
       garantia_tipo,
       marca,
       modelo,
       matricula,
       km,
       ${reservasDetalleColumn} AS detalles,
       created_at
     FROM reservas
     ${reservasByClienteId ? 'WHERE cliente_id = ?' : "WHERE REPLACE(REPLACE(REPLACE(IFNULL(cedula, ''), '.', ''), '-', ''), ' ', '') = ?"}
     ORDER BY fecha DESC, hora DESC, id DESC`,
    [reservasByClienteId ? cliente.id : cliente.cedula]
  )

  const aprontesRows = await execute(
    `SELECT
       id,
       fecha,
       hora,
       estado,
       marca,
       modelo,
       numero_motor,
       factura,
       observacion AS repuestos_garantia,
       created_at
     FROM aprontes
     WHERE cliente_id = ?
     ORDER BY fecha DESC, hora DESC, id DESC`,
    [cliente.id]
  )

  return { cliente, vehiculos, reservas: reservasRows || [], aprontes: aprontesRows || [] }
}

export async function guardarCliente(data = {}) {
  const cedula = normalizeCedula(data.cedula)
  const nombre = String(data.nombre || '').trim()
  const telefono = String(data.telefono || '').trim()
  const localidad = String(data.localidad || '').trim()
  const id = Number(data.id)

  if (!cedula || !nombre) {
    throw new Error('Cedula y nombre son obligatorios')
  }

  if (Number.isInteger(id) && id > 0) {
    await execute('UPDATE clientes SET cedula = ?, nombre = ?, telefono = ?, localidad = ? WHERE id = ?', [cedula, nombre, telefono, localidad, id])
    return { id }
  }

  const existenteRows = await execute('SELECT id FROM clientes WHERE cedula = ? LIMIT 1', [cedula])
  const existente = existenteRows?.[0]?.id ? Number(existenteRows[0].id) : null
  if (existente) {
    await execute('UPDATE clientes SET nombre = ?, telefono = ?, localidad = ? WHERE id = ?', [nombre, telefono, localidad, existente])
    return { id: existente }
  }

  const result = await execute('INSERT INTO clientes (cedula, nombre, telefono, localidad) VALUES (?, ?, ?, ?)', [cedula, nombre, telefono, localidad])
  return { id: Number(result?.insertId || 0) }
}

function isNumeric(value) {
  return /^\d+$/.test(String(value || '').trim())
}

function normalizeReservaInput(data) {
  const tipoTurno = canonicalTipoTurno(data.tipo_turno)
  const particularTipo = canonicalParticularTipo(data.particular_tipo)
  const garantiaTipo = canonicalGarantiaTipo(data.garantia_tipo)

  const normalized = {
    ...data,
    tipo_turno: tipoTurno,
    particular_tipo: particularTipo || null,
    garantia_tipo: garantiaTipo || null
  }

  if (tipoTurno !== 'Garantia') {
    normalized.garantia_tipo = null
    normalized.garantia_fecha_compra = null
    normalized.garantia_numero_service = null
    normalized.garantia_problema = null
  }

  if (tipoTurno !== 'Particular') {
    normalized.particular_tipo = null
  }

  return normalized
}

function validarReserva(data) {
  const tipo = canonicalTipoTurno(data.tipo_turno)

  if (tipo === 'Garantia') {
    const garantiaTipo = canonicalGarantiaTipo(data.garantia_tipo)
    if (!garantiaTipo) {
      throw new Error('Tipo de garantia requerido')
    }
    if (garantiaTipo === 'Service') {
      if (!data.garantia_numero_service) {
        throw new Error('Numero de service requerido')
      }
    } else if (garantiaTipo === 'Reparacion') {
      if (!data.garantia_problema) {
        throw new Error('Descripcion del problema requerida')
      }
    } else {
      throw new Error('Tipo de garantia invalido')
    }
  } else if (tipo === 'Particular') {
    const particularTipo = canonicalParticularTipo(data.particular_tipo)
    if (!particularTipo) {
      throw new Error('Tipo particular requerido')
    }
    if (particularTipo !== 'Service' && particularTipo !== 'Taller') {
      throw new Error('Tipo particular invalido')
    }
  }
}

function validarCondicionesSubtipo(data) {
  const tipo = canonicalTipoTurno(data.tipo_turno)
  const kmNumerico = isNumeric(data.km)

  if (tipo === 'Particular') {
    const particularTipo = canonicalParticularTipo(data.particular_tipo)
    if (particularTipo === 'Service') {
      if (!kmNumerico) {
        throw new Error('KM requerido para Particular Service')
      }
      return
    }
    if (particularTipo === 'Taller') {
      if (!String(data.detalles || '').trim()) {
        throw new Error('Detalle de reparacion requerido para Particular Taller')
      }
      return
    }
  }

  if (tipo === 'Garantia') {
    const garantiaTipo = canonicalGarantiaTipo(data.garantia_tipo)
    if (garantiaTipo === 'Service') {
      if (!kmNumerico) {
        throw new Error('KM requerido para Garantia Service')
      }
      if (!isNumeric(data.garantia_numero_service)) {
        throw new Error('Numero de service requerido para Garantia Service')
      }
      return
    }
    if (garantiaTipo === 'Reparacion') {
      if (!String(data.garantia_problema || '').trim()) {
        throw new Error('Descripcion del problema requerida para Garantia Reparacion')
      }
      return
    }
  }
}

function validateRequired(data) {
  const required = ['nombre', 'telefono', 'marca', 'modelo', 'matricula', 'tipo_turno', 'fecha', 'hora']
  for (const key of required) {
    if (!String(data[key] || '').trim()) {
      throw new Error('Campo requerido: ' + key)
    }
  }
}

export async function crearReserva(data) {
  const actor = getActor(data)
  assertCanCreateReserva(actor.role)
  validateRequired(data)
  validarReserva(data)
  validarCondicionesSubtipo(data)

  const normalized = normalizeReservaInput({ ...data })
  const fechaNormalizada = normalizeDate(normalized.fecha)
  const horaNormalizada = normalizeHora(normalized.hora)
  const matriculaNormalizada = normalizeMatricula(normalized.matricula).slice(0, 10)
  if (matriculaNormalizada && !/^[A-Z0-9]{3,10}$/.test(matriculaNormalizada)) {
    throw new Error('Matricula invalida')
  }

  return withTransaction(async (conn) => {
    const clienteId = await upsertClienteMysql(conn, {
      cedula: normalized.cedula,
      nombre: normalized.nombre,
      telefono: normalized.telefono
    })

    const tipoTurnoId = await obtenerTipoTurnoId(conn, codigoTipoTurno(normalized.tipo_turno))
    const estadoId = await obtenerEstadoId(conn, 'dt_estado_reserva', codigoEstadoReserva('pendiente'))

    let vehiculoId = Number(normalized.vehiculo_id || 0)
    if (!vehiculoId) {
      vehiculoId = await upsertVehiculoMysql(conn, {
        clienteId,
        matricula: matriculaNormalizada,
        marca: normalized.marca,
        modelo: normalized.modelo,
        nombre: normalized.nombre,
        telefono: normalized.telefono,
        numeroMotor: normalized.numero_motor,
        color: normalized.color,
        fechaCompra: normalized.garantia_fecha_compra,
        tipo: 'moto'
      })
    }

    const [result] = await conn.execute(
      `INSERT INTO reservas (
        cliente_id, vehiculo_id, mecanico_id,
        nombre, cedula, telefono, marca, modelo, matricula, km,
        tipo_turno_id, tipo_turno, particular_tipo, garantia_tipo,
        fecha_compra, nro_servicio, problema,
        fecha, hora, detalle, estado_id, estado, ingreso_id
      )
      VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL )`,
      [
        clienteId,
        vehiculoId || null,
        data?.mecanico_id ?? null,
        normalized.nombre,
        normalized.cedula || '',
        normalized.telefono,
        normalized.marca,
        normalized.modelo,
        matriculaNormalizada,
        normalized.km || '',
        tipoTurnoId,
        normalized.tipo_turno,
        normalized.particular_tipo ?? null,
        normalized.garantia_tipo ?? null,
        normalized.garantia_fecha_compra ?? null,
        normalized.garantia_numero_service ?? null,
        normalized.garantia_problema ?? null,
        fechaNormalizada,
        horaNormalizada,
        normalized.detalles ?? ''
        ,estadoId,
        codigoEstadoReserva('pendiente')
      ]
    )

    const reservaId = Number(result.insertId)

    await registrarVehiculoEvento(conn, {
      clienteId,
      vehiculoId,
      reservaId,
      tipoEvento: 'reserva',
      fechaEvento: new Date(),
      titulo: 'Reserva creada',
      detalle: normalized.detalles ?? '',
      km: normalized.km || '',
      tipo_turno: normalized.tipo_turno,
      particular_tipo: normalized.particular_tipo ?? '',
      garantia_tipo: normalized.garantia_tipo ?? '',
      garantia_fecha_compra: normalized.garantia_fecha_compra ?? '',
      garantia_numero_service: normalized.garantia_numero_service ?? '',
      garantia_problema: normalized.garantia_problema ?? '',
      numero_motor: normalized.numero_motor ?? '',
      factura: normalized.factura ?? '',
      color: normalized.color ?? ''
    })

    try {
      await registrarMarcaModelo(conn, normalized.marca, normalized.modelo)
    } catch (error) {
      console.warn('[Reservas] No se pudo registrar marca/modelo:', error)
    }

    return reservaId
  })
}

export async function obtenerReserva(id) {
  const rows = await execute('SELECT * FROM reservas WHERE id = ?', [id])
  return rows[0] ?? null
}

export async function borrarReserva(input) {
  const payload = typeof input === 'object' && input !== null ? input : { id: input }
  const actor = getActor(payload)
  assertCanDeleteReserva(actor.role)
  const reservaId = Number(payload?.id || input)
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM reservas WHERE id = ?', [reservaId])
    const reserva = rows[0]
    if (!reserva) return

    await conn.execute('DELETE FROM vehiculo_eventos WHERE reserva_id = ?', [reservaId])
    await conn.execute('DELETE FROM reservas WHERE id = ?', [reservaId])
  })
}

export async function moverReserva(idOrPayload, nuevaFecha, nuevaHora) {
  const payload = typeof idOrPayload === 'object' && idOrPayload !== null
    ? idOrPayload
    : { id: idOrPayload, nuevaFecha, nuevaHora }
  const actor = getActor(payload)
  assertCanMoveReserva(actor.role)
  const reservaId = Number(payload?.id || idOrPayload)
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT fecha, hora, cliente_id, vehiculo_id, detalle FROM reservas WHERE id = ?',
      [reservaId]
    )
    const anterior = rows[0]
    if (!anterior) return

    const fechaNormalizada = normalizeDate(payload?.nuevaFecha)
    const horaNormalizada = payload?.nuevaHora ? normalizeHora(payload.nuevaHora) : null

    await conn.execute(
      'UPDATE reservas SET fecha = ?, hora = COALESCE( ?, hora) WHERE id = ?',
      [fechaNormalizada, horaNormalizada, reservaId]
    )

    await conn.execute(
      `INSERT INTO vehiculo_eventos (cliente_id, vehiculo_id, reserva_id, tipo_evento, fecha_evento, titulo, detalle)
       VALUES (?, ?, ?, 'reserva', NOW(), 'Reserva reprogramada', ?)`,
      [anterior.cliente_id, anterior.vehiculo_id, reservaId, `Fecha: ${anterior.fecha} -> ${fechaNormalizada}; Hora: ${anterior.hora} -> ${horaNormalizada || anterior.hora}`]
    )
  })
}

export async function actualizarReserva(idOrPayload, reserva) {
  const incomingPayload = typeof idOrPayload === 'object' && idOrPayload !== null
    ? idOrPayload
    : (reserva || {})
  const actor = getActor(incomingPayload)
  const reservaId = Number((typeof idOrPayload === 'object' ? idOrPayload?.id : idOrPayload) || incomingPayload?.id || 0)
  if (!reservaId) {
    throw new Error('ID de reserva invalido')
  }

  const matriculaNormalizada = normalizeMatricula(incomingPayload?.matricula || '').slice(0, 10)
  if (matriculaNormalizada && !/^[A-Z0-9]{3,10}$/.test(matriculaNormalizada)) {
    throw new Error('Matricula invalida')
  }

  const fechaNormalizada = normalizeDate(incomingPayload?.fecha)
  const horaNormalizada = normalizeHora(incomingPayload?.hora)

  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT nombre, cedula, telefono, marca, modelo, km, matricula,
              tipo_turno, particular_tipo, garantia_tipo, garantia_fecha_compra,
              garantia_numero_service, garantia_problema, fecha, hora, estado, detalles, cliente_id, vehiculo_id
       FROM reservas WHERE id = ?`,
      [reservaId]
    )
    const anterior = rows[0]
    if (!anterior) return

    const merged = buildReservaMutationInput(anterior, incomingPayload, actor.role)
    const normalized = normalizeReservaInput({ ...merged })
    const matriculaNormalizada = normalizeMatricula(merged?.matricula || '').slice(0, 10)
    if (matriculaNormalizada && !/^[A-Z0-9]{3,10}$/.test(matriculaNormalizada)) {
      throw new Error('Matricula invalida')
    }
    const payload = {
      nombre: normalized.nombre ?? '',
      cedula: normalized.cedula ?? '',
      telefono: normalized.telefono ?? '',
      marca: normalized.marca ?? '',
      modelo: normalized.modelo ?? '',
      km: normalized.km ?? '',
      matricula: matriculaNormalizada || anterior.matricula || '',
      tipo_turno: normalized.tipo_turno ?? '',
      particular_tipo: normalized.particular_tipo ?? null,
      garantia_tipo: normalized.garantia_tipo ?? null,
      garantia_fecha_compra: normalized.garantia_fecha_compra ?? null,
      garantia_numero_service: normalized.garantia_numero_service ?? null,
      garantia_problema: normalized.garantia_problema ?? null,
      fecha: fechaNormalizada,
      hora: horaNormalizada,
      estado: merged?.estado ?? anterior.estado,
      detalles: normalized.detalles ?? ''
    }

    await conn.execute(
      `UPDATE reservas
       SET nombre = ?, cedula = ?, telefono = ?, marca = ?, modelo = ?, km = ?, matricula = ?,
           tipo_turno = ?, particular_tipo = ?, garantia_tipo = ?, garantia_fecha_compra = ?,
           garantia_numero_service = ?, garantia_problema = ?, fecha = ?, hora = ?, estado = ?, detalles = ?
       WHERE id = ?`,
      [
        payload.nombre,
        payload.cedula,
        payload.telefono,
        payload.marca,
        payload.modelo,
        payload.km,
        payload.matricula,
        payload.tipo_turno,
        payload.particular_tipo ?? null,
        payload.garantia_tipo ?? null,
        payload.garantia_fecha_compra ?? null,
        payload.garantia_numero_service ?? null,
        payload.garantia_problema ?? null,
        payload.fecha,
        payload.hora,
        payload.estado,
        payload.detalles,
        reservaId
      ]
    )

    try {
      await registrarMarcaModelo(conn, payload.marca, payload.modelo)
    } catch (error) {
      console.warn('[Reservas] No se pudo registrar marca/modelo:', error)
    }

    await conn.execute(
      `INSERT INTO vehiculo_eventos (cliente_id, vehiculo_id, reserva_id, tipo_evento, fecha_evento, titulo, detalle, km, tipo_turno, particular_tipo, garantia_tipo, garantia_fecha_compra, garantia_numero_service, garantia_problema, numero_motor, factura)
       VALUES (?, ?, ?, 'reserva', NOW(), 'Reserva actualizada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        anterior.cliente_id,
        anterior.vehiculo_id,
        reservaId,
        payload.detalles || '',
        payload.km || '',
        payload.tipo_turno || '',
        payload.particular_tipo ?? null,
        payload.garantia_tipo ?? null,
        payload.garantia_fecha_compra ?? null,
        payload.garantia_numero_service ?? null,
        payload.garantia_problema ?? null,
        payload.matricula || '',
        payload.detalles || ''
      ]
    )
  })
}

export async function actualizarEstadoReserva(idOrPayload, estado) {
  const payload = typeof idOrPayload === 'object' && idOrPayload !== null
    ? idOrPayload
    : { id: idOrPayload, estado }

  const reservaId = Number(payload?.id || idOrPayload || 0)
  const nuevoEstado = String(payload?.estado || estado || '').trim()

  if (!reservaId) {
    throw new Error('ID de reserva invalido')
  }

  if (!nuevoEstado) {
    throw new Error('Estado requerido')
  }

  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT estado, cliente_id, vehiculo_id FROM reservas WHERE id = ?',
      [reservaId]
    )
    const anterior = rows[0]
    if (!anterior) return

    await conn.execute(
      'UPDATE reservas SET estado = ? WHERE id = ?',
      [nuevoEstado, reservaId]
    )

    await conn.execute(
      `INSERT INTO vehiculo_eventos (cliente_id, vehiculo_id, reserva_id, tipo_evento, fecha_evento, titulo, detalle)
       VALUES (?, ?, ?, 'reserva', NOW(), 'Estado de reserva', ?)`,
      [anterior.cliente_id, anterior.vehiculo_id, reservaId, `${anterior.estado || ''} -> ${nuevoEstado}`]
    )
  })
}

export async function obtenerReservasSemana(desde, hasta) {
  const desdeNormalizado = normalizeDate(desde)
  const hastaNormalizado = normalizeDate(hasta)
  const rows = await execute(
    `SELECT * FROM reservas
     WHERE fecha >= ? AND fecha <= ?
     ORDER BY fecha, hora`,
    [desdeNormalizado, hastaNormalizado]
  )
  return rows
}

export async function obtenerReservasPorFecha(fecha) {
  const fechaNormalizada = normalizeDate(fecha)
  const rows = await execute(
    `SELECT * FROM reservas
     WHERE fecha = ?
     ORDER BY hora`,
    [fechaNormalizada]
  )
  return rows
}

export async function obtenerTodasLasReservas() {
  const rows = await execute(
    'SELECT * FROM reservas ORDER BY fecha DESC, hora DESC'
  )
  return rows
}

export async function actualizarNotasReserva(id, notas) {
  const payload = typeof id === 'object' && id !== null ? id : { id, notas }
  const actor = getActor(payload)
  assertCanEditReservaNotes(actor.role)
  const reservaId = Number(payload?.id || id)
  const nextNotas = String(payload?.notas ?? notas ?? '')
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT notas FROM reservas WHERE id = ?', [reservaId])
    const anterior = rows[0]
    if (!anterior) return

    await conn.execute('UPDATE reservas SET notas = ? WHERE id = ?', [nextNotas, reservaId])
    await conn.execute(
      `INSERT INTO vehiculo_eventos (cliente_id, vehiculo_id, reserva_id, tipo_evento, fecha_evento, titulo, detalle)
       SELECT cliente_id, vehiculo_id, id, 'reserva', NOW(), 'Notas de reserva', ?
       FROM reservas WHERE id = ?`,
      [nextNotas, reservaId]
    )
  })
}

export async function obtenerCambiosReservas(since, lastId, limit) {
  const sinceValue = since || new Date(0).toISOString()
  const lastValue = Number(lastId || 0)
  const limitValue = Number(limit || 200)

  const rows = await execute(
    `SELECT e.id, e.reserva_id, e.tipo_evento AS campo, e.titulo AS valor_anterior, e.detalle AS valor_nuevo, e.fecha_evento AS fecha,
            r.nombre, r.fecha AS reserva_fecha, r.hora AS reserva_hora
     FROM vehiculo_eventos e
     LEFT JOIN reservas r ON r.id = e.reserva_id
     WHERE e.tipo_evento = 'reserva' AND (e.fecha_evento > ? OR (e.fecha_evento = ? AND e.id > ?))
     ORDER BY e.fecha_evento ASC, e.id ASC
     LIMIT ?`,
    [sinceValue, sinceValue, lastValue, limitValue]
  )
  return rows
}


