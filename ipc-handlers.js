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
import * as motos from './motos.js'
import * as registros from './registros.js'
export async function handleIpc(channel, args) {
  switch (channel) {
    case '__ping__':
      return { ok: true, pong: true }

    // Reservas
    case 'reservas:crear':
      return reservas.crearReserva(args[0] || {})
    case 'reservas:obtener':
      return reservas.obtenerReserva(args[0])
    case 'reservas:borrar':
      return reservas.borrarReserva(args[0] || {})
    case 'reservas:mover':
      return reservas.moverReserva(args[0] || {})
    case 'reservas:actualizar':
      return reservas.actualizarReserva(args[0] || {})
    case 'reservas:semana':
      return reservas.obtenerReservasSemana(args[0]?.desde, args[0]?.hasta)
    case 'reservas:dia':
      return reservas.obtenerReservasPorFecha(args[0]?.fecha)
    case 'reservas:todas':
      return reservas.obtenerTodasLasReservas()
    case 'reservas:actualizar-notas':
      return reservas.actualizarNotasReserva(args[0] || {})
    case 'reservas:cambios':
      return reservas.obtenerCambiosReservas(args[0]?.since, args[0]?.lastId, args[0]?.limit)

    // Aprontes
    case 'aprontes:crear':
      return aprontes.crearApronte(args[0] || {})
    case 'aprontes:obtener':
      return aprontes.obtenerApronte(args[0])
    case 'aprontes:borrar':
      return aprontes.borrarApronte(args[0] || {})
    case 'aprontes:actualizar':
      return aprontes.actualizarApronte(args[0]?.id, args[0] || {})
    case 'aprontes:fecha':
      return aprontes.obtenerAprontesPorFecha(args[0])
    case 'aprontes:todas':
      return aprontes.obtenerTodosLosAprontes()
    case 'aprontes:alertas:config:get':
      return aprontesAlertConfig.getAprontesAlertConfig()
    case 'aprontes:alertas:config:set':
      return aprontesAlertConfig.setAprontesAlertConfig(args[0] || {})

    // Horarios Aprontes
    case 'horarios-aprontes:base':
      return horariosAprontes.obtenerHorariosAprontesBase()
    case 'horarios-aprontes:inactivos':
      return horariosAprontes.obtenerHorariosAprontesInactivos()
    case 'horarios-aprontes:disponibles':
      return horariosAprontes.obtenerHorariosAprontesDisponibles(args[0])
    case 'horarios-aprontes:crear':
      return horariosAprontes.crearHorarioApronte(args[0]?.hora, args[0]?.cupo)
    case 'horarios-aprontes:actualizar-cupo':
      return horariosAprontes.actualizarCupoHorarioApronte(args[0]?.id, args[0]?.cupo)
    case 'horarios-aprontes:desactivar':
      return horariosAprontes.desactivarHorarioApronte(args[0])
    case 'horarios-aprontes:activar':
      return horariosAprontes.activarHorarioApronte(args[0])
    case 'horarios-aprontes:borrar':
      return horariosAprontes.borrarHorarioApronte(args[0])

    // Registros
    case 'registros:mensual':
      return registros.obtenerRegistroMensual(args[0]?.mes || args[0])

    // Resumen diario
    case 'resumen-diario:config:get':
      return dailySummary.getDailySummaryConfig()
    case 'resumen-diario:config:set':
      return dailySummary.setDailySummaryConfig(args[0] || {})
    case 'resumen-diario:enviar':
      return dailySummary.sendDailySummaryNow(args[0]?.fecha)

    // Horarios
    case 'horarios:base':
      return horarios.obtenerHorariosBase()
    case 'horarios:inactivos':
      return horarios.obtenerHorariosInactivos()
    case 'horarios:disponibles':
      return horarios.obtenerHorariosDisponibles(args[0])
    case 'horarios:crear':
      return horarios.crearHorario(args[0])
    case 'horarios:desactivar':
      return horarios.desactivarHorario(args[0])
    case 'horarios:activar':
      return horarios.activarHorario(args[0])
    case 'horarios:bloquear':
      return horarios.bloquearHorario(args[0]?.fecha, args[0]?.hora, args[0]?.motivo)
    case 'horarios:desbloquear':
      return horarios.desbloquearHorario(args[0]?.fecha, args[0]?.hora)
    case 'horarios:bloqueados':
      return horarios.obtenerHorariosBloqueados(args[0])
    case 'horarios:borrar':
      return horarios.borrarHorarioPermanente(args[0])

    // Historial
    case 'historial:obtener':
      return historial.obtenerHistorial(args[0])

    // Vehiculos
    case 'vehiculos:todos':
      return vehiculos.obtenerVehiculos()
    case 'vehiculos:historial':
      return vehiculos.obtenerHistorialVehiculo(args[0])
    case 'vehiculos:mysql-by-matricula':
      return vehiculos.obtenerVehiculoPorMatriculaMysql(args[0])

    // Motos catalogo
    case 'motos:marcas':
      return motos.obtenerMarcasMoto()
    case 'motos:modelos':
      return motos.obtenerModelosMoto(args[0])

    // Config
    case 'config:env:get':
      return config.readEnvText()
    case 'config:env:set':
      config.writeEnvText(String(args[0] || ''))
      return { ok: true }
    case 'config:db:test':
      return config.testDb()

    // Usuarios / Auth
    case 'usuarios:login-list':
      return users.listarUsuariosLogin()
    case 'auth:login':
      return users.validarLogin(args[0], args[1])
    case 'auth:change-password':
      return users.cambiarPasswordPropia(args[0] || {})
    case 'usuarios:list':
      return users.listarUsuarios()
    case 'usuarios:create':
      await users.crearUsuario(args[0] || {})
      return { ok: true }
    case 'usuarios:update':
      await users.actualizarUsuario(args[0] || {})
      return { ok: true }
    case 'usuarios:delete':
      await users.eliminarUsuario(args[0]?.id, args[0]?.actor)
      return { ok: true }
    case 'usuarios:password':
      await users.actualizarPassword(args[0]?.id, args[0]?.password, args[0]?.actor)
      return { ok: true }

    // Auditoria
    case 'auditoria:list':
      return auditoria.listarAuditoria()

    default:
      throw new Error('Canal no soportado: ' + channel)
  }
}








