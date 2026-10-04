const fs = require('node:fs')
const path = require('node:path')

function writeStartupMarker(message) {
  try {
    fs.appendFileSync(
      path.join(__dirname, 'startup.log'),
      `${new Date().toISOString()} ${message}\n`,
      'utf8'
    )
  } catch {}
}

writeStartupMarker(`Starting Node ${process.versions.node || 'unknown'}`)

const major = Number((process.versions.node || '0').split('.')[0] || 0)

if (major < 18) {
  const message = `[Startup] Node 18+ es requerido. Version actual: ${process.versions.node}`
  writeStartupMarker(message)
  console.error(message)
  process.exit(1)
}

Promise.resolve()
  .then(() => new Function('return import("./api-server.js")')())
  .then(() => writeStartupMarker('api-server.js loaded'))
  .catch((error) => {
    writeStartupMarker(`[Startup] Error cargando la API ESM: ${error?.stack || error}`)
    console.error('[Startup] Error cargando la API ESM:', error)
    process.exit(1)
  })