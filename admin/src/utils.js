/**
 * Origin of the public website, for "view on site" links and image previews.
 * Set VITE_PUBLIC_SITE_URL to be explicit; otherwise it is derived from where
 * the console runs — the Vite dev ports locally, and the deployment's
 * admin.* → smf.* host naming.
 */
export function siteOrigin() {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL
  if (configured) return String(configured).replace(/\/+$/, '')

  const { protocol, hostname, port } = window.location
  if (port === '5174') return `${protocol}//${hostname}:5173`
  if (hostname.startsWith('admin.')) return `${protocol}//${hostname.replace(/^admin\./, 'smf.')}${port ? `:${port}` : ''}`
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`
}

export function siteUrl(path = '/') {
  return `${siteOrigin()}${String(path).startsWith('/') ? path : `/${path}`}`
}

/**
 * A browsable URL for an image or file path stored in content. Uploads under
 * /api/ are proxied by the console itself; other site paths live on the
 * website's host.
 */
export function assetUrl(value) {
  if (!value) return ''
  if (/^https?:\/\//i.test(value) || value.startsWith('/api/')) return value
  return value.startsWith('/') ? siteUrl(value) : value
}

export function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
