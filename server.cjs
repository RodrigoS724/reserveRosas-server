const major = Number((process.versions.node || '0').split('.')[0] || 0)

if (major < 18) {
  console.error('[Startup] Node 18+ es requerido. Version actual:', process.versions.node)
  process.exit(1)
}

Promise.resolve()
  .then(() => new Function('return import("./index.js")')())
  .catch((error) => {
    console.error('[Startup] Error cargando la API ESM:', error)
    process.exit(1)
  })