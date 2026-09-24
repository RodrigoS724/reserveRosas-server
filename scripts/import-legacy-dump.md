# Importar dump legacy

Script para cargar `rosasuy_reserva_rosas.sql` en una base MySQL nueva.

## Uso

```bash
npm run import:legacy -- --file "D:\Nueva carpeta\Agustin Ferreiro\rosasuy_reserva_rosas.sql" --database tu_base --drop
```

## Opciones

- `--file`: ruta al dump SQL.
- `--database`: base de datos destino.
- `--drop`: elimina las tablas detectadas antes de importar.
- `--dry-run`: muestra cuantas sentencias va a ejecutar sin tocar la base.

## Variables de entorno

El script lee `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_PORT`, `MYSQL_SSL` y `MYSQL_SSL_REJECT_UNAUTHORIZED` desde el entorno o `.env`.
