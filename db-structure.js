import { execute } from './db.js'

function normalizeText(value, maxLen = 255) {
  const text = String(value || '').trim()
  return text.length > maxLen ? text.slice(0, maxLen) : text
}

export function normalizeCedula(value) {
  return String(value || '').replace(/\D/g, '')
}

export function normalizeMatricula(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
}

function getExecutor(source) {
  if (source && typeof source.execute === 'function') {
    return source
  }
  return null
}

async function queryRows(source, sql, params = []) {
  const executor = getExecutor(source)
  if (executor) {
    const result = await executor.execute(sql, params)
    return Array.isArray(result) ? result[0] : result
  }
  return execute(sql, params)
}

async function queryResult(source, sql, params = []) {
  const executor = getExecutor(source)
  if (executor) {
    const result = await executor.execute(sql, params)
    return Array.isArray(result) ? result[0] : result
  }
  const result = await execute(sql, params)
  return result
}

export async function obtenerClientePorIdOCedula(source, input) {
  const id = Number(input)
  const cedula = normalizeCedula(input)
  if (cedula) {
    const rows = await queryRows(source, 'SELECT * FROM clientes WHERE cedula = ? LIMIT 1', [cedula])
    if (rows[0]) {
      return rows[0]
    }
  }
  if (Number.isInteger(id) && id > 0) {
    const rows = await queryRows(source, 'SELECT * FROM clientes WHERE id = ? LIMIT 1', [id])
    return rows[0] ?? null
  }
  return null
}

export async function upsertCliente(source, data = {}) {
  const cedula = normalizeCedula(data.cedula)
  const nombre = normalizeText(data.nombre)
  const telefono = normalizeText(data.telefono, 30)
  const localidad = normalizeText(data.localidad, 100)
  const id = Number(data.id)

  if (!cedula || !nombre) {
    throw new Error('Cedula y nombre son obligatorios')
  }

  if (Number.isInteger(id) && id > 0) {
    await queryResult(source, 'UPDATE clientes SET cedula = ?, nombre = ?, telefono = ?, localidad = ? WHERE id = ?', [cedula, nombre, telefono, localidad, id])
    return id
  }

  const existenteRows = await queryRows(source, 'SELECT id FROM clientes WHERE cedula = ? LIMIT 1', [cedula])
  const existente = existenteRows?.[0]?.id ? Number(existenteRows[0].id) : null
  if (existente) {
    await queryResult(source, 'UPDATE clientes SET nombre = ?, telefono = ?, localidad = ? WHERE id = ?', [nombre, telefono, localidad, existente])
    return existente
  }

  const result = await queryResult(source, 'INSERT INTO clientes (cedula, nombre, telefono, localidad) VALUES (?, ?, ?, ?)', [cedula, nombre, telefono, localidad])
  return Number(result?.insertId || 0)
}

export async function obtenerEstadoId(source, tableName, codigo) {
  const code = String(codigo || '').trim().toLowerCase()
  if (!code) {
    throw new Error('Estado invalido')
  }
  const rows = await queryRows(source, `SELECT id FROM ${tableName} WHERE codigo = ? LIMIT 1`, [code])
  const id = rows?.[0]?.id ? Number(rows[0].id) : null
  if (!id) {
    throw new Error(`Estado no encontrado: ${code}`)
  }
  return id
}

export async function obtenerTipoTurnoId(source, codigo) {
  return obtenerEstadoId(source, 'dt_tipo_turno', codigo)
}

export async function obtenerVehiculoCodigoId(source, data = {}) {
  const marca = normalizeText(data.marca, 100).toLowerCase()
  const modelo = normalizeText(data.modelo, 100).toLowerCase()
  const tipo = String(data.tipo || 'moto').trim().toLowerCase()
  if (!marca || !modelo) {
    throw new Error('Marca y modelo son obligatorios')
  }

  const existenteRows = await queryRows(source, 'SELECT cod FROM vehiculo_cod WHERE marca = ? AND modelo = ? AND tipo = ? LIMIT 1', [marca, modelo, tipo])
  const existente = existenteRows?.[0]?.cod ? Number(existenteRows[0].cod) : null
  if (existente) {
    return existente
  }

  const result = await queryResult(source, 'INSERT INTO vehiculo_cod (marca, modelo, tipo) VALUES (?, ?, ?)', [marca, modelo, tipo])
  return Number(result?.insertId || 0)
}

export async function upsertVehiculoCliente(source, data = {}) {
  const clienteId = Number(data.clienteId || data.cliente_id)
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    throw new Error('clienteId requerido')
  }

  const codVehiculo = data.codVehiculo ?? data.cod_vehiculo ?? null
  const codVehiculoId = codVehiculo ? Number(codVehiculo) : null
  const motor = normalizeText(data.motor ?? data.numero_motor ?? data.numeroMotor ?? '', 100) || null
  const chasis = normalizeText(data.chasis ?? '', 100) || null
  const matricula = normalizeMatricula(data.matricula || '') || null
  const color = normalizeText(data.color || '', 50) || null
  const fechaCompra = String(data.fechaCompra ?? data.fecha_compra ?? '').trim() || null
  const id = Number(data.id)

  if (Number.isInteger(id) && id > 0) {
    await queryResult(
      source,
      `UPDATE vehiculos_cliente
       SET cliente_id = ?, cod_vehiculo = ?, motor = ?, chasis = ?, matricula = ?, color = ?, fecha_compra = ?
       WHERE id = ?`,
      [clienteId, codVehiculoId, motor, chasis, matricula, color, fechaCompra, id]
    )
    return id
  }

  if (matricula) {
    const existenteRows = await queryRows(source, 'SELECT id FROM vehiculos_cliente WHERE matricula = ? LIMIT 1', [matricula])
    const existente = existenteRows?.[0]?.id ? Number(existenteRows[0].id) : null
    if (existente) {
      await queryResult(
        source,
        `UPDATE vehiculos_cliente
         SET cod_vehiculo = ?, motor = ?, chasis = ?, color = ?, fecha_compra = ?
         WHERE id = ?`,
        [codVehiculoId, motor, chasis, color, fechaCompra, existente]
      )
      return existente
    }
  }

  const result = await queryResult(
    source,
    `INSERT INTO vehiculos_cliente (cliente_id, cod_vehiculo, motor, chasis, matricula, color, fecha_compra)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [clienteId, codVehiculoId, motor, chasis, matricula, color, fechaCompra]
  )
  return Number(result?.insertId || 0)
}

export async function registrarVehiculoEvento(source, data = {}) {
  const clienteId = Number(data.clienteId || data.cliente_id)
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    throw new Error('clienteId requerido')
  }

  const result = await queryResult(
    source,
    `INSERT INTO vehiculo_eventos (
      cliente_id, vehiculo_id, reserva_id, apronte_id, garantia_id, ingreso_id,
      tipo_evento, fecha_evento, titulo, detalle,
      km, tipo_turno, particular_tipo, garantia_tipo,
      garantia_fecha_compra, garantia_numero_service, garantia_problema,
      numero_motor, factura, color
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clienteId,
      data.vehiculoId ?? data.vehiculo_id ?? null,
      data.reservaId ?? data.reserva_id ?? null,
      data.apronteId ?? data.apronte_id ?? null,
      data.garantiaId ?? data.garantia_id ?? null,
      data.ingresoId ?? data.ingreso_id ?? null,
      String(data.tipoEvento || data.tipo_evento || 'nota').trim().toLowerCase(),
      data.fechaEvento || data.fecha_evento || new Date(),
      normalizeText(data.titulo || '', 255) || null,
      normalizeText(data.detalle || '', 4000) || null,
      normalizeText(data.km || '', 20) || null,
      normalizeText(data.tipo_turno || '', 50) || null,
      normalizeText(data.particular_tipo || '', 50) || null,
      normalizeText(data.garantia_tipo || '', 50) || null,
      normalizeText(data.garantia_fecha_compra || '', 50) || null,
      normalizeText(data.garantia_numero_service || '', 50) || null,
      normalizeText(data.garantia_problema || '', 4000) || null,
      normalizeText(data.numero_motor || '', 100) || null,
      normalizeText(data.factura || '', 100) || null,
      normalizeText(data.color || '', 50) || null
    ]
  )
  return Number(result?.insertId || 0)
}

export async function obtenerVehiculoPorMatricula(source, matricula) {
  const mat = normalizeMatricula(matricula)
  if (!mat) return null
  const rows = await queryRows(source, 'SELECT * FROM vehiculos_cliente WHERE matricula = ? LIMIT 1', [mat])
  return rows[0] ?? null
}
