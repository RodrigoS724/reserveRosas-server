import { execute, withTransaction } from './db.js'
import { registrarMarcaModelo } from './motos.js'
import { normalizeDate, normalizeHora, normalizeMatricula, normalizeText } from './utils.js'

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
    if (!data.garantia_fecha_compra) {
      throw new Error('Fecha de compra requerida')
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
      if (!String(data.garantia_fecha_compra || '').trim()) {
        throw new Error('Fecha de compra requerida para Garantia Service')
      }
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
    const [result] = await conn.execute(
      `INSERT INTO reservas (
        nombre, cedula, telefono,
        marca, modelo, km, matricula,
        tipo_turno, particular_tipo, garantia_tipo,
        garantia_fecha_compra, garantia_numero_service, garantia_problema,
        fecha, hora, detalles
      )
      VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )`,
      [
        normalized.nombre,
        normalized.cedula || '',
        normalized.telefono,
        normalized.marca,
        normalized.modelo,
        normalized.km || '',
        matriculaNormalizada,
        normalized.tipo_turno,
        normalized.particular_tipo ?? null,
        normalized.garantia_tipo ?? null,
        normalized.garantia_fecha_compra ?? null,
        normalized.garantia_numero_service ?? null,
        normalized.garantia_problema ?? null,
        fechaNormalizada,
        horaNormalizada,
        normalized.detalles ?? ''
      ]
    )

    const reservaId = Number(result.insertId)

    await conn.execute(
      `INSERT INTO historial_reservas
       (reserva_id, campo, valor_anterior, valor_nuevo, fecha)
       VALUES ( ?, 'creacion', '', 'reserva creada', NOW())`,
      [reservaId]
    )

    const [vehiculosRows] = await conn.execute(
      'SELECT id FROM vehiculos WHERE matricula = ?',
      [matriculaNormalizada]
    )

    let vehiculoId = vehiculosRows[0]?.id

    if (!vehiculoId) {
      const [vehInsert] = await conn.execute(
        `INSERT INTO vehiculos (matricula, marca, modelo, nombre, telefono)
         VALUES ( ?, ?, ?, ?, ? )`,
        [
          matriculaNormalizada,
          normalized.marca,
          normalized.modelo,
          normalized.nombre,
          normalized.telefono
        ]
      )
      vehiculoId = Number(vehInsert.insertId)
    } else {
      await conn.execute(
        `UPDATE vehiculos
         SET marca = ?, modelo = ?, nombre = ?, telefono = ?
         WHERE id = ?`,
        [
          normalized.marca,
          normalized.modelo,
          normalized.nombre,
          normalized.telefono,
          vehiculoId
        ]
      )
    }

    await conn.execute(
      `INSERT INTO vehiculos_historial (
        vehiculo_id, fecha, km, tipo_turno,
        particular_tipo, garantia_tipo, garantia_fecha_compra,
        garantia_numero_service, garantia_problema, detalles
      )
      VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )`,
      [
        vehiculoId,
        fechaNormalizada,
        normalized.km || '',
        normalized.tipo_turno,
        normalized.particular_tipo ?? null,
        normalized.garantia_tipo ?? null,
        normalized.garantia_fecha_compra ?? null,
        normalized.garantia_numero_service ?? null,
        normalized.garantia_problema ?? null,
        normalized.detalles ?? ''
      ]
    )

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

export async function borrarReserva(id) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM reservas WHERE id = ?', [id])
    const reserva = rows[0]
    if (!reserva) return

    // Delete history rows first to avoid FK constraint violation
    await conn.execute('DELETE FROM historial_reservas WHERE reserva_id = ?', [id])
    await conn.execute('DELETE FROM reservas WHERE id = ?', [id])
  })
}

export async function moverReserva(id, nuevaFecha, nuevaHora) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT fecha, hora FROM reservas WHERE id = ?',
      [id]
    )
    const anterior = rows[0]
    if (!anterior) return

    const fechaNormalizada = normalizeDate(nuevaFecha)
    const horaNormalizada = nuevaHora ? normalizeHora(nuevaHora) : null

    await conn.execute(
      'UPDATE reservas SET fecha = ?, hora = COALESCE( ?, hora) WHERE id = ?',
      [fechaNormalizada, horaNormalizada, id]
    )

    if (fechaNormalizada !== anterior.fecha) {
      await conn.execute(
        `INSERT INTO historial_reservas
         (reserva_id, campo, valor_anterior, valor_nuevo, fecha)
         VALUES ( ?, 'fecha', ?, ?, NOW())`,
        [id, anterior.fecha, fechaNormalizada]
      )
    }

    if (horaNormalizada && horaNormalizada !== anterior.hora) {
      await conn.execute(
        `INSERT INTO historial_reservas
         (reserva_id, campo, valor_anterior, valor_nuevo, fecha)
         VALUES ( ?, 'hora', ?, ?, NOW())`,
        [id, anterior.hora, horaNormalizada]
      )
    }
  })
}

export async function actualizarReserva(id, reserva) {
  const reservaId = Number(id || reserva?.id || 0)
  if (!reservaId) {
    throw new Error('ID de reserva invalido')
  }

  const matriculaNormalizada = normalizeMatricula(reserva?.matricula || '').slice(0, 10)
  if (matriculaNormalizada && !/^[A-Z0-9]{3,10}$/.test(matriculaNormalizada)) {
    throw new Error('Matricula invalida')
  }

  const fechaNormalizada = normalizeDate(reserva?.fecha)
  const horaNormalizada = normalizeHora(reserva?.hora)

  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT nombre, cedula, telefono, marca, modelo, km, matricula,
              tipo_turno, particular_tipo, garantia_tipo, garantia_fecha_compra,
              garantia_numero_service, garantia_problema, fecha, hora, estado, detalles
       FROM reservas WHERE id = ?`,
      [reservaId]
    )
    const anterior = rows[0]
    if (!anterior) return

    const merged = {
      ...anterior,
      ...reserva,
      fecha: fechaNormalizada,
      hora: horaNormalizada,
      matricula: matriculaNormalizada
    }
    const normalized = normalizeReservaInput({ ...merged })
    const payload = {
      nombre: normalized.nombre ?? '',
      cedula: normalized.cedula ?? '',
      telefono: normalized.telefono ?? '',
      marca: normalized.marca ?? '',
      modelo: normalized.modelo ?? '',
      km: normalized.km ?? '',
      matricula: matriculaNormalizada,
      tipo_turno: normalized.tipo_turno ?? '',
      particular_tipo: normalized.particular_tipo ?? null,
      garantia_tipo: normalized.garantia_tipo ?? null,
      garantia_fecha_compra: normalized.garantia_fecha_compra ?? null,
      garantia_numero_service: normalized.garantia_numero_service ?? null,
      garantia_problema: normalized.garantia_problema ?? null,
      fecha: fechaNormalizada,
      hora: horaNormalizada,
      estado: reserva?.estado ?? anterior.estado,
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

    const campos = Object.keys(anterior)
    for (const campo of campos) {
      if (anterior[campo] !== payload[campo]) {
        await conn.execute(
          `INSERT INTO historial_reservas
           (reserva_id, campo, valor_anterior, valor_nuevo, fecha)
           VALUES ( ?, ?, ?, ?, NOW())`,
          [reservaId, campo, anterior[campo], payload[campo]]
        )
      }
    }
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
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT notas FROM reservas WHERE id = ?', [id])
    const anterior = rows[0]
    if (!anterior) return

    await conn.execute('UPDATE reservas SET notas = ? WHERE id = ?', [notas, id])
    await conn.execute(
      `INSERT INTO historial_reservas
       (reserva_id, campo, valor_anterior, valor_nuevo, fecha)
       VALUES ( ?, 'notas', ?, ?, NOW())`,
      [id, anterior.notas || '', notas]
    )
  })
}

export async function obtenerCambiosReservas(since, lastId, limit) {
  const sinceValue = since || new Date(0).toISOString()
  const lastValue = Number(lastId || 0)
  const limitValue = Number(limit || 200)

  const rows = await execute(
    `SELECT h.id, h.reserva_id, h.campo, h.valor_anterior, h.valor_nuevo, h.fecha,
            r.nombre, r.fecha AS reserva_fecha, r.hora AS reserva_hora
     FROM historial_reservas h
     LEFT JOIN reservas r ON r.id = h.reserva_id
     WHERE (h.fecha > ? OR (h.fecha = ? AND h.id > ?))
     ORDER BY h.fecha ASC, h.id ASC
     LIMIT ?`,
    [sinceValue, sinceValue, lastValue, limitValue]
  )
  return rows
}


