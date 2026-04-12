# ReserveRosas Server

Standalone Node server that exposes /api/admin/ipc and REST endpoints for external clients.

Deployment guide for HostingMontevideo: see `DEPLOY-HOSTINGMONTEVIDEO.md`.

## Quick start
1. Copy .env.example to .env and set MYSQL_ credentials.
2. Create tables using schema.sql (see note below).
3. Install deps: npm install
4. Run: npm run dev (or npm start)

## Auth
Set API_TOKEN (or API_TOKEN_HASH) to protect all /api endpoints except /api/health.
Send token via Authorization: Bearer <token> or X-API-KEY.

## IPC endpoint
- POST /api/admin/ipc
  Body JSON: { "channel": "reservas:semana", "args": [ { "desde": "2026-01-01", "hasta": "2026-01-07" } ] }

## REST endpoints
- GET /api/health
- GET /api/horarios?fecha=YYYY-MM-DD
- GET /api/horarios/base
- GET /api/horarios/inactivos
- GET /api/horarios/disponibles?fecha=YYYY-MM-DD
- GET /api/horarios/bloqueados?fecha=YYYY-MM-DD
- POST /api/horarios { hora }
- POST /api/horarios/bloquear { fecha, hora, motivo }
- POST /api/horarios/desbloquear { fecha, hora }
- POST /api/horarios/:id/activar
- POST /api/horarios/:id/desactivar
- DELETE /api/horarios/:id

- GET /api/reservas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
- GET /api/reservas?fecha=YYYY-MM-DD
- GET /api/reservas
- GET /api/reservas/:id
- GET /api/reservas/cambios?since=ISO&lastId=0&limit=200
- POST /api/reservas (payload reserva)
- POST /api/reservas/mover { id, nuevaFecha, nuevaHora }
- PATCH /api/reservas/:id (payload parcial)
- PATCH /api/reservas/:id/notas { notas }
- DELETE /api/reservas/:id

- GET /api/vehiculos
- GET /api/vehiculos/lookup?matricula=ABC1234
- GET /api/vehiculos/:id/historial

- GET /api/historial/:reservaId

- POST /api/auth/login { username, password }
- GET /api/usuarios/login-list
- GET /api/usuarios
- POST /api/usuarios (payload usuario)
- PUT /api/usuarios/:id (payload usuario)
- POST /api/usuarios/:id/password { password, actor }
- DELETE /api/usuarios/:id (body con actor)

- GET /api/auditoria

- GET /api/resumen-diario/config
- POST /api/resumen-diario/config (payload config)
- POST /api/resumen-diario/enviar { fecha }

- GET /api/config/env
- POST /api/config/env { text }
- GET /api/config/db-test

## DB schema
The server only auto-creates tables for usuarios and auditoria_usuarios.
Create the rest using schema.sql (reservas, horarios_base, bloqueos_horarios, vehiculos, historial_reservas, vehiculos_historial).

## Client config
- Electron: API_REMOTE_URL and API_REMOTE_TOKEN in your app env.
- Web/Mobile: VITE_API_URL and VITE_API_TOKEN in the frontend env.
