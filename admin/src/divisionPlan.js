/**
 * Division Schedule — the editing draft for one division, mirroring the
 * server's Save Division Schedule algorithm exactly (no rules of its own):
 *
 *  - A ring's day is ONE shared queue. Bouts of other divisions keep their
 *    saved relative order; this division's bouts are inserted at their
 *    positions (lowest first). A bout's time is the ring/day first-bout time
 *    plus interval × (place − 1) — so a time is always a valid slot of the
 *    shared timeline and two bouts can never share a ring slot.
 *  - Nothing here is saved; the server re-checks and recalculates everything.
 */

export const keyOf = (ringId, date) => `${ringId}|${date}`

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '0:0')
    .split(':')
    .map(Number)
  return h * 60 + m
}

export const fromMinutes = (total) => {
  const day = Math.floor(total / 1440)
  const m = ((total % 1440) + 1440) % 1440
  const text = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return day > 0 ? `${text} (+${day}d)` : text
}

/**
 * Display only: a stored 24-hour "HH:mm" (optionally with " (+1d)") as a 12-hour time with AM/PM.
 * "17:00" → "05:00 PM", "00:00" → "12:00 AM", "12:00" → "12:00 PM", "09:30" → "09:30 AM".
 * The stored value and every calculation stay 24-hour.
 */
export function to12h(hhmm) {
  const match = /^(\d{1,2}):(\d{2})(.*)$/.exec(String(hhmm || ''))
  if (!match) return hhmm || ''
  const h = Number(match[1]) % 24
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${String(h12).padStart(2, '0')}:${match[2]} ${suffix}${match[3]}`
}

/** Every 24-hour time inside a server message ("15 Dec 15:00", "17:00 every 30 min") shown with AM/PM. */
export const times12h = (text) => String(text || '').replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (t) => to12h(t))

/** The 24-hour value for a 12-hour choice: (5, 0, 'PM') → "17:00"; (12, 0, 'AM') → "00:00". */
export function from12h(hour12, minute, suffix) {
  const h = (Number(hour12) % 12) + (suffix === 'PM' ? 12 : 0)
  return `${String(h).padStart(2, '0')}:${String(Number(minute)).padStart(2, '0')}`
}

/** The ring/day timing the draft uses: its own edit, else what the server has for that ring and day. */
export function timingFor(data, draft, ringId, date) {
  const edit = draft.timing[keyOf(ringId, date)]
  if (edit) return { first: edit.first, interval: Number(edit.interval), configured: true, edited: true }
  const day = data.rings.find((r) => r.id === ringId)?.days.find((d) => d.date === date)
  return day
    ? { first: day.firstBoutTime, interval: day.intervalMinutes, configured: day.configured, edited: false }
    : { first: data.tournament.defaultFirstBoutTime || '09:00', interval: 30, configured: false, edited: false }
}

/**
 * The merged queue of one ring/day: [{ id, mine, bout? }] in order.
 * @param {Set<number>} myIds   this division's bouts in the plan
 * @param {number|null} without leave this bout out (to offer its possible places)
 */
export function mergedQueue(data, draft, myIds, ringId, date, without = null, order = () => 0) {
  const others = data.bouts
    .filter((b) => !myIds.has(b.id) && b.ringId === ringId && b.date === date && b.queuePosition != null)
    .sort((a, b) => a.queuePosition - b.queuePosition || a.id - b.id)
    .map((b) => ({ id: b.id, mine: false, bout: b }))
  const mine = Object.entries(draft.bouts)
    .map(([id, v]) => ({ id: Number(id), ...v }))
    .filter((v) => v.id !== without && v.ringId === ringId && v.date === date)
    .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || order(a.id) - order(b.id))
  const queue = [...others]
  for (const m of mine) {
    const index = m.position == null ? queue.length : Math.min(Math.max(m.position - 1, 0), queue.length)
    queue.splice(index, 0, { id: m.id, mine: true })
  }
  return queue
}

/** Rewrites every position of this division's bouts to its actual place in its merged queue. */
export function normalize(data, draft, order) {
  const myIds = new Set(Object.keys(draft.bouts).map(Number))
  const keys = new Set(
    Object.values(draft.bouts)
      .filter((v) => v.ringId && v.date)
      .map((v) => keyOf(v.ringId, v.date)),
  )
  const bouts = { ...draft.bouts }
  for (const key of keys) {
    const [ringId, date] = [Number(key.split('|')[0]), key.split('|')[1]]
    mergedQueue(data, { ...draft, bouts }, myIds, ringId, date, null, order).forEach((item, i) => {
      if (item.mine) bouts[item.id] = { ...bouts[item.id], position: i + 1 }
    })
  }
  return { ...draft, bouts }
}

/** Puts one bout at a place (0-based) of a ring/day queue; null = the end. Returns a normalised draft. */
export function placeAt(data, draft, id, ringId, date, index, order) {
  // Without both a ring and a date the bout has no place in any queue yet (no time either).
  if (!ringId || !date) {
    const bouts = {
      ...draft.bouts,
      [id]: { ...draft.bouts[id], ringId: ringId || null, date: date || null, position: null },
    }
    return normalize(data, { ...draft, bouts }, order)
  }
  const myIds = new Set(Object.keys(draft.bouts).map(Number))
  const queue = mergedQueue(data, draft, myIds, ringId, date, id, order)
  const at = index == null ? queue.length : Math.min(Math.max(index, 0), queue.length)
  queue.splice(at, 0, { id, mine: true })
  const bouts = { ...draft.bouts, [id]: { ...draft.bouts[id], ringId, date } }
  queue.forEach((item, i) => {
    if (item.mine) bouts[item.id] = { ...bouts[item.id], position: i + 1 }
  })
  return normalize(data, { ...draft, bouts }, order)
}

/** An exact bout time as the server accepts it: 24-hour "HH:mm", one-minute precision (09:07, 14:23). */
export const isExactTime = (text) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(text || ''))

/**
 * The start time of each of this division's bouts in the draft: { [id]: "HH:mm" } — an exact time entered for
 * the bout, else its slot time (first-bout time + interval × place).
 */
export function draftTimes(data, draft) {
  const out = {}
  for (const [id, v] of Object.entries(draft.bouts)) {
    if (!v.ringId || !v.date || v.position == null) continue
    if (v.manual) {
      out[id] = v.manual
      continue
    }
    const t = timingFor(data, draft, v.ringId, v.date)
    out[id] = fromMinutes(toMinutes(t.first) + t.interval * (v.position - 1))
  }
  return out
}

/**
 * This division's bouts whose time is not after the bout before them in the same ring and day (possible only
 * with an exact time): { [id]: { time, previousTime } }. Mirrors the server's check; nothing is reordered.
 */
export function timeOrderProblems(data, draft, order) {
  const myIds = new Set(Object.keys(draft.bouts).map(Number))
  const mine = draftTimes(data, draft)
  const problems = {}
  const keys = new Set(Object.values(draft.bouts).filter((v) => v.ringId && v.date).map((v) => keyOf(v.ringId, v.date)))
  for (const key of keys) {
    const [ringId, date] = [Number(key.split('|')[0]), key.split('|')[1]]
    const t = timingFor(data, draft, ringId, date)
    let previous = null
    mergedQueue(data, draft, myIds, ringId, date, null, order).forEach((item, i) => {
      const time = item.mine
        ? mine[item.id]
        : item.bout.manualTime || fromMinutes(toMinutes(t.first) + t.interval * i)
      if (previous && item.mine && toMinutes(time) <= toMinutes(previous))
        problems[item.id] = { time, previousTime: previous }
      previous = time
    })
  }
  return problems
}

/** The places a bout can take on its ring/day: [{ index, time }] — every slot of the shared timeline. */
export function timeOptions(data, draft, id, order) {
  const v = draft.bouts[id]
  if (!v?.ringId || !v?.date) return []
  const myIds = new Set(Object.keys(draft.bouts).map(Number))
  const queue = mergedQueue(data, draft, myIds, v.ringId, v.date, id, order)
  const t = timingFor(data, draft, v.ringId, v.date)
  return Array.from({ length: queue.length + 1 }, (_, i) => ({
    index: i,
    time: fromMinutes(toMinutes(t.first) + t.interval * i),
    before: queue[i] && !queue[i].mine ? queue[i].bout : null,
  }))
}

/** Other divisions' bouts whose start time the draft would change (preview only; the server decides). */
export function othersShifted(data, draft, order) {
  const myIds = new Set(Object.keys(draft.bouts).map(Number))
  const keys = new Set()
  for (const v of Object.values(draft.bouts)) if (v.ringId && v.date) keys.add(keyOf(v.ringId, v.date))
  for (const b of data.bouts) if (myIds.has(b.id) && b.ringId && b.date) keys.add(keyOf(b.ringId, b.date))
  for (const k of Object.keys(draft.timing)) keys.add(k)
  const shifted = []
  for (const key of keys) {
    const [ringId, date] = [Number(key.split('|')[0]), key.split('|')[1]]
    const t = timingFor(data, draft, ringId, date)
    mergedQueue(data, draft, myIds, ringId, date, null, order).forEach((item, i) => {
      if (item.mine || item.bout.manualTime) return // an exact time stays as entered
      const time = fromMinutes(toMinutes(t.first) + t.interval * i)
      if (item.bout.startTime && item.bout.startTime !== time)
        shifted.push({ bout: item.bout, from: item.bout.startTime, to: time })
    })
  }
  return shifted
}

/**
 * Division Settings, once applied, follow the bouts: every day on which this division has a bout on the
 * applied ring takes the applied first-bout time and interval — including days chosen AFTER Apply (on a
 * multi-day tournament dates are picked bout by bout). Days the division does not use are never touched,
 * and no date is ever filled in here.
 */
export function syncTiming(draft) {
  if (!draft?.applied) return draft
  const { ringId, first, interval } = draft.applied
  const timing = {}
  for (const v of Object.values(draft.bouts))
    if (v.ringId === ringId && v.date) timing[keyOf(ringId, v.date)] = { first, interval }
  return { ...draft, timing }
}
