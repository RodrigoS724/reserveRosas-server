import { execute, withTransaction } from './db.js'
import { normalizeDate, normalizeHora, isSaturday } from './utils.js'

export async function obtenerHorariosBase() {
  const rows = await execute(
    `SELECT * FROM horarios_base
     WHERE activo = 1
     ORDER BY hora`
  )
  return rows
}

export async function obtenerHorariosInactivos() {
  const rows = await execute(
    'SELECT id, hora FROM horarios_base WHERE activo = 0 ORDER BY hora'
  )
  return rows
}

export async function obtenerHorariosDisponibles(fecha) {
  const fechaNormalizada = normalizeDate(fecha)
  const rows = await execute(
    `SELECT h.hora
     FROM horarios_base h
     WHERE h.activo = 1
       AND h.hora NOT IN (
         SELECT hora
         FROM reservas
         WHERE fecha = ?
           AND LOWER(IFNULL(estado, 'pendiente')) NOT IN ('cancelada', 'cancelado')
       )
       AND h.hora NOT IN (
         SELECT hora FROM bloqueos_horarios WHERE fecha = ?
       )
     ORDER BY h.hora`,
    [fechaNormalizada, fechaNormalizada]
  )

  let horarios = rows
  if (isSaturday(fechaNormalizada)) {
    horarios = horarios.filter((h) => String(h.hora) < '12:00')
  }
  return horarios
}

export async function crearHorario(hora) {
  const horaNormalizada = normalizeHora(hora)
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT id FROM horarios_base WHERE hora = ?', [horaNormalizada])
    if (rows.length) {
      throw new Error('El horario ya existe')
    }
    await conn.execute(
      'INSERT INTO horarios_base (hora, activo) VALUES (?, 1)',
      [horaNormalizada]
    )
  })
}

export async function desactivarHorario(id) {
  await execute('UPDATE horarios_base SET activo = 0 WHERE id = ?', [id])
}

export async function activarHorario(id) {
  await execute('UPDATE horarios_base SET activo = 1 WHERE id = ?', [id])
}

export async function bloquearHorario(fecha, hora, motivo) {
  const fechaNormalizada = normalizeDate(fecha)
  const horaNormalizada = normalizeHora(hora)
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT id FROM bloqueos_horarios WHERE fecha = ? AND hora = ?',
      [fechaNormalizada, horaNormalizada]
    )
    if (rows.length) return
    await conn.execute(
      'INSERT INTO bloqueos_horarios (fecha, hora, motivo) VALUES (?, ?, ?)',
      [fechaNormalizada, horaNormalizada, motivo ?? '']
    )
  })
}

export async function desbloquearHorario(fecha, hora) {
  const fechaNormalizada = normalizeDate(fecha)
  const horaNormalizada = normalizeHora(hora)
  await execute(
    'DELETE FROM bloqueos_horarios WHERE fecha = ? AND hora = ?',
    [fechaNormalizada, horaNormalizada]
  )
}

export async function obtenerHorariosBloqueados(fecha) {
  const fechaNormalizada = normalizeDate(fecha)
  const rows = await execute(
    'SELECT * FROM bloqueos_horarios WHERE fecha = ? ORDER BY hora',
    [fechaNormalizada]
  )
  return rows
}

export async function borrarHorarioPermanente(id) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT id FROM horarios_base WHERE id = ?', [id])
    if (!rows.length) {
      throw new Error('Horario no encontrado')
    }
    await conn.execute('DELETE FROM horarios_base WHERE id = ?', [id])
  })
}
