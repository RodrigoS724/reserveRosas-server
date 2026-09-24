# Reestructura base de datos

Este archivo acompana al SQL de reestructuracion y resume el arbol funcional que se quiere usar a partir de ahora.

## Arbol propuesto

- `clientes`
  - padre principal del sistema
  - se identifica por `cedula`
- `vehiculo_cod`
  - catalogo de marcas, modelos y tipo de vehiculo
  - permite separar `moto`, `bicicleta` y `otro`
- `vehiculos_cliente`
  - vehiculos reales de cada cliente
  - puede tener motor, chasis, matricula, color y fecha de compra segun el tipo
- `aprontes`
  - registro operativo de trabajo
  - se relaciona con cliente, vehiculo y estado por tabla de catalogo
- `reservas`
  - turnos y seguimientos
  - se relaciona con cliente, vehiculo, tipo de turno, estado e ingreso
- `ingresos`
  - entrada y salida de trabajo
  - conecta la reserva con el trabajo realizado y el monto
- `garantias`
  - casos de garantia ligados al cliente y al vehiculo
- `repuestos` y `garantia_repuestos`
  - catalogo de repuestos y relacion N a N con garantias
- `vehiculo_eventos`
  - historial unificado para reservas, aprontes, garantias, ingresos y notas
  - reemplaza el historial disperso de tablas viejas

## Tablas viejas que se quieren retirar

- `historial_reservas`
- `servicios`
- `vehiculo_historial`
- `ventas_creditos`
- `ventas_motos`
- `dt_vehiculos_cod`
- `vehiculos_sin_ingresar`
- `vehiculos`

## Criterio funcional

- El cliente es el nodo principal.
- Cada cliente puede tener uno o varios vehiculos.
- Cada vehiculo puede generar reservas, aprontes, garantias e ingresos.
- Los tipos de vehiculo permiten casos sin motor o sin matricula, como bicicletas u otros.
- Los estados deben salir de tablas de catalogo y no de texto libre.

## Siguiente paso

Con este SQL ya se puede pasar a la reescritura del codigo para que la app use los nuevos identificadores y relaciones.
