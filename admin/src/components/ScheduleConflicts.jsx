import { useMemo, useState } from 'react'
import { AlertIcon, ArrowDownIcon } from './Icons'
import { times12h } from '../divisionPlan'

/**
 * Stage 5 — a compact summary of why a schedule could not be saved or
 * published, used by Save Division Schedule and Publish Schedule alike.
 *
 * The server's issues are de-duplicated (same kind, athlete, day and bouts =
 * one conflict), counted, explained in one sentence, and only listed — grouped
 * by athlete, or by division / other — when the administrator asks
 * ("Review Conflicts"). The rules themselves are the server's; nothing here
 * decides what is allowed.
 *
 * @param {string}   verb         "Save" or "Publish"
 * @param {object[]} issues       [{ code, messageEn, boutIds, date, subject, potential }]
 * @param {string}   [message]    the server's one-line refusal, for anything not covered by issues
 * @param {function} describeBout (boutId) → "Preliminary · Match 3 — Ring A, Day 1, 03:00 PM"
 * @param {function} dayOf        ("yyyy-mm-dd") → "Day 2"
 */

const KIND = {
  athlete_daily_limit: {
    label: 'More than one bout on the same day',
    fix: 'Move one of these bouts to another day, or ask an authorised person to grant a daily exception.',
  },
  athlete_max_three: {
    label: 'More than three bouts on one day',
    fix: 'No athlete may have more than three bouts a day, even with an exception. Move a bout to another day.',
  },
  athlete_rest: {
    label: 'Less than two hours of rest',
    fix: 'Leave at least two hours between these bouts: give one a later time or another day.',
  },
  athlete_overlap: {
    label: 'Two bouts at the same time',
    fix: 'Give these bouts different times (they are on different rings at the same moment).',
  },
}

const SENTENCE = {
  athlete_daily_limit: 'Some athletes would compete more than once on the same day.',
  athlete_max_three: 'Some athletes would have more than three bouts in one day.',
  athlete_rest: 'Some athletes would not have the required two hours of rest between bouts.',
  athlete_overlap: 'Some athletes would be in two bouts at the same time.',
  division_not_scheduled: 'Some divisions are not scheduled yet.',
  not_approved: 'The schedule has not been approved.',
  missing_date: 'Some bouts have no day yet.',
  numbering: 'Bout numbers or times need recalculating.',
  source_changed: 'A draw changed since the schedule last accepted it.',
  draw_unpublished: 'An updated draw is not published yet.',
  source_removed: 'A division no longer has a draw.',
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function ScheduleConflicts({ verb = 'Save', issues = [], message, describeBout, dayOf }) {
  const [open, setOpen] = useState(false)
  const conflicts = useMemo(() => {
    const seen = new Map()
    for (const i of issues) {
      const key = `${i.code}|${i.subject || ''}|${i.date || ''}|${[...(i.boutIds || [])].sort((a, b) => a - b).join(',')}`
      if (!seen.has(key)) seen.set(key, i)
    }
    return [...seen.values()]
  }, [issues])
  const athlete = conflicts.filter((c) => c.code?.startsWith('athlete_'))
  const other = conflicts.filter((c) => !c.code?.startsWith('athlete_'))
  const byAthlete = useMemo(() => {
    const groups = new Map()
    for (const c of athlete) {
      const who = c.subject || 'Athlete'
      if (!groups.has(who)) groups.set(who, [])
      groups.get(who).push(c)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [athlete])
  const count = conflicts.length || 1
  const noun = athlete.length > 0 && other.length === 0 ? 'Scheduling Conflict' : 'Issue'
  const kinds = [...new Set(conflicts.map((c) => c.code))]
  const sentence =
    kinds
      .map((k) => SENTENCE[k])
      .filter(Boolean)
      .join(' ') ||
    message ||
    'The schedule did not pass validation.'
  const potential = athlete.some((c) => c.potential)

  return (
    <div className="sc-summary" role="alert" data-testid="sc-summary">
      <div className="sc-summary__head">
        <AlertIcon className="sc-summary__icon" aria-hidden="true" />
        <div className="sc-summary__text">
          <strong data-testid="sc-title">
            Cannot {verb} Schedule — {plural(count, noun)}
          </strong>
          <span data-testid="sc-sentence">
            {sentence}
            {potential && ' This includes athletes who could reach later rounds.'}
          </span>
        </div>
        {conflicts.length > 0 && (
          <button
            type="button"
            className="sc-summary__toggle"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            data-testid="sc-review"
          >
            {open ? 'Hide Conflicts' : 'Review Conflicts'}
            <ArrowDownIcon className={open ? 'is-open' : ''} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <div className="sc-details" data-testid="sc-details">
          {byAthlete.map(([who, items]) => (
            <section key={who} className="sc-group" data-testid="sc-group">
              <h4 className="sc-group__title">{who}</h4>
              <ul>
                {items.map((c, n) => (
                  <li key={n} className="sc-item">
                    <span className="sc-item__kind">
                      {KIND[c.code]?.label || c.code}
                      {c.date && dayOf ? ` · ${dayOf(c.date)}` : ''}
                    </span>
                    <ul className="sc-item__bouts">
                      {(c.boutIds || []).map((id) => (
                        <li key={id}>{describeBout ? describeBout(id) : `Bout ${id}`}</li>
                      ))}
                    </ul>
                    <span className="sc-item__fix">{KIND[c.code]?.fix}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {other.length > 0 && (
            <section className="sc-group" data-testid="sc-group">
              <h4 className="sc-group__title">{byAthlete.length ? 'Other issues' : 'Issues'}</h4>
              <ul>
                {other.map((c, n) => (
                  <li key={n} className="sc-item">
                    <span className="sc-item__kind">{c.subject || SENTENCE[c.code] || c.code}</span>
                    <span className="sc-item__fix">{times12h(c.messageEn)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
