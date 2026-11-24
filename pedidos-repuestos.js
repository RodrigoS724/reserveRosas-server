import { execute, withTransaction } from './db.js'

const ESTADOS = new Set(['pendiente', 'encargado', 'consultado', 'avisado'])

let schemaReady = false

function cleanText(value, maxLength = 255) {
  const text = String(value ?? '').trim()
  return text.slice(0, maxLength)
}

function cleanAmount(value) {
  if (value === '' || value === null || value === undefined) return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Los precios deben ser numeros positivos')
  }
  return amount
}

function cleanDate(value) {
  const text = cleanText(value, 10)
  if (!text) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error('La fecha debe tener formato AAAA-MM-DD')
  }
  return text
}

function normalizeEstado(value) {
  const estado = cleanText(value || 'pendiente', 20).toLowerCase()
  if (!ESTADOS.has(estado)) {
    throw new Error('Estado de pedido invalido')
  }
  return estado
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Agrega al menos un repuesto al pedido')
  }

  return items.map((item) => {
    const descripcion = cleanText(item?.descripcion, 500)
    if (!descripcion) {
      throw new Error('Cada repuesto debe tener una descripcion')
    }

    return {
      descripcion,
      disponibilidad: cleanText(item?.disponibilidad, 120),
      precio_proveedor: cleanAmount(item?.precio_proveedor),
      precio_publico: cleanAmount(item?.precio_publico),
      estado: cleanText(item?.estado || 'en espera', 60)
    }
  })
}

async function ensureSchema() {
  if (schemaReady) return

  await execute(
    `CREATE TABLE IF NOT EXISTS pedidos_repuestos (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      cliente VARCHAR(255) NULL,
      proveedor VARCHAR(255) NULL,
      telefono_cliente VARCHAR(50) NULL,
      fecha_consulta DATE NULL,
      fecha_aviso DATE NULL,
      fecha_pedido DATE NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      notas TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pedidos_repuestos_estado (estado),
      INDEX idx_pedidos_repuestos_fecha_pedido (fecha_pedido)
    )`
  )

  await execute(
    `CREATE TABLE IF NOT EXISTS pedidos_repuestos_items (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      pedido_id BIGINT NOT NULL,
      descripcion VARCHAR(500) NOT NULL,
      disponibilidad VARCHAR(120) NULL,
      precio_proveedor DECIMAL(12,2) NULL,
      precio_publico DECIMAL(12,2) NULL,
      estado VARCHAR(60) NOT NULL DEFAULT 'en espera',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pedidos_repuestos_items_pedido (pedido_id),
      CONSTRAINT fk_pedidos_repuestos_items_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedidos_repuestos(id) ON DELETE CASCADE
    )`
  )

  schemaReady = true
}

function mapPedido(row) {
  return {
    id: Number(row.id),
    cliente: String(row.cliente || ''),
    proveedor: String(row.proveedor || ''),
    telefono_cliente: String(row.telefono_cliente || ''),
    fecha_consulta: row.fecha_consulta ? String(row.fecha_consulta) : '',
    fecha_aviso: row.fecha_aviso ? String(row.fecha_aviso) : '',
    fecha_pedido: row.fecha_pedido ? String(row.fecha_pedido) : '',
    estado: String(row.estado || 'pendiente'),
    notas: String(row.notas || ''),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    items: []
  }
}

function mapItem(row) {
  return {
    id: Number(row.id),
    descripcion: String(row.descripcion || ''),
    disponibilidad: String(row.disponibilidad || ''),
    precio_proveedor: row.precio_proveedor == null ? null : Number(row.precio_proveedor),
    precio_publico: row.precio_publico == null ? null : Number(row.precio_publico),
    estado: String(row.estado || 'en espera')
  }
}

async function loadItems(pedidos) {
  if (!pedidos.length) return pedidos

  const placeholders = pedidos.map(() => '?').join(', ')
  const rows = await execute(
    `SELECT id, pedido_id, descripcion, disponibilidad, precio_proveedor, precio_publico, estado
     FROM pedidos_repuestos_items
     WHERE pedido_id IN (${placeholders})
     ORDER BY id ASC`,
    pedidos.map((pedido) => pedido.id)
  )
  const byPedido = new Map(pedidos.map((pedido) => [pedido.id, pedido]))
  for (const row of rows) {
    byPedido.get(Number(row.pedido_id))?.items.push(mapItem(row))
  }
  return pedidos
}

export async function listarPedidosRepuestos() {
  await ensureSchema()
  const rows = await execute(
    `SELECT id, cliente, proveedor, telefono_cliente, fecha_consulta, fecha_aviso, fecha_pedido,
            estado, notas, created_at, updated_at
     FROM pedidos_repuestos
     ORDER BY FIELD(estado, 'pendiente', 'consultado', 'encargado', 'avisado'), fecha_pedido DESC, id DESC`
  )
  return loadItems(rows.map(mapPedido))
}

export async function crearPedidoRepuestos(payload = {}) {
  await ensureSchema()
  const items = normalizeItems(payload.items)
  const cliente = cleanText(payload.cliente, 255)
  const proveedor = cleanText(payload.proveedor, 255)
  const telefonoCliente = cleanText(payload.telefono_cliente, 50)
  const fechaConsulta = cleanDate(payload.fecha_consulta)
  const fechaAviso = cleanDate(payload.fecha_aviso)
  const fechaPedido = cleanDate(payload.fecha_pedido) || new Date().toISOString().slice(0, 10)
  const estado = normalizeEstado(payload.estado)
  const notas = cleanText(payload.notas, 4000)

  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `INSERT INTO pedidos_repuestos (
        cliente, proveedor, telefono_cliente, fecha_consulta, fecha_aviso, fecha_pedido, estado, notas
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [cliente || null, proveedor || null, telefonoCliente || null, fechaConsulta, fechaAviso, fechaPedido, estado, notas || null]
    )
    const pedidoId = Number(result.insertId)

    for (const item of items) {
      await connection.execute(
        `INSERT INTO pedidos_repuestos_items (
          pedido_id, descripcion, disponibilidad, precio_proveedor, precio_publico, estado
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [pedidoId, item.descripcion, item.disponibilidad || null, item.precio_proveedor, item.precio_publico, item.estado]
      )
    }

    return { ok: true, id: pedidoId }
  })
}

export async function actualizarPedidoRepuestos(payload = {}) {
  await ensureSchema()
  const id = Number(payload.id)
  if (!Number.isInteger(id) || id <= 0) throw new Error('ID de pedido invalido')

  const items = normalizeItems(payload.items)
  const cliente = cleanText(payload.cliente, 255)
  const proveedor = cleanText(payload.proveedor, 255)
  const telefonoCliente = cleanText(payload.telefono_cliente, 50)
  const fechaConsulta = cleanDate(payload.fecha_consulta)
  const fechaAviso = cleanDate(payload.fecha_aviso)
  const fechaPedido = cleanDate(payload.fecha_pedido)
  const estado = normalizeEstado(payload.estado)
  const notas = cleanText(payload.notas, 4000)

  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `UPDATE pedidos_repuestos
       SET cliente = ?, proveedor = ?, telefono_cliente = ?, fecha_consulta = ?, fecha_aviso = ?,
           fecha_pedido = ?, estado = ?, notas = ?
       WHERE id = ?`,
      [cliente || null, proveedor || null, telefonoCliente || null, fechaConsulta, fechaAviso, fechaPedido, estado, notas || null, id]
    )
    if (result.affectedRows === 0) throw new Error('Pedido no encontrado')

    await connection.execute('DELETE FROM pedidos_repuestos_items WHERE pedido_id = ?', [id])
    for (const item of items) {
      await connection.execute(
        `INSERT INTO pedidos_repuestos_items (
          pedido_id, descripcion, disponibilidad, precio_proveedor, precio_publico, estado
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, item.descripcion, item.disponibilidad || null, item.precio_proveedor, item.precio_publico, item.estado]
      )
    }
    return { ok: true }
  })
}

export async function actualizarEstadoPedidoRepuestos(payload = {}) {
  await ensureSchema()
  const id = Number(payload.id)
  if (!Number.isInteger(id) || id <= 0) throw new Error('ID de pedido invalido')
  const estado = normalizeEstado(payload.estado)
  const result = await execute(
    'UPDATE pedidos_repuestos SET estado = ?, fecha_aviso = IF(? = \'avisado\' AND fecha_aviso IS NULL, CURDATE(), fecha_aviso) WHERE id = ?',
    [estado, estado, id]
  )
  if (result.affectedRows === 0) throw new Error('Pedido no encontrado')
  return { ok: true }
}

export async function borrarPedidoRepuestos(payload = {}) {
  await ensureSchema()
  const id = Number(payload.id)
  if (!Number.isInteger(id) || id <= 0) throw new Error('ID de pedido invalido')
  const result = await execute('DELETE FROM pedidos_repuestos WHERE id = ?', [id])
  if (result.affectedRows === 0) throw new Error('Pedido no encontrado')
  return { ok: true }
}
