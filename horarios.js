import { execute, withTransaction } from './db.js'
import { normalizeDate, normalizeHora, isSaturday } from './utils.js'

let horariosSchemaReady = false

async function ensureHorariosSchema() {
  if (horariosSchemaReady) return

  await execute(
    `CREATE TABLE IF NOT EXISTS horarios_base (
       id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
       hora VARCHAR(10) NOT NULL UNIQUE,
       activo TINYINT NOT NULL DEFAULT 1
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  await execute(
    `CREATE TABLE IF NOT EXISTS bloqueos_horarios (
       id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
       fecha DATE NOT NULL,
       hora VARCHAR(10) NOT NULL,
       motivo TEXT NULL,
       INDEX idx_bloqueos_horarios_fecha_hora (fecha, hora)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  await execute(
    `INSERT IGNORE INTO horarios_base (hora, activo) VALUES
     ('08:00', 1), ('09:00', 1), ('10:00', 1), ('11:00', 1),
     ('13:00', 1), ('14:00', 1), ('15:00', 1), ('16:00', 1)`
  )

  horariosSchemaReady = true
}

export async function obtenerHorariosBase() {
  await ensureHorariosSchema()
  const rows = await execute(
    `SELECT * FROM horarios_base
     WHERE activo = 1
     ORDER BY hora`
  )
  return rows
}

export async function obtenerHorariosInactivos() {
  await ensureHorariosSchema()
  const rows = await execute(
    'SELECT id, hora FROM horarios_base WHERE activo = 0 ORDER BY hora'
  )
  return rows
}

export async function obtenerHorariosDisponibles(fecha) {
  await ensureHorariosSchema()
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
  await ensureHorariosSchema()
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
  await ensureHorariosSchema()
  await execute('UPDATE horarios_base SET activo = 0 WHERE id = ?', [id])
}

export async function activarHorario(id) {
  await ensureHorariosSchema()
  await execute('UPDATE horarios_base SET activo = 1 WHERE id = ?', [id])
}

export async function bloquearHorario(fecha, hora, motivo) {
  await ensureHorariosSchema()
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
  await ensureHorariosSchema()
  const fechaNormalizada = normalizeDate(fecha)
  const horaNormalizada = normalizeHora(hora)
  await execute(
    'DELETE FROM bloqueos_horarios WHERE fecha = ? AND hora = ?',
    [fechaNormalizada, horaNormalizada]
  )
}

export async function obtenerHorariosBloqueados(fecha) {
  await ensureHorariosSchema()
  const fechaNormalizada = normalizeDate(fecha)
  const rows = await execute(
    'SELECT * FROM bloqueos_horarios WHERE fecha = ? ORDER BY hora',
    [fechaNormalizada]
  )
  return rows
}

export async function borrarHorarioPermanente(id) {
  await ensureHorariosSchema()
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT id FROM horarios_base WHERE id = ?', [id])
    if (!rows.length) {
      throw new Error('Horario no encontrado')
    }
    await conn.execute('DELETE FROM horarios_base WHERE id = ?', [id])
  })
}
