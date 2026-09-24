import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

function parseArgs(argv) {
  const args = {
    file: process.env.IMPORT_SQL_FILE || '',
    database: process.env.MYSQL_DATABASE || '',
    drop: false,
    dryRun: false
  }

  for (let index = 2; index < argv.length; index++) {
    const current = argv[index]
    if (current === '--file' && argv[index + 1]) {
      args.file = path.resolve(argv[++index])
      continue
    }
    if (current === '--database' && argv[index + 1]) {
      args.database = String(argv[++index]).trim()
      continue
    }
    if (current === '--drop') {
      args.drop = true
      continue
    }
    if (current === '--dry-run') {
      args.dryRun = true
      continue
    }
  }

  return args
}

function createAdminConnectionOptions() {
  const port = process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306
  const useSsl = String(process.env.MYSQL_SSL || '').toLowerCase()
  const sslEnabled = useSsl === '1' || useSsl === 'true' || useSsl === 'yes'
  const rejectEnv = String(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED || '').toLowerCase()
  const rejectUnauthorized = !(rejectEnv === '0' || rejectEnv === 'false' || rejectEnv === 'no')

  return {
    host: process.env.MYSQL_HOST,
    port: Number.isFinite(port) ? port : 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    ssl: sslEnabled ? { rejectUnauthorized } : undefined,
    multipleStatements: true,
    dateStrings: true,
    connectTimeout: process.env.MYSQL_CONNECT_TIMEOUT ? Number(process.env.MYSQL_CONNECT_TIMEOUT) : 10000
  }
}

function splitSqlStatements(sqlText) {
  const statements = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let inBacktick = false

  for (let index = 0; index < sqlText.length; index++) {
    const char = sqlText[index]
    const next = sqlText[index + 1]
    const prev = sqlText[index - 1]

    if (!inSingle && !inDouble && !inBacktick) {
      if (char === '-' && next === '-' && (current === '' || /\s$/.test(current))) {
        while (index < sqlText.length && sqlText[index] !== '\n') index++
        current += '\n'
        continue
      }
      if (char === '#') {
        while (index < sqlText.length && sqlText[index] !== '\n') index++
        current += '\n'
        continue
      }
      if (char === '/' && next === '*') {
        while (index < sqlText.length && !(sqlText[index] === '*' && sqlText[index + 1] === '/')) index++
        index++
        continue
      }
    }

    if (char === "'" && !inDouble && !inBacktick && prev !== '\\') {
      inSingle = !inSingle
    } else if (char === '"' && !inSingle && !inBacktick && prev !== '\\') {
      inDouble = !inDouble
    } else if (char === '`' && !inSingle && !inDouble && prev !== '\\') {
      inBacktick = !inBacktick
    }

    if (char === ';' && !inSingle && !inDouble && !inBacktick) {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      continue
    }

    current += char
  }

  const tail = current.trim()
  if (tail) statements.push(tail)
  return statements
}

function extractCreatedTables(sqlText) {
  const names = []
  const regex = /CREATE\s+TABLE\s+`([^`]+)`/gi
  let match
  while ((match = regex.exec(sqlText))) {
    names.push(match[1])
  }
  return Array.from(new Set(names))
}

async function main() {
  const args = parseArgs(process.argv)

  if (!args.file) {
    throw new Error('Debes indicar --file o definir IMPORT_SQL_FILE')
  }
  const dumpPath = path.resolve(args.file)
  const sql = await fs.readFile(dumpPath, 'utf-8')
  const tables = extractCreatedTables(sql)
  const statements = splitSqlStatements(sql)

  if (args.dryRun) {
    console.log(`Dry run: ${statements.length} statements from ${dumpPath}`)
    console.log(`Tables: ${tables.join(', ')}`)
    return
  }

  if (!args.database) {
    throw new Error('MYSQL_DATABASE no esta configurada')
  }
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER) {
    throw new Error('MYSQL_HOST y MYSQL_USER son obligatorios')
  }

  const connection = await mysql.createConnection({
    ...createAdminConnectionOptions(),
    database: undefined,
    multipleStatements: true
  })

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${args.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await connection.query(`USE \`${args.database}\``)

    if (args.drop) {
      await connection.query('SET FOREIGN_KEY_CHECKS = 0')
      for (const table of tables.reverse()) {
        await connection.query(`DROP TABLE IF EXISTS \`${table}\``)
      }
      await connection.query('SET FOREIGN_KEY_CHECKS = 1')
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const statement of statements) {
      const trimmed = statement.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('START TRANSACTION') || trimmed.startsWith('COMMIT') || trimmed.startsWith('SET time_zone') || trimmed.startsWith('SET SQL_MODE') || trimmed.startsWith('SET NAMES') || trimmed.startsWith('SET @@')) {
        continue
      }
      await connection.query(trimmed)
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1')

    console.log(`Import completed from ${dumpPath} into ${args.database}`)
    console.log(`Processed ${statements.length} statements`)
  } finally {
    await connection.end()
  }
}

main().catch((error) => {
  console.error('[import-legacy-dump] Error:', error.message || error)
  process.exitCode = 1
})