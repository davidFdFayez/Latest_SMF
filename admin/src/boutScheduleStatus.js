/**
 * Bout Schedule — the three overview statuses of a division, derived from
 * saved records only (nothing is assumed, nothing is written).
 *
 *   Not Scheduled (orange) → Scheduled (blue) → Published (green)
 *
 * These are separate from the internal Draft → Review → Approved lifecycle:
 * an approved schedule is NOT a published one, and a published bracket is
 * NOT a scheduled division.
 */

export const DIVISION_STATUS = {
  notScheduled: { key: 'not_scheduled', label: 'Not Scheduled', tone: 'orange' },
  scheduled: { key: 'scheduled', label: 'Scheduled', tone: 'blue' },
  published: { key: 'published', label: 'Published', tone: 'green' },
}

/** A bout that has to be fought (not a BYE, not a walkover) and so needs a slot. */
export const isFought = (bout) => !bout.isBye && !bout.isWalkover

/** Every part of a saved slot is present: day, ring, place in the ring's queue, bout number and start time. */
export const hasSavedSlot = (bout) =>
  Boolean(bout.date) &&
  bout.ringId != null &&
  bout.queuePosition != null &&
  bout.number != null &&
  Boolean(bout.startTime)

/**
 * @param {object}   args
 * @param {boolean}  args.scheduleExists  a schedule record exists for the tournament (any internal state)
 * @param {boolean}  args.saved           an administrator explicitly saved this division's schedule (persisted marker)
 * @param {object[]} args.bouts           this division's bouts, as the schedule API returns them
 * @param {object[]} args.issues          the schedule's validation issues ({ severity, boutIds })
 * @param {boolean}  args.bracketChanged  the published bracket changed since the schedule last took it in
 * @param {object|null} args.publication  this division's PUBLIC schedule publication, when one exists:
 *                                        { publishedAt, current } — `current` true when the published
 *                                        version is the saved one. No such record exists yet in the
 *                                        system, so callers pass null and Published cannot occur.
 */
export function divisionScheduleStatus({
  scheduleExists,
  saved = false,
  bouts,
  issues = [],
  bracketChanged = false,
  publication = null,
}) {
  const fought = bouts.filter(isFought)
  // 1. Not Scheduled unless explicitly saved AND every bout to fight has a complete saved slot, with no blocking
  //    problem. Slots alone (e.g. automatically initialised data) never make a division Scheduled.
  if (!scheduleExists || !saved || fought.length === 0 || !fought.every(hasSavedSlot))
    return DIVISION_STATUS.notScheduled
  if (bracketChanged) return DIVISION_STATUS.notScheduled
  const ids = new Set(fought.map((b) => b.id))
  const blocked = issues.some((i) => i.severity === 'blocking' && (i.boutIds || []).some((id) => ids.has(id)))
  if (blocked) return DIVISION_STATUS.notScheduled
  // 3. Published only from an explicit, current public publication — never from internal approval.
  if (publication?.publishedAt && publication.current === true) return DIVISION_STATUS.published
  // 2. Completely scheduled, not (currently) published.
  return DIVISION_STATUS.scheduled
}

const GENDER_RANK = { female: 0, male: 1 }

/**
 * The overview order: ALL Female divisions first, then ALL Male. Within a
 * gender, age categories youngest → oldest (the server's category order, from
 * the competition-category table — never alphabetical), and within an age
 * category the lightest weight first (the server's numeric SortWeight order).
 * Only published divisions with at least one bout to fight are kept.
 *
 * @param {object[]} categories the schedule API's `categories` (already published-only, in category order)
 */
export function orderDivisions(categories) {
  const list = []
  categories.forEach((c, ci) =>
    c.divisions.forEach((d, di) => {
      if (d.bouts > 0) list.push({ ...d, category: c.category, categoryEn: c.categoryEn, rank: [ci, di] })
    }),
  )
  const g = (x) => GENDER_RANK[x] ?? 2
  return list.sort((a, b) => g(a.gender) - g(b.gender) || a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1])
}
