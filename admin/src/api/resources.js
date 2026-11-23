import client from './client'
import { unwrapItem, unwrapList } from './utils'
import { cropToField } from '../bannerCrop'

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

/**
 * Website content (see ContentCatalog on the API). `get` returns the page's
 * schema alongside its current content; `reset` restores the built-in defaults.
 */
export const contentApi = {
  async list() {
    const response = await client.get('/admin/content')
    return response.data
  },
  async get(key) {
    const response = await client.get(`/admin/content/${key}`)
    return response.data
  },
  async save(key, content) {
    const response = await client.put(`/admin/content/${key}`, { content })
    return response.data
  },
  async reset(key) {
    const response = await client.delete(`/admin/content/${key}`)
    return response.data
  },
}

export const mediaApi = {
  /** Uploads one image or PDF; resolves to { url, name, fileName, contentType, size }. */
  async upload(file, onProgress) {
    const body = new FormData()
    body.append('file', file)
    const response = await client.post('/admin/media', body, {
      // Let the browser set the multipart boundary; the client default is JSON.
      headers: { 'Content-Type': undefined },
      onUploadProgress: onProgress
        ? (event) => onProgress(event.total ? Math.round((event.loaded * 100) / event.total) : 0)
        : undefined,
    })
    return response.data
  },
}

/**
 * Beneficiary profiles (ISSUE-03) — people and clubs rather than applications.
 * Derived by the API from the registrations, so there is nothing to keep in
 * step by hand.
 */
export const membersApi = {
  async list(params) {
    const response = await client.get('/admin/members', { params })
    return response.data || { total: 0, items: [] }
  },
  async get(id) {
    const response = await client.get(`/admin/members/${id}`)
    return unwrapItem(response.data)
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
  /** ISSUE-03 — the member's own card link and QR. */
  async card(id) {
    const response = await client.get(`/admin/registrations/${id}/card`)
    return response.data
  },
  /** Replaces the link, revoking every copy of the old one. */
  async regenerateCard(id) {
    const response = await client.post(`/admin/registrations/${id}/card/regenerate`)
    return response.data
  },
  /** BUG-11 — adds or replaces the document in one slot. Returns the record. */
  async uploadAttachment(id, slot, file) {
    const body = new FormData()
    body.append('file', file)
    const response = await client.post(`/admin/registrations/${id}/attachments?slot=${encodeURIComponent(slot)}`, body)
    return unwrapItem(response.data)
  },
  /** BUG-11 — takes a document off the record. Returns the record. */
  async deleteAttachment(id, attachmentId) {
    const response = await client.delete(`/admin/registrations/${id}/attachments/${attachmentId}`)
    return unwrapItem(response.data)
  },
  async remove(id) {
    await client.delete(`/admin/registrations/${id}`)
  },

  /** Full record including the payload — the list projection omits it. */
  async get(id) {
    const response = await client.get(`/admin/registrations/${id}`)
    return unwrapItem(response.data)
  },

  /**
   * The four membership tracks with their stages, terms and fees (§2-§5 of the
   * Phase 2 workflow document), served by the API so the console shows the
   * federation's actual procedure rather than a copy that can drift.
   */
  async tracks() {
    const response = await client.get('/admin/registrations/tracks')
    return unwrapList(response.data)
  },

  /**
   * What the signed-in user may do (§6). Used to hide controls the API would
   * refuse; the API always re-checks, so this is presentation only.
   */
  async permissions() {
    const response = await client.get('/admin/registrations/permissions')
    return unwrapItem(response.data)
  },

  /** Append-only trail of who did what to this request (compliance case P6). */
  async audit(id) {
    const response = await client.get(`/admin/registrations/${id}/audit`)
    return unwrapList(response.data)
  },

  /**
   * §6 — puts a rejected or cancelled request back into review. Requires
   * the approve permission and a reason.
   */
  async reopen(id, reason) {
    const response = await client.post(`/admin/registrations/${id}/reopen`, { reason })
    return unwrapItem(response.data)
  },

  /** Every email and SMS sent about this request, and what happened to it. */
  async notifications(id) {
    const response = await client.get(`/admin/registrations/${id}/notifications`)
    return unwrapList(response.data)
  },

  /** Restarts the three-year term (§1). Requires the approve permission. */
  async renew(id) {
    const response = await client.post(`/admin/registrations/${id}/renew`)
    return unwrapItem(response.data)
  },

  /**
   * §6 تعديل — amends a stored request. `patch` carries any of
   * { payload, internalNotes, membershipNumber }; the API re-validates the
   * payload with the same rules the public form uses.
   */
  async update(id, patch) {
    const response = await client.put(`/admin/registrations/${id}`, patch)
    return unwrapItem(response.data)
  },

  /**
   * §6 تصدير — downloads the register as CSV. Behind the bearer token, so it is
   * fetched as a blob and handed to the browser rather than linked.
   */
  async exportCsv(params) {
    const response = await client.get('/admin/registrations/export', {
      params,
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `smf-memberships-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  },

  /** Requests whose completion window has run out (§6). */
  async overdue() {
    const response = await client.get('/admin/registrations/overdue')
    return unwrapList(response.data)
  },

  async dueForRenewal(withinDays = 60) {
    const response = await client.get('/admin/registrations/due-for-renewal', { params: { withinDays } })
    return unwrapList(response.data)
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
      () =>
        isRead ? client.put(`/admin/contact-messages/${id}/read`) : client.put(`/admin/contact/${id}`, { isRead }),
      () => client.put(`/admin/contact/${id}`, { isRead }),
    ])
    return unwrapItem(response.data)
  },
  async remove(id) {
    await tryRequests([
      () => client.delete(`/admin/contact-messages/${id}`),
      () => client.delete(`/admin/contact/${id}`),
    ])
  },
}

export const whistleblowerApi = {
  async list(params) {
    const response = await tryRequests([() => client.get('/admin/whistleblower', { params })])
    return unwrapList(response.data)
  },
  async markReviewed(id, isReviewed = true) {
    const response = await tryRequests([
      () =>
        isReviewed
          ? client.put(`/admin/whistleblower/${id}/review`)
          : client.put(`/admin/whistleblower/${id}`, { isReviewed }),
      () => client.put(`/admin/whistleblower/${id}`, { isReviewed }),
    ])
    return unwrapItem(response.data)
  },
  async remove(id) {
    await client.delete(`/admin/whistleblower/${id}`)
  },
}

/**
 * Admin accounts. Usernames are fixed at creation; `update` carries
 * { displayName, isActive, roleIds }.
 */
export const usersApi = {
  ...createResource('/admin/users'),
  async resetPassword(id, password) {
    await client.post(`/admin/users/${id}/password`, { password })
  },
}

/** Roles and the permissions they grant. `create`/`update` carry { key?, nameEn, nameAr, descriptionEn, descriptionAr, permissions }. */
export const rolesApi = createResource('/admin/roles')

export const permissionsApi = {
  /** Permission groups, each flagging what the signed-in user may grant (`held`). */
  async catalog() {
    const response = await client.get('/admin/access/permissions')
    return unwrapList(response.data)
  },
}

/** Whether notifications can actually leave the server, and recent delivery counts. */
export const notificationsApi = {
  async status() {
    const response = await client.get('/admin/notifications/status')
    return response.data
  },
  async recent(params) {
    const response = await client.get('/admin/notifications', { params })
    return unwrapList(response.data)
  },
}

/** The audit trail across memberships, users, roles, content, news and events. */
export const auditApi = {
  async list(params) {
    const response = await client.get('/admin/audit', { params })
    return response.data
  },
}

export const dashboardApi = {
  async get() {
    const response = await client.get('/admin/dashboard')
    return unwrapItem(response.data)
  },
}

/**
 * Phase 3 — running a tournament. Grouped by the stage of the journey rather
 * than by entity, which is how the requirements read and how the work is done.
 */
export const tournamentsApi = {
  /* setup (REQ-01, REQ-02) */
  async options() {
    const response = await client.get('/admin/tournaments/options')
    return response.data
  },
  async list(params) {
    const response = await client.get('/admin/tournaments', { params })
    return unwrapList(response.data)
  },
  async get(id) {
    const response = await client.get(`/admin/tournaments/${id}`)
    return response.data
  },
  /** REQ-01 rules 2 and 3 — add to the tournament-type or competition-type list. */
  async addOption(kind, body) {
    const response = await client.post(`/admin/tournaments/options/${kind}`, body)
    return response.data
  },
  async weightClasses(category, gender) {
    const response = await client.get('/admin/tournaments/weight-classes', {
      params: { category, gender },
    })
    return unwrapList(response.data)
  },
  async create(body) {
    const response = await client.post('/admin/tournaments', body)
    return unwrapItem(response.data)
  },
  async update(id, body) {
    const response = await client.put(`/admin/tournaments/${id}`, body)
    return unwrapItem(response.data)
  },
  /** The public page's banner: JPG, PNG or WebP up to 5 MB, checked again by the API. */
  async uploadTournamentBanner(id, file, crop = null) {
    const body = new FormData()
    body.append('file', file)
    // Optional "x y zoom": the position chosen for this image before it existed
    // on the server. Without it the API starts the new image from the default.
    const position = cropToField(crop)
    if (position) body.append('crop', position)
    // The client defaults to JSON; let the browser set the multipart boundary.
    const response = await client.post(`/admin/tournaments/${id}/banner`, body, {
      headers: { 'Content-Type': undefined },
    })
    return response.data
  },
  async removeTournamentBanner(id) {
    const response = await client.delete(`/admin/tournaments/${id}/banner`)
    return response.data
  },
  async publish(id) {
    const response = await client.post(`/admin/tournaments/${id}/publish`)
    return unwrapItem(response.data)
  },
  async setStatus(id, status) {
    const response = await client.post(`/admin/tournaments/${id}/status`, { status })
    return unwrapItem(response.data)
  },
  async extendRegistration(id, closesAt) {
    const response = await client.post(`/admin/tournaments/${id}/registration-closes`, { closesAt })
    return unwrapItem(response.data)
  },

  /* entries (REQ-03) */
  async eligibility(id, athleteId) {
    const response = await client.get(`/admin/tournaments/${id}/eligibility/${athleteId}`)
    return response.data
  },
  async entries(id, params) {
    const response = await client.get(`/admin/tournaments/${id}/entries`, { params })
    return unwrapList(response.data)
  },
  async enter(id, body) {
    const response = await client.post(`/admin/tournaments/${id}/entries`, body)
    return unwrapItem(response.data)
  },
  /** The Participants page: live entries with their Medical File status. */
  async participants(id) {
    const response = await client.get(`/admin/tournaments/${id}/participants`)
    return response.data
  },
  /** Category and weight class of one entry — validated and audited by the API. */
  async changeEntryCategory(entryId, body) {
    const response = await client.put(`/admin/tournaments/entries/${entryId}/category`, body)
    return response.data
  },
  /** Same blob-download pattern as the membership register's export. */
  async exportParticipants(id) {
    const response = await client.get(`/admin/tournaments/${id}/participants/export`, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `smf-participants-${id}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  },
  /** The entry's athlete's Medical File — needs the technical team's permission. */
  async entryMedical(entryId) {
    const response = await client.get(`/admin/tournaments/entries/${entryId}/medical`)
    return response.data
  },
  /**
   * Opens a stored medical document in a new tab. Behind the bearer token, so
   * it is fetched as a blob; the tab is opened first so the browser does not
   * treat it as a pop-up.
   */
  async openEntryMedicalDocument(entryId, slot) {
    const tab = window.open('', '_blank')
    try {
      const response = await client.get(`/admin/tournaments/entries/${entryId}/medical/documents/${slot}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(response.data)
      if (tab) tab.location.href = url
      else window.location.assign(url)
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      tab?.close()
      throw err
    }
  },
  /** The examination desk's edit of health answers, medication details and electronic declarations. */
  async updateEntryMedicalAnswers(entryId, body) {
    const response = await client.put(`/admin/tournaments/entries/${entryId}/medical/answers`, body)
    return response.data
  },
  /** Uploads or replaces one document; approved by the API as it is stored. */
  async uploadEntryMedicalDocument(entryId, slot, file, date) {
    const body = new FormData()
    body.append('file', file)
    if (date) body.append('date', date)
    // The client defaults to JSON; let the browser set the multipart boundary.
    const response = await client.post(`/admin/tournaments/entries/${entryId}/medical/documents/${slot}`, body, {
      headers: { 'Content-Type': undefined },
    })
    return response.data
  },
  async amendEntry(entryId, body) {
    const response = await client.put(`/admin/tournaments/entries/${entryId}`, body)
    return unwrapItem(response.data)
  },
  async withdraw(entryId, reason) {
    const response = await client.post(`/admin/tournaments/entries/${entryId}/withdraw`, { reason })
    return unwrapItem(response.data)
  },

  /* readiness (REQ-08, REQ-09) */
  /** With a reason, corrects a No Show recorded at check-in. */
  async checkIn(entryId, reason) {
    const response = await client.post(
      `/admin/tournaments/entries/${entryId}/check-in`,
      reason ? { reason } : undefined,
    )
    return unwrapItem(response.data)
  },
  async recordMedical(entryId, body) {
    const response = await client.post(`/admin/tournaments/entries/${entryId}/medical`, body)
    return unwrapItem(response.data)
  },
  async previewWeighIn(entryId, weightKg) {
    const response = await client.get(`/admin/tournaments/entries/${entryId}/weigh-in/preview`, {
      params: { weightKg },
    })
    return response.data
  },
  async recordWeighIn(entryId, body) {
    const response = await client.post(`/admin/tournaments/entries/${entryId}/weigh-in`, body)
    return unwrapItem(response.data)
  },
  /** The approver's refusal: all three steps passed, not released to the draw. Reason required. */
  async rejectReadiness(entryId, reason) {
    const response = await client.post(`/admin/tournaments/entries/${entryId}/reject`, { reason })
    return response.data
  },
  /** Draw Management overview: divisions with Final-Draw-Approved counts and draw state (read-only). */
  async drawOverview(id) {
    const response = await client.get(`/admin/tournaments/${id}/draw-overview`)
    return response.data
  },
  /** Draw Management, one division: its Final-Draw-Approved athletes and bracket numbers (read-only). */
  async drawPreparation(divisionId) {
    const response = await client.get(`/admin/tournaments/divisions/${divisionId}/draw-preparation`)
    return response.data
  },
  /** Draw Management: generate a division's draw as a Draft (dryRun only checks). */
  async generateDraw(divisionId, body) {
    const response = await client.post(`/admin/tournaments/divisions/${divisionId}/draw/generate`, body)
    return response.data
  },
  /** Draw Management: replace a changed Draft — reviewed lists, a reason and an explicit confirmation. */
  async regenerateDraw(divisionId, body) {
    const response = await client.post(`/admin/tournaments/divisions/${divisionId}/draw/regenerate`, body)
    return response.data
  },
  /** Draw Management: a division's bracket, read-only. */
  async drawBracket(divisionId) {
    const response = await client.get(`/admin/tournaments/divisions/${divisionId}/draw-bracket`)
    return response.data
  },
  /**
   * An athlete's profile photo for the bracket, behind the bearer token, as a
   * blob. `key` is the photo's version from the bracket, so a replaced photo
   * is not served from the browser cache.
   */
  async drawBracketPhoto(divisionId, entryId, key) {
    const response = await client.get(`/admin/tournaments/divisions/${divisionId}/draw-bracket/photos/${entryId}`, {
      params: { v: key },
      responseType: 'blob',
    })
    return response.data
  },
  /** Check-in & Medical: every live entry with where it stands in the three readiness steps. */
  async readiness(id) {
    const response = await client.get(`/admin/tournaments/${id}/readiness`)
    return response.data
  },
  /** REQ-09 rule 4 — another class of the same category and gender, keeping the measured weight. */
  async moveAtWeighIn(entryId, body) {
    const response = await client.post(`/admin/tournaments/entries/${entryId}/weigh-in/move`, body)
    return response.data
  },
  /** With a reason, changes a Rejected decision to Approved. */
  async approveReadiness(entryId, reason) {
    const response = await client.post(`/admin/tournaments/entries/${entryId}/approve`, reason ? { reason } : undefined)
    return unwrapItem(response.data)
  },

  /* the draw (REQ-10) */
  async draw(divisionId) {
    const response = await client.get(`/admin/tournaments/divisions/${divisionId}/draw`)
    return response.data
  },
  async createDraw(divisionId, body) {
    const response = await client.post(`/admin/tournaments/divisions/${divisionId}/draw`, body)
    return response.data
  },
  /** Publish a Draft (Draw Approval). Draw Management sends the lists it showed; the legacy page sends none. */
  async publishDraw(divisionId, body) {
    const response = await client.post(`/admin/tournaments/divisions/${divisionId}/draw/publish`, body)
    return response.data
  },
  async setCorner(boutId, body) {
    const response = await client.put(`/admin/tournaments/bouts/${boutId}/corner`, body)
    return response.data
  },

  /* the schedule (REQ-11) */
  async schedule(id) {
    const response = await client.get(`/admin/tournaments/${id}/schedule`)
    return response.data
  },
  async addRing(id, body) {
    const response = await client.post(`/admin/tournaments/${id}/rings`, body)
    return response.data
  },
  async updateRing(ringId, body) {
    const response = await client.put(`/admin/tournaments/rings/${ringId}`, body)
    return response.data
  },
  async removeRing(ringId) {
    await client.delete(`/admin/tournaments/rings/${ringId}`)
  },
  async setDivisionSchedule(divisionId, body) {
    const response = await client.put(`/admin/tournaments/divisions/${divisionId}/schedule`, body)
    return response.data
  },
  async moveBout(boutId, body) {
    const response = await client.put(`/admin/tournaments/bouts/${boutId}/slot`, body)
    return response.data
  },
  async generateSchedule(id, body) {
    const response = await client.post(`/admin/tournaments/${id}/schedule/generate`, body || {})
    return response.data
  },
  /** REQ-11 rule 14 — signing the running order off, separately from making it. */
  async approveSchedule(id) {
    const response = await client.post(`/admin/tournaments/${id}/schedule/approve`)
    return response.data
  },
  /** D3: withdraw the schedule approval — an approver, with a reason; nothing in the schedule changes. */
  async withdrawScheduleApproval(id, reason) {
    const response = await client.post(`/admin/tournaments/${id}/schedule/withdraw-approval`, { reason })
    return response.data
  },
}

/** Stage 5 — REQ-11 Bout Schedule. Every change carries the revision the page shows. */
/** Admin Notification Center — only the notifications the signed-in administrator's permissions grant. */
export const notificationCenterApi = {
  async list() {
    return (await client.get('/admin/notification-center')).data
  },
  async unreadCount() {
    return (await client.get('/admin/notification-center/unread-count')).data
  },
  async read(id) {
    return (await client.post(`/admin/notification-center/${id}/read`)).data
  },
  async readAll() {
    return (await client.post('/admin/notification-center/read-all')).data
  },
}

export const boutScheduleApi = {
  async view(id) {
    return (await client.get(`/admin/tournaments/${id}/bout-schedule`)).data
  },
  /** Read-only: draw changes since the schedule was published, per affected division. */
  async changes(id) {
    return (await client.get(`/admin/tournaments/${id}/schedule/changes`)).data
  },
  async history(id) {
    return (await client.get(`/admin/tournaments/${id}/bout-schedule/history`)).data
  },
  async create(id) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule`)).data
  },
  async addRing(id, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/rings`, body)).data
  },
  /** Step 3 — the single tournament-wide publication (assigns the official numbers) and its withdrawal. */
  async publish(id, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/publish`, body)).data
  },
  async unpublish(id, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/unpublish`, body)).data
  },
  /** Save Division Schedule (dryRun: true = the same checks, rolled back, for the confirmation preview). */
  async saveDivision(id, divisionId, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/divisions/${divisionId}/save`, body)).data
  },
  async updateRing(id, ringId, body) {
    return (await client.put(`/admin/tournaments/${id}/bout-schedule/rings/${ringId}`, body)).data
  },
  async removeRing(id, ringId, expectedRevision) {
    return (
      await client.delete(`/admin/tournaments/${id}/bout-schedule/rings/${ringId}`, { params: { expectedRevision } })
    ).data
  },
  async setRingDay(id, body) {
    return (await client.put(`/admin/tournaments/${id}/bout-schedule/ring-days`, body)).data
  },
  async assign(id, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/assign`, body)).data
  },
  async move(id, boutId, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/bouts/${boutId}/move`, body)).data
  },
  async unassign(id, boutId, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/bouts/${boutId}/unassign`, body)).data
  },
  async submit(id, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/submit`, body)).data
  },
  async approve(id, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/approve`, body)).data
  },
  async withdraw(id, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/withdraw-approval`, body)).data
  },
  async acknowledgeSource(id, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/source/acknowledge`, body)).data
  },
  async grantException(id, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/exceptions`, body)).data
  },
  async revokeException(id, exceptionId, body) {
    return (await client.post(`/admin/tournaments/${id}/bout-schedule/exceptions/${exceptionId}/revoke`, body)).data
  },
}

/** An athlete's medical file and any medical suspensions (REQ-04, REQ-03 rule 3). */
export const athleteMedicalApi = {
  async form() {
    const response = await client.get('/admin/athletes/medical/form')
    return response.data
  },
  async get(athleteId) {
    const response = await client.get(`/admin/athletes/${athleteId}/medical`)
    return response.data
  },
  async save(athleteId, body) {
    const response = await client.put(`/admin/athletes/${athleteId}/medical`, body)
    return response.data
  },
  async approve(athleteId) {
    const response = await client.post(`/admin/athletes/${athleteId}/medical/approve`)
    return response.data
  },
  async reject(athleteId, reason) {
    const response = await client.post(`/admin/athletes/${athleteId}/medical/reject`, { reason })
    return response.data
  },
  /** REQ-04 rule 3 — the printable guardian consent, with the athlete on it. */
  guardianConsentUrl(athleteId) {
    return `/api/admin/athletes/${athleteId}/medical/guardian-consent`
  },
  async suspensions(athleteId) {
    const response = await client.get(`/admin/athletes/${athleteId}/suspensions`)
    return unwrapList(response.data)
  },
  async addSuspension(athleteId, body) {
    const response = await client.post(`/admin/athletes/${athleteId}/suspensions`, body)
    return response.data
  },
  async liftSuspension(suspensionId, reason) {
    const response = await client.post(`/admin/athletes/suspensions/${suspensionId}/lift`, { reason })
    return response.data
  },
}

/** Club, coach and athlete accounts, from the console's side (REQ-05/06/07). */
export const memberAccountsApi = {
  async list(params) {
    const response = await client.get('/admin/member-accounts', { params })
    return unwrapList(response.data)
  },
  async invite(body) {
    const response = await client.post('/admin/member-accounts/invite', body)
    return response.data
  },
  async resend(accountId) {
    const response = await client.post(`/admin/member-accounts/${accountId}/resend`)
    return response.data
  },
  /** A fresh activation link, for an account that never received one. */
  async inviteLink(accountId) {
    const response = await client.post(`/admin/member-accounts/${accountId}/invite-link`)
    return response.data
  },
  async setActive(accountId, isActive) {
    const response = await client.post(`/admin/member-accounts/${accountId}/active`, { isActive })
    return response.data
  },
  async changes(params) {
    const response = await client.get('/admin/member-accounts/changes', { params })
    return unwrapList(response.data)
  },
  async reviewChange(changeId, approve, note) {
    const response = await client.post(`/admin/member-accounts/changes/${changeId}/review`, {
      approve,
      note,
    })
    return response.data
  },
}
