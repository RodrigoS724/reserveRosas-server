import { execute } from './db.js'
import { normalizeText } from './utils.js'

function parseMonth(value) {
  const today = new Date()
  let year = today.getUTCFullYear()
  let month = today.getUTCMonth() + 1

  const raw = String(value || '').trim()
  const match = /^(\d{4})-(\d{2})$/.exec(raw)
  if (match) {
    const y = Number(match[1])
    const m = Number(match[2])
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      year = y
      month = m
    }
  }

  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 0))
  const desde = start.toISOString().slice(0, 10)
  const hasta = end.toISOString().slice(0, 10)

  return {
    year,
    month,
    mes: `${year}-${String(month).padStart(2, '0')}`,
    desde,
    hasta
  }
}

function buildDailyBuckets(desde, hasta) {
  const buckets = new Map()
  const start = new Date(`${desde}T00:00:00Z`)
  const end = new Date(`${hasta}T00:00:00Z`)

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10)
    buckets.set(iso, { fecha: iso, reservas: 0, aprontes: 0 })
  }

  return buckets
}

function summarizeReservas(reservas) {
  const stats = {
    total: reservas.length,
    garantia: 0,
    particular: 0,
    otros: 0,
    garantia_service: 0,
    garantia_reparacion: 0,
    particular_service: 0,
    particular_taller: 0
  }

  for (const r of reservas || []) {
    const tipo = normalizeText(r?.tipo_turno || '')
    if (tipo === 'garantia') {
      stats.garantia += 1
      const sub = normalizeText(r?.garantia_tipo || '')
      if (sub === 'service') stats.garantia_service += 1
      else if (sub === 'reparacion') stats.garantia_reparacion += 1
    } else if (tipo === 'particular') {
      stats.particular += 1
      const sub = normalizeText(r?.particular_tipo || '')
      if (sub === 'service') stats.particular_service += 1
      else if (sub === 'taller') stats.particular_taller += 1
    } else {
      stats.otros += 1
    }
  }

  return stats
}

function summarizeAprontes(aprontes) {
  const estados = {}
  for (const a of aprontes || []) {
    const key = (a?.estado || 'APRONTE').trim().toUpperCase()
    estados[key] = (estados[key] || 0) + 1
  }
  return { total: aprontes.length, estados }
}

async function obtenerReservasMes(desde, hasta) {
  return execute(
    `SELECT id, nombre, telefono, marca, modelo, km, matricula,
            tipo_turno, particular_tipo, garantia_tipo,
            garantia_fecha_compra, garantia_numero_service, garantia_problema,
            fecha, hora, estado
     FROM reservas
     WHERE fecha >= ? AND fecha <= ?
     ORDER BY fecha, hora`,
    [desde, hasta]
  )
}

async function obtenerAprontesMes(desde, hasta) {
  return execute(
    `SELECT id, nombre, telefono, localidad, observaciones,
            marca, modelo, factura, estado, fecha, hora
     FROM aprontes
     WHERE fecha >= ? AND fecha <= ?
     ORDER BY fecha, hora`,
    [desde, hasta]
  )
}

export async function obtenerRegistroMensual(mes) {
  const range = parseMonth(mes)
  const [reservas, aprontes] = await Promise.all([
    obtenerReservasMes(range.desde, range.hasta),
    obtenerAprontesMes(range.desde, range.hasta)
  ])

  const buckets = buildDailyBuckets(range.desde, range.hasta)
  for (const r of reservas || []) {
    if (buckets.has(r.fecha)) {
      buckets.get(r.fecha).reservas += 1
    }
  }
  for (const a of aprontes || []) {
    if (buckets.has(a.fecha)) {
      buckets.get(a.fecha).aprontes += 1
    }
  }

  const stats = {
    reservas: summarizeReservas(reservas),
    aprontes: summarizeAprontes(aprontes),
    porDia: Array.from(buckets.values())
  }

  return {
    mes: range.mes,
    rango: { desde: range.desde, hasta: range.hasta },
    reservas,
    aprontes,
    stats
  }
}
