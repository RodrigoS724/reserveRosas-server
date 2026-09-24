import { execute } from './db.js'
import { normalizeMatricula } from './utils.js'

export async function obtenerVehiculos() {
  const rows = await execute(
    `SELECT
       vc.id,
       vc.cliente_id,
       vc.cod_vehiculo,
       vc.motor,
       vc.chasis,
       vc.matricula,
       vc.color,
       vc.fecha_compra,
       vc.created_at,
       c.cedula AS cliente_cedula,
       c.nombre AS cliente_nombre,
       c.telefono AS cliente_telefono,
       c.localidad AS cliente_localidad,
       cod.marca AS codigo_marca,
       cod.modelo AS codigo_modelo,
       cod.tipo AS codigo_tipo,
       ev.fecha_evento AS ultima_fecha,
       ev.km AS ultimo_km,
       ev.tipo_turno AS ultimo_tipo_turno,
       ev.particular_tipo AS ultimo_particular_tipo,
       ev.garantia_tipo AS ultimo_garantia_tipo
     FROM vehiculos_cliente vc
     LEFT JOIN clientes c ON c.id = vc.cliente_id
     LEFT JOIN vehiculo_cod cod ON cod.cod = vc.cod_vehiculo
     LEFT JOIN vehiculo_eventos ev
       ON ev.id = (
         SELECT id FROM vehiculo_eventos
         WHERE vehiculo_id = vc.id
         ORDER BY fecha_evento DESC, id DESC
         LIMIT 1
       )
     ORDER BY vc.matricula, vc.id`
  )
  return (rows || []).map((row) => ({
    ...row,
    marca: row.codigo_marca || row.marca || '',
    modelo: row.codigo_modelo || row.modelo || '',
    nombre: row.cliente_nombre || row.nombre || '',
    telefono: row.cliente_telefono || row.telefono || ''
  }))
}

export async function obtenerVehiculoPorMatriculaMysql(matricula) {
  const mat = normalizeMatricula(matricula)
  if (!mat) {
    throw new Error('Matricula invalida')
  }

  const rows = await execute(
    `SELECT vc.id, vc.matricula, cod.marca, cod.modelo
     FROM vehiculos_cliente vc
     LEFT JOIN vehiculo_cod cod ON cod.cod = vc.cod_vehiculo
     WHERE matricula = ?
     LIMIT 1`,
    [mat]
  )

  return rows[0] ?? null
}

export async function obtenerHistorialVehiculo(vehiculoId) {
  const rows = await execute(
    `SELECT
       id,
       vehiculo_id,
       fecha_evento AS fecha,
       km,
       tipo_turno,
       particular_tipo,
       garantia_tipo,
       garantia_fecha_compra,
       garantia_numero_service,
       garantia_problema,
       detalle AS detalles,
       titulo,
       tipo_evento,
       created_at
     FROM vehiculo_eventos
     WHERE vehiculo_id = ?
     ORDER BY fecha_evento DESC, id DESC`,
    [vehiculoId]
  )
  return rows
}

export async function obtenerVehiculosPorCedula(cedula) {
  const cedulaNormalizada = String(cedula || '').replace(/\D/g, '')
  if (!cedulaNormalizada) return { cliente: null, vehiculos: [] }

  const clienteRows = await execute('SELECT * FROM clientes WHERE cedula = ? LIMIT 1', [cedulaNormalizada])
  const cliente = clienteRows[0] ?? null
  const vehiculos = await execute(
    `SELECT vc.*, cod.marca AS codigo_marca, cod.modelo AS codigo_modelo, cod.tipo AS codigo_tipo
     FROM vehiculos_cliente vc
     LEFT JOIN vehiculo_cod cod ON cod.cod = vc.cod_vehiculo
     LEFT JOIN clientes cl ON cl.id = vc.cliente_id
     WHERE cl.cedula = ?
     ORDER BY vc.matricula`,
    [cedulaNormalizada]
  )
  return {
    cliente,
    vehiculos: (vehiculos || []).map((row) => ({
      ...row,
      marca: row.codigo_marca || row.marca || '',
      modelo: row.codigo_modelo || row.modelo || ''
    }))
  }
}

export async function actualizarVehiculoCliente(data = {}) {
  const id = Number(data.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Vehiculo invalido')
  }

  const matricula = String(data.matricula || '').trim().toUpperCase()
  if (!matricula) {
    throw new Error('Matricula requerida')
  }

  await execute(
    `UPDATE vehiculos_cliente
     SET motor = ?, chasis = ?, matricula = ?, color = ?, fecha_compra = ?
     WHERE id = ?`,
    [
      String(data.motor || '').trim() || null,
      String(data.chasis || '').trim() || null,
      matricula,
      String(data.color || '').trim() || null,
      String(data.fecha_compra || data.fechaCompra || '').trim() || null,
      id
    ]
  )

  return { id }
}

export async function obtenerCatalogoVehiculos() {
  return execute('SELECT cod AS id, marca, modelo, tipo FROM vehiculo_cod ORDER BY marca, modelo')
}
