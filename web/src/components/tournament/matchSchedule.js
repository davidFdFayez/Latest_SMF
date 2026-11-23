/*
 * Pure helpers for the public Match Schedule (no React, no network), so the
 * page logic can be tested on its own. Everything is read from the PUBLISHED
 * snapshot exactly as the API returns it; nothing here changes or invents data.
 */

/** "15:00" → "03:00 PM" — the 12-hour form used by the reference design, in both languages. */
export function formatBoutTime(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return '';
  return `${String(h % 12 || 12).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Tournament-wide figures for the side panel: every published bout, day and ring. */
export function scheduleStats(schedule) {
  const days = schedule?.days || [];
  const rings = new Set();
  let bouts = 0;
  for (const d of days) {
    for (const r of d.rings || []) {
      rings.add(r.name);
      bouts += (r.bouts || []).length;
    }
  }
  return { bouts, days: days.length, rings: rings.size };
}

/** The filter choices, in the order they first appear in the published (officially numbered) schedule. */
export function filterOptions(schedule) {
  const divisions = new Map();
  const rings = [];
  for (const d of schedule?.days || []) {
    for (const r of d.rings || []) {
      if (r.name && !rings.includes(r.name)) rings.push(r.name);
      for (const b of r.bouts || []) {
        const key = b.divisionEn || b.divisionAr;
        if (key && !divisions.has(key)) divisions.set(key, { value: key, ar: b.divisionAr || b.divisionEn, en: b.divisionEn || b.divisionAr });
      }
    }
  }
  return { divisions: [...divisions.values()], rings };
}

/** One day's rings after the division and ring filters; rings left without a bout are dropped. */
export function filterDay(day, { division = '', ring = '' } = {}) {
  if (!day) return [];
  return (day.rings || [])
    .filter((r) => !ring || r.name === ring)
    .map((r) => ({ ...r, bouts: (r.bouts || []).filter((b) => !division || (b.divisionEn || b.divisionAr) === division) }))
    .filter((r) => r.bouts.length > 0);
}

/** A final bout is marked with the gold trophy (the colour key's "Final bout"). */
export const isFinal = (bout) => String(bout?.roundEn || '').trim().toLowerCase() === 'final';

const ISO2 = /^[A-Z]{2}$/;

/**
 * What a corner shows. A known athlete: name, club, and — only when the
 * snapshot carries them — a photo key and an ISO 3166-1 alpha-2 nationality.
 * A later-round slot: the snapshot's own "Winner of Bout n" text; never a
 * person, photo or country.
 */
export function cornerView(corner, ar) {
  const c = corner || {};
  if (c.nameAr || c.nameEn) {
    const nationality = typeof c.nationality === 'string' && ISO2.test(c.nationality.toUpperCase()) ? c.nationality.toUpperCase() : null;
    return {
      placeholder: false,
      name: ar ? c.nameAr || c.nameEn : c.nameEn || c.nameAr,
      club: c.club || null,
      photo: typeof c.photo === 'string' && c.photo ? c.photo : null,
      nationality,
    };
  }
  return { placeholder: true, name: (ar ? c.placeholderAr || c.placeholderEn : c.placeholderEn || c.placeholderAr) || '' };
}

/**
 * Where an athlete's public photo would be read from, by bout and corner —
 * never by an athlete, entry or file id (the same rule as the public bracket).
 * Used only when the published snapshot announces a photo key; today's
 * snapshot does not, so every athlete shows the neutral avatar.
 */
export const photoUrl = (tournamentId, number, corner, key) =>
  `/api/events/tournament-${tournamentId}/schedule/photo/${number}/${corner}?v=${encodeURIComponent(key)}`;
