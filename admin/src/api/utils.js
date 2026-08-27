// Helpers that make the admin client resilient to small, plausible differences
// in the shape of API responses (casing, envelope wrapping, id field naming...).

function candidateKeys(key) {
  const lower = key.charAt(0).toLowerCase() + key.slice(1)
  const upper = key.charAt(0).toUpperCase() + key.slice(1)
  const snake = key.replace(/([A-Z])/g, '_$1').toLowerCase()
  return Array.from(new Set([key, lower, upper, snake]))
}

/** Reads the first defined value among several possible key spellings. */
export function pick(obj, keys, fallback = undefined) {
  if (!obj || typeof obj !== 'object') return fallback
  for (const key of keys) {
    for (const candidate of candidateKeys(key)) {
      if (obj[candidate] !== undefined && obj[candidate] !== null) {
        return obj[candidate]
      }
    }
  }
  return fallback
}

/** Extracts an array from common list envelope shapes. */
export function unwrapList(data) {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  const candidates = ['items', 'data', 'results', 'records', 'list', 'value']
  for (const key of candidates) {
    if (Array.isArray(data[key])) return data[key]
  }
  // Some APIs wrap once more, e.g. { data: { items: [...] } }
  for (const key of candidates) {
    if (data[key] && typeof data[key] === 'object') {
      const nested = unwrapList(data[key])
      if (nested.length) return nested
    }
  }
  return []
}

/** Extracts a single entity from common single-item envelope shapes. */
export function unwrapItem(data) {
  if (!data || typeof data !== 'object') return data
  if (Array.isArray(data)) return data[0]
  const candidates = ['data', 'item', 'result', 'value']
  for (const key of candidates) {
    if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
      return data[key]
    }
  }
  return data
}

export function getId(item) {
  return pick(item, ['id', '_id', 'newsId', 'eventId', 'resultId', 'guid'])
}

export function pickNumber(obj, keys, fallback = 0) {
  const value = pick(obj, keys, undefined)
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function toDateInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function extractErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data
  if (typeof data === 'string' && data.trim()) return data
  if (data) {
    const message = pick(data, ['message', 'error', 'title', 'detail'])
    if (message) return message
    if (Array.isArray(data.errors)) return data.errors.join(', ')
    if (data.errors && typeof data.errors === 'object') {
      const flat = Object.values(data.errors).flat()
      if (flat.length) return flat.join(', ')
    }
  }
  if (error?.message === 'Network Error') return 'Cannot reach the API server. Is it running on http://localhost:5080?'
  if (error?.message) return error.message
  return fallback
}
