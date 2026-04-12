# Deploy de API en HostingMontevideo (Node.js)

Esta API ya puede correr de forma independiente usando solo el contenido de la carpeta `server/`.

## 1) Que subir al hosting

Subi **solo** estos archivos/carpetas de `server/`:

- `index.js`
- `package.json`
- `schema.sql`
- `*.js` (modulos de la API)
- `.env.example` (opcional, referencia)

No subas:

- `node_modules/`
- `data/` (se crea sola al usar configuraciones)
- `.env` local de desarrollo

## 2) Configurar app Node en el panel

En el panel de HostingMontevideo (Node.js App):

1. Selecciona version de Node 18+ (recomendado Node 20).
2. Define la carpeta de la app apuntando al folder donde subiste la API.
3. Startup file: `index.js`
4. Install dependencies: `npm install`
5. Start command: `npm start`

## 3) Variables de entorno

Crea un archivo `.env` en la carpeta de la API (o define variables desde el panel):

```env
API_PORT=3005
API_TOKEN=tu_token_largo_y_privado
DEBUG=0

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=tu_usuario
MYSQL_PASSWORD=tu_password
MYSQL_DATABASE=reservas_rosas
MYSQL_SSL=
MYSQL_SSL_REJECT_UNAUTHORIZED=
MYSQL_CONNECT_TIMEOUT=10000

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=false
SMTP_TLS_REJECT_UNAUTHORIZED=false
```

Notas:

- Si defines `API_TOKEN` o `API_TOKEN_HASH`, todos los endpoints `/api/*` (excepto `/api/health`) requieren token.
- El backend tambien acepta token por `Authorization: Bearer <token>` o header `X-API-KEY`.

## 4) Inicializar base de datos

Ejecuta `schema.sql` en tu MySQL del hosting para crear tablas necesarias.

## 5) Probar que quedo levantada

Health check:

```bash
GET /api/health
```

Debe responder:

```json
{ "ok": true }
```

Prueba autenticada (ejemplo):

```bash
GET /api/reservas
Authorization: Bearer tu_token_largo_y_privado
```

## 6) Conectar tu app Electron

En la app admin, configura:

- `API_REMOTE_URL=https://tu-dominio.com`
- `API_REMOTE_TOKEN=tu_token_largo_y_privado`

Con esto, el panel usa la API remota en lugar de procesos locales.
