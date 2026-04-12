import { execute } from './db.js'

async function ensureAuditTable() {
  await execute(
    `CREATE TABLE IF NOT EXISTS auditoria_usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor_username VARCHAR(255),
      actor_role VARCHAR(50),
      accion VARCHAR(100) NOT NULL,
      target_username VARCHAR(255),
      detalle TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  )
}

export async function registrarAuditoria(payload) {
  await ensureAuditTable()
  const data = {
    actor_username: payload.actor_username ?? null,
    actor_role: payload.actor_role ?? null,
    accion: payload.accion,
    target_username: payload.target_username ?? null,
    detalle: payload.detalle ?? null
  }

  await execute(
    `INSERT INTO auditoria_usuarios (actor_username, actor_role, accion, target_username, detalle)
     VALUES ( ?, ?, ?, ?, ?)`
    ,
    [data.actor_username, data.actor_role, data.accion, data.target_username, data.detalle]
  )
}

export async function listarAuditoria() {
  await ensureAuditTable()
  const rows = await execute(
    `SELECT id, actor_username, actor_role, accion, target_username, detalle, created_at
     FROM auditoria_usuarios
     ORDER BY id DESC`
  )

  return rows.map((row) => ({
    id: Number(row.id),
    actor_username: row.actor_username,
    actor_role: row.actor_role,
    accion: row.accion,
    target_username: row.target_username,
    detalle: row.detalle,
    created_at: row.created_at
  }))
}
