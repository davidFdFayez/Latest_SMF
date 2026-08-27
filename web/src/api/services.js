import client from './client';

export async function fetchNews(params = {}) {
  try {
    const { data } = await client.get('/api/news', { params });
    if (Array.isArray(data)) return data;
    if (data?.items) return data.items;
    return null;
  } catch {
    return null;
  }
}

export async function fetchNewsById(id, lang = 'ar') {
  try {
    const { data } = await client.get(`/api/news/${id}`, { params: { lang } });
    return data || null;
  } catch {
    return null;
  }
}

export async function fetchEvents(params = {}) {
  try {
    const { data } = await client.get('/api/events', { params });
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export async function fetchEventById(id, lang = 'ar') {
  try {
    const { data } = await client.get(`/api/events/${id}`, { params: { lang } });
    return data || null;
  } catch {
    return null;
  }
}

export async function fetchResults(params = {}) {
  try {
    const { data } = await client.get('/api/results', { params });
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export async function fetchResultsStats() {
  try {
    const { data } = await client.get('/api/results/stats');
    return data || null;
  } catch {
    return null;
  }
}

/**
 * Approved clubs, centres, and academies for the public directory.
 * Returns null on failure so the page can show its own error state.
 */
export async function fetchClubs(params = {}) {
  try {
    const { data } = await client.get('/api/clubs', { params });
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export async function fetchClubRegions() {
  try {
    const { data } = await client.get('/api/clubs/regions');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchPage(slug, lang = 'ar') {
  try {
    const { data } = await client.get(`/api/pages/${slug}`, { params: { lang } });
    return data || null;
  } catch {
    return null;
  }
}

export async function submitRegistration(type, payload) {
  const { data } = await client.post('/api/registrations', { type, payload });
  return data;
}

/**
 * Uploads one registration document and returns the stored reference
 * ({ id, fileName, contentType, size }) that the submitted payload carries.
 *
 * Overrides the client defaults: the browser must set its own multipart
 * boundary, and a scanned licence needs longer than the shared 8s timeout.
 */
export async function uploadRegistrationAttachment(file, onProgress) {
  const body = new FormData();
  body.append('file', file);

  const { data } = await client.post('/api/registrations/attachments', body, {
    headers: { 'Content-Type': undefined },
    timeout: 60000,
    onUploadProgress: onProgress
      ? (event) => onProgress(event.total ? Math.round((event.loaded * 100) / event.total) : 0)
      : undefined,
  });

  return data;
}

export async function submitWhistleblower(payload) {
  const { data } = await client.post('/api/whistleblower', payload);
  return data;
}

export async function submitContact(payload) {
  const { data } = await client.post('/api/contact', payload);
  return data;
}
