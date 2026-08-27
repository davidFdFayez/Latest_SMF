import client from './client'
import { unwrapItem, unwrapList } from './utils'

/**
 * Generic REST CRUD helper for /api/admin/{resource} style endpoints.
 * Kept resilient to response envelopes that wrap arrays/objects differently
 * across API implementations.
 */
function createResource(basePath) {
  return {
    async list(params) {
      const response = await client.get(basePath, { params })
      return unwrapList(response.data)
    },
    async get(id) {
      const response = await client.get(`${basePath}/${id}`)
      return unwrapItem(response.data)
    },
    async create(payload) {
      const response = await client.post(basePath, payload)
      return unwrapItem(response.data)
    },
    async update(id, payload) {
      const response = await client.put(`${basePath}/${id}`, payload)
      return unwrapItem(response.data)
    },
    async remove(id) {
      await client.delete(`${basePath}/${id}`)
    },
  }
}

export const newsApi = createResource('/admin/news')
export const eventsApi = createResource('/admin/events')
export const resultsApi = createResource('/admin/results')

export const pagesApi = {
  async list() {
    const response = await client.get('/admin/pages')
    return unwrapList(response.data)
  },
  async get(slug) {
    const response = await client.get(`/admin/pages/${slug}`)
    return unwrapItem(response.data)
  },
  async update(slug, payload) {
    const response = await client.put(`/admin/pages/${slug}`, payload)
    return unwrapItem(response.data)
  },
  async remove(slug) {
    await client.delete(`/admin/pages/${slug}`)
  },
}

export const registrationsApi = {
  async list(params) {
    const response = await client.get('/admin/registrations', { params })
    return unwrapList(response.data)
  },
  /** The request lifecycle (§12), served by the API so the UI never hard-codes it. */
  async statuses() {
    const response = await client.get('/admin/registrations/statuses')
    return unwrapList(response.data)
  },
  /**
   * `patch` carries { status, statusReason?, internalNotes?, membershipNumber? }.
   * Rejection and "awaiting completion" are refused by the API without a reason,
   * because both send the applicant a message that quotes it back to them.
   */
  async updateStatus(id, patch) {
    const body = typeof patch === 'string' ? { status: patch } : patch
    // Real API exposes a dedicated status sub-route; fall back to a plain PUT
    // in case a simpler implementation is deployed instead.
    try {
      const response = await client.put(`/admin/registrations/${id}/status`, body)
      return unwrapItem(response.data)
    } catch (err) {
      if (err?.response?.status === 404) {
        const response = await client.put(`/admin/registrations/${id}`, body)
        return unwrapItem(response.data)
      }
      throw err
    }
  },
  /**
   * Documents are behind the bearer token, so they are fetched as a blob and
   * handed to the browser rather than linked with a plain href.
   */
  async openAttachment(id, attachmentId, fileName) {
    const response = await client.get(`/admin/registrations/${id}/attachments/${attachmentId}`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName || 'attachment'
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Revoked on the next tick so the download has already started.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  },
  async remove(id) {
    await client.delete(`/admin/registrations/${id}`)
  },
}

/**
 * The originally specified contract used /api/admin/contact/{id} and
 * /api/admin/whistleblower/{id} for both reading and updating. The deployed
 * API instead exposes /api/admin/contact-messages (list + /{id}/read) and
 * /api/admin/whistleblower (list + /{id}/review). These helpers try the
 * "real" shape first and gracefully fall back to the originally specified
 * one so the admin keeps working even if the backend changes slightly.
 */
async function tryRequests(requests) {
  let lastError
  for (const request of requests) {
    try {
      return await request()
    } catch (err) {
      lastError = err
      if (err?.response?.status !== 404) throw err
    }
  }
  throw lastError
}

export const contactApi = {
  async list(params) {
    const response = await tryRequests([
      () => client.get('/admin/contact-messages', { params }),
      () => client.get('/admin/contact', { params }),
    ])
    return unwrapList(response.data)
  },
  async markRead(id, isRead = true) {
    const response = await tryRequests([
      () => (isRead ? client.put(`/admin/contact-messages/${id}/read`) : client.put(`/admin/contact/${id}`, { isRead })),
      () => client.put(`/admin/contact/${id}`, { isRead }),
    ])
    return unwrapItem(response.data)
  },
  async remove(id) {
    await tryRequests([() => client.delete(`/admin/contact-messages/${id}`), () => client.delete(`/admin/contact/${id}`)])
  },
}

export const whistleblowerApi = {
  async list(params) {
    const response = await tryRequests([
      () => client.get('/admin/whistleblower', { params }),
    ])
    return unwrapList(response.data)
  },
  async markReviewed(id, isReviewed = true) {
    const response = await tryRequests([
      () => (isReviewed ? client.put(`/admin/whistleblower/${id}/review`) : client.put(`/admin/whistleblower/${id}`, { isReviewed })),
      () => client.put(`/admin/whistleblower/${id}`, { isReviewed }),
    ])
    return unwrapItem(response.data)
  },
  async remove(id) {
    await client.delete(`/admin/whistleblower/${id}`)
  },
}

/**
 * Settings are stored as a flat list of { key, valueAr, valueEn } rows rather
 * than a single object. `update` upserts one row at a time (matching the
 * real PUT /api/admin/settings contract).
 */
export const settingsApi = {
  async list() {
    const response = await client.get('/admin/settings')
    return unwrapList(response.data)
  },
  async update(row) {
    const response = await client.put('/admin/settings', row)
    return unwrapItem(response.data)
  },
}

export const dashboardApi = {
  async get() {
    const response = await client.get('/admin/dashboard')
    return unwrapItem(response.data)
  },
}
