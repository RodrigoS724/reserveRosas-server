export function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizeDate(value) {
  const d = new Date(String(value || ''))
  if (Number.isNaN(d.getTime())) {
    throw new Error('Fecha invalida')
  }
  return d.toISOString().split('T')[0]
}

export function normalizeHora(value) {
  const parts = String(value || '').split(':')
  if (parts.length < 2) {
    throw new Error('Formato de hora invalido')
  }
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error('Formato de hora invalido')
  }
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error('Formato de hora invalido')
  }
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

export function isSaturday(dateIso) {
  const d = new Date(String(dateIso || '') + 'T00:00:00')
  return d.getDay() === 6
}

export function normalizeCedula(value) {
  return String(value || '').replace(/\D+/g, '')
}

export function isValidCedulaUy(value) {
  const digits = normalizeCedula(value)
  if (digits.length < 7 || digits.length > 8) {
    return false
  }
  const padded = digits.padStart(8, '0').split('').map((d) => Number(d))
  const weights = [2, 9, 8, 7, 6, 3, 4]
  let sum = 0
  for (let i = 0; i < 7; i += 1) {
    sum += padded[i] * weights[i]
  }
  const check = (10 - (sum % 10)) % 10
  return check === padded[7]
}

export function normalizeMatricula(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isValidMatriculaUy(value) {
  return /^[A-Z]{3}\d{3,4}$/.test(normalizeMatricula(value))
}

export function normalizeTelefonoUy(value) {
  let digits = String(value || '').replace(/\D+/g, '')
  if (digits.startsWith('598')) {
    digits = digits.slice(3)
  }
  if (digits.startsWith('9')) {
    digits = '0' + digits
  }
  if (!digits.startsWith('0')) {
    digits = '0' + digits
  }
  digits = digits.slice(0, 9)
  return digits.length === 9 ? digits : ''
}

export function isValidTelefonoUy(value) {
  const normalized = normalizeTelefonoUy(value)
  return /^0\d{8}$/.test(normalized)
}
