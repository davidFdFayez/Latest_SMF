import { extractErrorMessage } from './api/utils'

/** Draw Management's shared wording. */

/** "U10" → "Under 10"; Elite and Masters keep their names. */
export function categoryName(categoryEn) {
  const under = /^U(\d+)$/i.exec(categoryEn || '')
  return under ? `Under ${under[1]}` : categoryEn
}

/** "Male — Under 10 — 24 kg" */
export function divisionTitle(gender, categoryEn, weightEn) {
  return [gender === 'female' ? 'Female' : 'Male', categoryName(categoryEn), weightEn].filter(Boolean).join(' — ')
}

/** The English message of a refused draw request (the admin is English-only). */
export function drawError(error, fallback) {
  const data = error?.response?.data
  return (data && typeof data === 'object' && data.messageEn) || extractErrorMessage(error, fallback)
}
