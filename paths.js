import path from 'node:path'
import { fileURLToPath } from 'node:url'

const THIS_FILE = fileURLToPath(import.meta.url)

export const SERVER_DIR = path.dirname(THIS_FILE)
export const SERVER_ENV_PATH = path.join(SERVER_DIR, '.env')
export const SERVER_DATA_DIR = path.join(SERVER_DIR, 'data')
