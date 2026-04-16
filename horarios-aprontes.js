import { execute, withTransaction } from './db.js'
import { normalizeDate, normalizeHora } from './utils.js'

function normalizeCupo(value) {
  const cupo = Number(value)
  if (!Number.isFinite(cupo) || cupo < 1) {
    throw new Error('Cupo invalido')
  }
  return Math.floor(cupo)
}

function horaEnMinutos(hora) {
  const parts = String(hora || '').split(':')
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1
  return h * 60 + m
}

function aplicarReglaFinDeSemana(fechaIso, rows) {
  const day = new Date(`${fechaIso}T00:00:00`).getDay()
  if (day === 0) {
    return []
  }
  if (day !== 6) {
    return rows
  }
  return (rows || []).filter((r) => horaEnMinutos(r?.hora) <= 12 * 60)
}

export async function obtenerHorariosAprontesBase() {
  const rows = await execute(
    `SELECT id, hora, cupo, activo
     FROM horarios_aprontes
     WHERE activo = 1
     ORDER BY hora`
  )
  return rows
}

export async function obtenerHorariosAprontesInactivos() {
  const rows = await execute(
    `SELECT id, hora, cupo
     FROM horarios_aprontes
     WHERE activo = 0
     ORDER BY hora`
  )
  return rows
}

export async function obtenerHorariosAprontesDisponibles(fecha) {
  const fechaNormalizada = normalizeDate(fecha)
  const rows = await execute(
    `SELECT h.id, h.hora, h.cupo,
            IFNULL(a.usados, 0) AS usados,
            GREATEST(h.cupo - IFNULL(a.usados, 0), 0) AS disponibles
     FROM horarios_aprontes h
     LEFT JOIN (
       SELECT hora, COUNT(*) AS usados
       FROM aprontes
       WHERE fecha = ?
       GROUP BY hora
     ) a ON a.hora = h.hora
     WHERE h.activo = 1
     ORDER BY h.hora`,
    [fechaNormalizada]
  )
  return aplicarReglaFinDeSemana(fechaNormalizada, rows)
}

export async function crearHorarioApronte(hora, cupo = 1) {
  const horaNormalizada = normalizeHora(hora)
  const cupoNormalizado = normalizeCupo(cupo)
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT id FROM horarios_aprontes WHERE hora = ?',
      [horaNormalizada]
    )
    if (rows.length) {
      throw new Error('El horario ya existe')
    }
    await conn.execute(
      'INSERT INTO horarios_aprontes (hora, cupo, activo) VALUES (?, ?, 1)',
      [horaNormalizada, cupoNormalizado]
    )
  })
}

export async function actualizarCupoHorarioApronte(id, cupo) {
  const cupoNormalizado = normalizeCupo(cupo)
  const idNum = Number(id)
  if (!idNum) {
    throw new Error('ID de horario invalido')
  }
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT id FROM horarios_aprontes WHERE id = ?',
      [idNum]
    )
    if (!rows.length) {
      throw new Error('Horario no encontrado')
    }
    await conn.execute(
      'UPDATE horarios_aprontes SET cupo = ? WHERE id = ?',
      [cupoNormalizado, idNum]
    )
  })
}

export async function desactivarHorarioApronte(id) {
  await execute('UPDATE horarios_aprontes SET activo = 0 WHERE id = ?', [id])
}

export async function activarHorarioApronte(id) {
  await execute('UPDATE horarios_aprontes SET activo = 1 WHERE id = ?', [id])
}

export async function borrarHorarioApronte(id) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT id FROM horarios_aprontes WHERE id = ?',
      [id]
    )
    if (!rows.length) {
      throw new Error('Horario no encontrado')
    }
    await conn.execute('DELETE FROM horarios_aprontes WHERE id = ?', [id])
  })
}
