import { execute } from './db.js'

function cleanText(value, maxLen = 100) {
  const text = String(value || '').trim().toLowerCase()
  return text.length > maxLen ? text.slice(0, maxLen) : text
}

export async function registrarMarcaModelo(conn, marca, modelo) {
  const marcaOk = cleanText(marca, 100)
  const modeloOk = cleanText(modelo, 100)
  if (!marcaOk || !modeloOk) return
  const sql = `
    INSERT INTO vehiculo_cod (marca, modelo, tipo)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE modelo = VALUES(modelo)
  `
  const params = [marcaOk, modeloOk, 'moto']
  if (conn && typeof conn.execute === 'function') {
    await conn.execute(sql, params)
    return
  }
  await execute(sql, params)
}

export async function obtenerMarcasMoto() {
  const rows = await execute(
    `SELECT DISTINCT marca
     FROM vehiculo_cod
     WHERE marca IS NOT NULL AND marca <> ''
       AND tipo = 'moto'
     ORDER BY marca`
  )
  return (rows || []).map((r) => String(r?.marca || '').trim().toLowerCase()).filter(Boolean)
}

export async function obtenerModelosMoto(marca) {
  const marcaOk = cleanText(marca, 100)
  if (marcaOk) {
    const rows = await execute(
      `SELECT DISTINCT modelo
       FROM vehiculo_cod
       WHERE LOWER(marca) = ? AND modelo IS NOT NULL AND modelo <> ''
         AND tipo = 'moto'
       ORDER BY modelo`,
      [marcaOk]
    )
    return (rows || []).map((r) => String(r?.modelo || '').trim().toLowerCase()).filter(Boolean)
  }
  const rows = await execute(
    `SELECT DISTINCT modelo
     FROM vehiculo_cod
     WHERE modelo IS NOT NULL AND modelo <> ''
       AND tipo = 'moto'
     ORDER BY modelo`
  )
  return (rows || []).map((r) => String(r?.modelo || '').trim().toLowerCase()).filter(Boolean)
}
