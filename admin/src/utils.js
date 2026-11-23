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

/**
 * The permission that editing a tournament takes, mirroring the API: a draft
 * that has never been published (or a new one) is "Create & edit
 * tournaments"; from publication on it is "Approve, publish & edit published
 * tournaments". Presentation only — the API enforces it.
 */
export function tournamentEditPermission(tournament) {
  return !tournament || (tournament.status === 'draft' && !tournament.publishedAt)
    ? 'tournament.manage'
    : 'tournament.approve'
}

const GENDER_ORDER = { female: 0, male: 1 }

/**
 * Tournament divisions in display order: Female before Male, then category
 * youngest to oldest, then weight lightest to heaviest.
 *
 * `categoryOrder` is the category values in their official order — the
 * tournament options' `categories` list, U8 through Masters 45+ — so the
 * order is never alphabetical (which would put U10 before U8). The weight
 * key matches the API's SortWeight: an open "+" class has no upper limit and
 * goes after every class that does.
 */
export function sortDivisions(divisions, categoryOrder) {
  const rank = (category) => {
    const index = categoryOrder.indexOf(category)
    return index < 0 ? categoryOrder.length : index
  }
  const weight = (division) =>
    division.weightLimitKg ?? (division.weightFloorKg ?? 0) + 1000

  return [...divisions].sort(
    (a, b) =>
      (GENDER_ORDER[a.gender] ?? 2) - (GENDER_ORDER[b.gender] ?? 2) ||
      rank(a.category) - rank(b.category) ||
      weight(a) - weight(b) ||
      a.id - b.id,
  )
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
