import http from 'node:http'
import { URL } from 'node:url'
import crypto from 'node:crypto'
import dotenv from 'dotenv'
import { handleIpc } from './ipc-handlers.js'
import * as reservas from './reservas.js'
import * as horarios from './horarios.js'
import * as historial from './historial.js'
import * as vehiculos from './vehiculos.js'
import * as config from './config.js'
import * as users from './users.js'
import * as auditoria from './auditoria.js'
import * as dailySummary from './daily-summary.js'
import * as aprontes from './aprontes.js'
import * as aprontesAlertConfig from './aprontes-alert-config.js'
import * as horariosAprontes from './horarios-aprontes.js'
import { startAprontesGarantiaAlertScheduler } from './aprontes-garantia-alert.js'
import * as registros from './registros.js'
import { SERVER_ENV_PATH } from './paths.js'
import { isMysqlConfigured } from './db.js'

dotenv.config({ path: SERVER_ENV_PATH })

const PORT = Number(process.env.API_PORT || 3005)
const HEALTH_INFO = {
  ok: true,
  service: 'reserveRosas-server',
  aprontesRules: 'allow-future-disallow-past',
  //deployPaths: ['/home/rosasuy/dev-server/'] //dev
  deployPaths: ['/home/rosasuy/reserva-server/'] //prod
}

if (isMysqlConfigured()) {
  startAprontesGarantiaAlertScheduler()
} else {
  console.warn('[AprontesGarantia] Scheduler deshabilitado: MYSQL no configurado.')
}

function applyCors(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY')
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function sendHtml(res, status, html) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(String(html || ''))
}

function ok(res, data, status = 200) {
  sendJson(res, status, { ok: true, data })
}

function fail(res, status, message) {
  sendJson(res, status, { ok: false, error: message })
}

function sendResult(res, result, status = 200) {
  if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'ok')) {
    const code = result.ok ? status : 400
    sendJson(res, code, result)
    return
  }
  ok(res, result, status)
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function getProvidedToken(req, url) {
  const auth = req.headers.authorization || ''
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  const apiKey = req.headers['x-api-key']
  if (apiKey) return String(apiKey)
  const token = url.searchParams.get('token')
  return token || ''
}

function isAuthorized(req, url) {
  const token = String(process.env.API_TOKEN || '').trim()
  const tokenHash = String(process.env.API_TOKEN_HASH || '').trim()
  if (!token && !tokenHash) return true
  const provided = getProvidedToken(req, url)
  if (!provided) return false
  if (token && provided === token) return true
  if (tokenHash && hashToken(provided) === tokenHash) return true
  return false
}

function isNumericId(value) {
  return /^[0-9]+$/.test(String(value || ''))
}

function normalizePathname(pathname = '/') {
  const raw = String(pathname || '/')
  const parts = raw.split('/').filter(Boolean)

  if (parts[0] && parts[0] !== 'api' && parts[1] === 'api') {
    return '/' + parts.slice(1).join('/')
  }

  return raw || '/'
}

async function handleRest(req, res, url, parts) {
  const method = req.method || 'GET'
  const resource = parts[1]

  if (resource === 'reservas') {
    if (method === 'GET') {
      if (parts.length === 2) {
        const desde = url.searchParams.get('desde')
        const hasta = url.searchParams.get('hasta')
        const fecha = url.searchParams.get('fecha')
        if (desde && hasta) {
          const data = await reservas.obtenerReservasSemana(desde, hasta)
          ok(res, data)
          return true
        }
        if (fecha) {
          const data = await reservas.obtenerReservasPorFecha(fecha)
          ok(res, data)
          return true
        }
        const data = await reservas.obtenerTodasLasReservas()
        ok(res, data)
        return true
      }
      if (parts[2] === 'dia') {
        const fecha = url.searchParams.get('fecha')
        if (!fecha) {
          fail(res, 400, 'Fecha requerida')
          return true
        }
        const data = await reservas.obtenerReservasPorFecha(fecha)
        ok(res, data)
        return true
      }
      if (parts[2] === 'cambios') {
        const since = url.searchParams.get('since') || new Date(0).toISOString()
        const lastId = Number(url.searchParams.get('lastId') || 0)
        const limit = Number(url.searchParams.get('limit') || 200)
        const data = await reservas.obtenerCambiosReservas(since, lastId, limit)
        ok(res, data)
        return true
      }
      if (isNumericId(parts[2])) {
        const data = await reservas.obtenerReserva(Number(parts[2]))
        ok(res, data)
        return true
      }
    }

    if (method === 'POST') {
      if (parts.length === 2) {
        const body = await readJson(req)
        const id = await reservas.crearReserva(body)
        ok(res, { id }, 201)
        return true
      }
      if (parts[2] === 'mover') {
        const body = await readJson(req)
        await reservas.moverReserva(body || {})
        ok(res, { ok: true })
        return true
      }
      if (isNumericId(parts[2]) && parts[3] === 'notas') {
        const body = await readJson(req)
        await reservas.actualizarNotasReserva({ id: Number(parts[2]), ...(body || {}) })
        ok(res, { ok: true })
        return true
      }
    }

    if (method === 'PUT' || method === 'PATCH') {
      if (isNumericId(parts[2]) && parts[3] === 'notas') {
        const body = await readJson(req)
        await reservas.actualizarNotasReserva({ id: Number(parts[2]), ...(body || {}) })
        ok(res, { ok: true })
        return true
      }
      if (isNumericId(parts[2])) {
        const body = await readJson(req)
        await reservas.actualizarReserva({ id: Number(parts[2]), ...(body || {}) })
        ok(res, { ok: true })
        return true
      }
    }

    if (method === 'DELETE' && isNumericId(parts[2])) {
      await reservas.borrarReserva({ id: Number(parts[2]) })
      ok(res, { ok: true })
      return true
    }
  }

  if (resource === 'aprontes') {
    if (method === 'GET') {
      if (parts.length === 2) {
        const fecha = url.searchParams.get('fecha')
        if (fecha) {
          const data = await aprontes.obtenerAprontesPorFecha(fecha)
          ok(res, data)
          return true
        }
        const data = await aprontes.obtenerTodosLosAprontes()
        ok(res, data)
        return true
      }
      if (isNumericId(parts[2])) {
        const data = await aprontes.obtenerApronte(Number(parts[2]))
        ok(res, data)
        return true
      }
    }

    if (method === 'POST') {
      if (parts.length === 2) {
        const body = await readJson(req)
        const id = await aprontes.crearApronte(body)
        ok(res, { id }, 201)
        return true
      }
    }

    if (method === 'PUT' || method === 'PATCH') {
      if (isNumericId(parts[2])) {
        const body = await readJson(req)
        await aprontes.actualizarApronte(Number(parts[2]), body || {})
        ok(res, { ok: true })
        return true
      }
    }

    if (method === 'DELETE' && isNumericId(parts[2])) {
      await aprontes.borrarApronte({ id: Number(parts[2]) })
      ok(res, { ok: true })
      return true
    }

    if (method === 'GET' && parts[2] === 'alertas' && parts[3] === 'config') {
      const data = aprontesAlertConfig.getAprontesAlertConfig()
      ok(res, data)
      return true
    }

    if (method === 'POST' && parts[2] === 'alertas' && parts[3] === 'config') {
      const body = await readJson(req)
      const data = aprontesAlertConfig.setAprontesAlertConfig(body || {})
      ok(res, data)
      return true
    }
  }

  if (resource === 'horarios-aprontes') {
    if (method === 'GET') {
      if (parts[2] === 'base') {
        const data = await horariosAprontes.obtenerHorariosAprontesBase()
        ok(res, data)
        return true
      }
      if (parts[2] === 'inactivos') {
        const data = await horariosAprontes.obtenerHorariosAprontesInactivos()
        ok(res, data)
        return true
      }
      if (parts[2] === 'disponibles' || parts.length === 2) {
        const fecha = url.searchParams.get('fecha')
        if (!fecha) {
          fail(res, 400, 'Fecha requerida')
          return true
        }
        const data = await horariosAprontes.obtenerHorariosAprontesDisponibles(fecha)
        ok(res, data)
        return true
      }
    }

    if (method === 'POST') {
      if (parts.length === 2) {
        const body = await readJson(req)
        await horariosAprontes.crearHorarioApronte(body?.hora, body?.cupo)
        ok(res, { ok: true })
        return true
      }
      if (isNumericId(parts[2]) && parts[3] === 'activar') {
        await horariosAprontes.activarHorarioApronte(Number(parts[2]))
        ok(res, { ok: true })
        return true
      }
      if (isNumericId(parts[2]) && parts[3] === 'desactivar') {
        await horariosAprontes.desactivarHorarioApronte(Number(parts[2]))
        ok(res, { ok: true })
        return true
      }
      if (isNumericId(parts[2]) && parts[3] === 'cupo') {
        const body = await readJson(req)
        await horariosAprontes.actualizarCupoHorarioApronte(Number(parts[2]), body?.cupo)
        ok(res, { ok: true })
        return true
      }
    }

    if ((method === 'PUT' || method === 'PATCH') && isNumericId(parts[2]) && parts[3] === 'cupo') {
      const body = await readJson(req)
      await horariosAprontes.actualizarCupoHorarioApronte(Number(parts[2]), body?.cupo)
      ok(res, { ok: true })
      return true
    }

    if (method === 'DELETE' && isNumericId(parts[2])) {
      await horariosAprontes.borrarHorarioApronte(Number(parts[2]))
      ok(res, { ok: true })
      return true
    }
  }

  if (resource === 'horarios') {
    if (method === 'GET') {
      if (parts[2] === 'base') {
        const data = await horarios.obtenerHorariosBase()
        ok(res, data)
        return true
      }
      if (parts[2] === 'inactivos') {
        const data = await horarios.obtenerHorariosInactivos()
        ok(res, data)
        return true
      }
      if (parts[2] === 'bloqueados') {
        const fecha = url.searchParams.get('fecha')
        if (!fecha) {
          fail(res, 400, 'Fecha requerida')
          return true
        }
        const data = await horarios.obtenerHorariosBloqueados(fecha)
        ok(res, data)
        return true
      }
      if (parts[2] === 'disponibles' || parts.length === 2) {
        const fecha = url.searchParams.get('fecha')
        if (!fecha) {
          fail(res, 400, 'Fecha requerida')
          return true
        }
        const data = await horarios.obtenerHorariosDisponibles(fecha)
        ok(res, data)
        return true
      }
    }

    if (method === 'POST') {
      if (parts.length === 2) {
        const body = await readJson(req)
        await horarios.crearHorario(body?.hora)
        ok(res, { ok: true })
        return true
      }
      if (parts[2] === 'bloquear') {
        const body = await readJson(req)
        await horarios.bloquearHorario(body?.fecha, body?.hora, body?.motivo)
        ok(res, { ok: true })
        return true
      }
      if (parts[2] === 'desbloquear') {
        const body = await readJson(req)
        await horarios.desbloquearHorario(body?.fecha, body?.hora)
        ok(res, { ok: true })
        return true
      }
      if (isNumericId(parts[2]) && parts[3] === 'activar') {
        await horarios.activarHorario(Number(parts[2]))
        ok(res, { ok: true })
        return true
      }
      if (isNumericId(parts[2]) && parts[3] === 'desactivar') {
        await horarios.desactivarHorario(Number(parts[2]))
        ok(res, { ok: true })
        return true
      }
    }

    if (method === 'DELETE' && isNumericId(parts[2])) {
      await horarios.borrarHorarioPermanente(Number(parts[2]))
      ok(res, { ok: true })
      return true
    }
  }

  if (resource === 'vehiculos') {
    if (method === 'GET') {
      if (parts.length === 2) {
        const data = await vehiculos.obtenerVehiculos()
        ok(res, data)
        return true
      }
      if (parts[2] === 'lookup') {
        const matricula = url.searchParams.get('matricula')
        if (!matricula) {
          fail(res, 400, 'Matricula requerida')
          return true
        }
        const data = await vehiculos.obtenerVehiculoPorMatriculaMysql(matricula)
        ok(res, data)
        return true
      }
      if (isNumericId(parts[2]) && parts[3] === 'historial') {
        const data = await vehiculos.obtenerHistorialVehiculo(Number(parts[2]))
        ok(res, data)
        return true
      }
    }
  }

  if (resource === 'historial') {
    if (method === 'GET' && isNumericId(parts[2])) {
      const data = await historial.obtenerHistorial(Number(parts[2]))
      ok(res, data)
      return true
    }
  }

  if (resource === 'auth') {
    if (method === 'POST' && parts[2] === 'login') {
      const body = await readJson(req)
      const data = await users.validarLogin(body?.username, body?.password)
      if (data && typeof data === 'object' && data.ok === false) {
        sendJson(res, 401, data)
        return true
      }
      sendJson(res, 200, data)
      return true
    }
    if (method === 'POST' && parts[2] === 'change-password') {
      const body = await readJson(req)
      const data = await users.cambiarPasswordPropia(body || {})
      sendResult(res, data)
      return true
    }
  }

  if (resource === 'usuarios') {
    if (method === 'GET') {
      if (parts.length === 2) {
        const data = await users.listarUsuarios()
        ok(res, data)
        return true
      }
      if (parts[2] === 'login-list') {
        const data = await users.listarUsuariosLogin()
        ok(res, data)
        return true
      }
    }

    if (method === 'POST') {
      if (parts.length === 2) {
        const body = await readJson(req)
        await users.crearUsuario(body || {})
        ok(res, { ok: true })
        return true
      }
      if (isNumericId(parts[2]) && parts[3] === 'password') {
        const body = await readJson(req)
        await users.actualizarPassword(Number(parts[2]), body?.password, body?.actor)
        ok(res, { ok: true })
        return true
      }
    }

    if ((method === 'PUT' || method === 'PATCH') && isNumericId(parts[2])) {
      const body = await readJson(req)
      await users.actualizarUsuario({ ...body, id: Number(parts[2]) })
      ok(res, { ok: true })
      return true
    }

    if (method === 'DELETE' && isNumericId(parts[2])) {
      const body = await readJson(req)
      await users.eliminarUsuario(Number(parts[2]), body?.actor)
      ok(res, { ok: true })
      return true
    }
  }

  if (resource === 'auditoria') {
    if (method === 'GET') {
      const data = await auditoria.listarAuditoria()
      ok(res, data)
      return true
    }
  }

  if (resource === 'config') {
    if (method === 'GET' && parts[2] === 'env') {
      const data = await config.readEnvText()
      ok(res, data)
      return true
    }
    if (method === 'POST' && parts[2] === 'env') {
      const body = await readJson(req)
      const text = body?.text ?? body?.env ?? ''
      config.writeEnvText(String(text || ''))
      ok(res, { ok: true })
      return true
    }
    if (method === 'GET' && parts[2] === 'db-test') {
      const data = await config.testDb()
      sendResult(res, data)
      return true
    }
  }

  if (resource === 'registros') {
    if (method === 'GET') {
      const mes = url.searchParams.get('mes') || url.searchParams.get('month') || ''
      const data = await registros.obtenerRegistroMensual(mes)
      ok(res, data)
      return true
    }
  }

  if (resource === 'resumen-diario') {
    if (method === 'GET' && parts[2] === 'config') {
      const data = await dailySummary.getDailySummaryConfig()
      ok(res, data)
      return true
    }
    if (method === 'POST' && parts[2] === 'config') {
      const body = await readJson(req)
      const data = await dailySummary.setDailySummaryConfig(body || {})
      ok(res, data)
      return true
    }
    if (method === 'POST' && parts[2] === 'enviar') {
      const body = await readJson(req)
      const data = await dailySummary.sendDailySummaryNow(body?.fecha)
      sendResult(res, data)
      return true
    }
  }

  return false
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = normalizePathname(url.pathname)
  const parts = pathname.split('/').filter(Boolean)

  if (req.method === 'GET' && pathname === '/') {
    sendHtml(
      res,
      200,
      '<!doctype html><html><head><meta charset="utf-8"><title>reserveRosas API</title></head><body><h1>reserveRosas API</h1><p>Servicio activo.</p><p>Health: <a href="/api/health">/api/health</a></p></body></html>'
    )
    return
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, HEALTH_INFO)
    return
  }

  if (req.method === 'POST' && pathname === '/api/admin/ipc') {
    if (!isAuthorized(req, url)) {
      fail(res, 401, 'Token requerido o invalido')
      return
    }

    const body = await readJson(req)
    const channel = String(body.channel || '')
    const args = Array.isArray(body.args) ? body.args : []

    try {
      const data = await handleIpc(channel, args)
      sendJson(res, 200, { data })
    } catch (error) {
      const message = error?.message || String(error)
      sendJson(res, 500, {
        ok: false,
        error: message,
        stack: process.env.DEBUG === '1' ? (error?.stack || '') : ''
      })
    }
    return
  }

  if (parts[0] === 'api') {
    const isPublicRoute =
      (req.method === 'GET' && pathname === '/api/horarios') ||
      (req.method === 'GET' && pathname.startsWith('/api/vehiculos')) ||
      (req.method === 'POST' && pathname === '/api/reservas')

    if (!isPublicRoute && !isAuthorized(req, url)) {
      fail(res, 401, 'Token requerido o invalido')
      return
    }

    try {
      const handled = await handleRest(req, res, url, parts)
      if (handled) return
    } catch (error) {
      const message = error?.message || String(error)
      fail(res, 500, message)
      return
    }
  }

  fail(res, 404, 'Endpoint no encontrado')
})

server.listen(PORT, () => {
  console.log('[API] listening on port', PORT)
})
