const API_BASE = '/api'

export function getImageUrl(propertyId, filename) {
  return `${API_BASE}/images/${encodeURIComponent(propertyId)}/${encodeURIComponent(filename)}`
}

export async function fetchProperties() {
  const res = await fetch(`${API_BASE}/properties`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error ?? `Failed to fetch properties (${res.status})`)
  }
  return data
}

export async function fetchFeedback() {
  try {
    const res = await fetch(`${API_BASE}/feedback`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export async function fetchSummary() {
  try {
    const res = await fetch(`${API_BASE}/summary`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/stats`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function postFeedback(entry) {
  try {
    const res = await fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function resetBenchmarking() {
  try {
    const res = await fetch(`${API_BASE}/reset`, { method: 'DELETE' })
    return res.ok
  } catch {
    return false
  }
}
