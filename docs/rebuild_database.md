# Rebuild de base de datos

Si la API remota falla con errores como `Unknown column 'r.cliente_id' in 'WHERE'`, la base que está en producción quedó desalineada con el esquema actual.

## Opcion recomendada

Crear una base nueva e importar el esquema canónico que ya vive en este repo:

- [scripts/reestructura_base_datos.sql](../scripts/reestructura_base_datos.sql)

Ese script crea la estructura actual del sistema:

- `clientes`
- `vehiculo_cod`
- `vehiculos_cliente`
- `dt_estado_*`
- `dt_tipo_turno`
- `aprontes`
- `reservas`
- `ingresos`
- `garantias`
- `repuestos`
- `garantia_repuestos`
- `vehiculo_eventos`

## Paso a paso

1. Hacer backup de la base actual.
2. Crear una base MySQL nueva o vacia.
3. Importar `scripts/reestructura_base_datos.sql` en esa base.
4. Configurar `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD` y `MYSQL_DATABASE` para apuntar a esa base.
5. Reiniciar la API.

## Si queres reutilizar un dump legacy

En vez de importar el esquema desde cero, podes usar el importador legado:

- [scripts/import-legacy-dump.md](../scripts/import-legacy-dump.md)

Uso sugerido:

```bash
npm run import:legacy -- --file "D:\ruta\del\dump.sql" --database tu_base --drop
```

## Nota sobre el problema actual

El fallo de `cliente_id` aparece cuando la tabla `reservas` conserva el esquema viejo. El esquema actual ya trabaja con clientes normalizados y relaciones por `cliente_id`, por eso un rebuild limpio es la forma mas segura de dejar la base alineada.
