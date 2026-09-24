import { execute } from './db.js'

function traducirCampo(campo) {
  const mapa = {
    nombre: 'Nombre',
    fecha: 'Fecha',
    hora: 'Hora',
    estado: 'Estado',
    detalles: 'Observaciones',
    creacion: 'Creacion',
    eliminacion: 'Eliminacion',
    notas: 'Notas'
  }
  return mapa[campo] || campo
}

function describirCambio(campo, anterior, nuevo) {
  if (campo === 'creacion') {
    return 'Reserva creada'
  }
  if (campo === 'eliminacion') {
    return 'Reserva eliminada'
  }
  if (anterior === null && nuevo !== null) {
    return 'Se establecio ' + traducirCampo(campo) + ': ' + nuevo
  }
  if (anterior !== null && nuevo === null) {
    return 'Se elimino ' + traducirCampo(campo)
  }
  if (anterior !== nuevo) {
    return 'Cambio ' + traducirCampo(campo) + ' de "' + anterior + '" a "' + nuevo + '"'
  }
  return 'Actualizacion de ' + traducirCampo(campo)
}

export async function obtenerHistorial(reservaId) {
  const id = Number(reservaId)
  if (!Number.isInteger(id)) {
    throw new Error('ID de reserva invalido')
  }
  const rows = await execute(
    `SELECT
       id,
       reserva_id,
       tipo_evento AS campo,
       titulo AS valor_anterior,
       detalle AS valor_nuevo,
       fecha_evento AS fecha,
       NULL AS usuario
     FROM vehiculo_eventos
     WHERE reserva_id = ?
     ORDER BY fecha_evento DESC, id DESC`,
    [id]
  )
  return rows.map((row) => ({
    ...row,
    descripcion: row.titulo || row.detalle || describirCambio(row.campo, row.valor_anterior, row.valor_nuevo)
  }))
}
