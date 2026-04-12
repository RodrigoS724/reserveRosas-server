import { execute } from './db.js'
import { normalizeMatricula } from './utils.js'

export async function obtenerVehiculos() {
  const rows = await execute(
    `SELECT
       v.*,
       h.fecha as ultima_fecha,
       h.km as ultimo_km,
       h.tipo_turno as ultimo_tipo_turno,
       h.particular_tipo as ultimo_particular_tipo,
       h.garantia_tipo as ultimo_garantia_tipo
     FROM vehiculos v
     LEFT JOIN vehiculos_historial h
       ON h.id = (
         SELECT id FROM vehiculos_historial
         WHERE vehiculo_id = v.id
         ORDER BY fecha DESC, id DESC
         LIMIT 1
       )
     ORDER BY v.matricula`
  )
  return rows
}

export async function obtenerVehiculoPorMatriculaMysql(matricula) {
  const mat = normalizeMatricula(matricula)
  if (!mat) {
    throw new Error('Matricula invalida')
  }

  const rows = await execute(
    `SELECT id, matricula, marca, modelo
     FROM vehiculos
     WHERE matricula = ?
     LIMIT 1`,
    [mat]
  )

  return rows[0] ?? null
}

export async function obtenerHistorialVehiculo(vehiculoId) {
  const rows = await execute(
    `SELECT *
     FROM vehiculos_historial
     WHERE vehiculo_id = ?
     ORDER BY fecha DESC, id DESC`,
    [vehiculoId]
  )
  return rows
}
