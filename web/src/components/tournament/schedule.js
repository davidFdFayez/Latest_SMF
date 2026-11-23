import { formatTime12, intlLocale, toLatinDigits } from '../../utils/format';

/*
 * The public Schedule: five milestones, always in this workflow order, built
 * only from dates the tournament already has. Nothing is stored here; the
 * descriptions are interface text.
 *
 *   Registration Opens    registrationOpensAt (when it was published)
 *   Registration Closes   registrationClosesAt
 *   On-site / Medical     onSiteCheckInStartsAt … onSiteCheckInEndsAt (optional)
 *   Competition Begins    the first day at firstBoutTime
 *   Competition Ends      the last day
 *
 * A missing date is shown as "To be announced", never guessed.
 *
 * Time zone. The tournament's dates are stored without a zone:
 *  - the two registration moments are compared with the server's own clock
 *    (UTC) — the same rule that decides whether registration is open, so the
 *    badge and the Register button always agree;
 *  - the on-site window and the competition are the federation's wall-clock
 *    times as typed in the admin, i.e. Riyadh time (UTC+3, no daylight saving).
 */
const RIYADH_OFFSET_HOURS = 3;

/** The instant a stored date stands for, read in the given zone offset. */
export function instantOf(value, offsetHours) {
  if (!value) return null;
  const text = String(value).trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offsetHours * 3600 * 1000;
}

/** The calendar parts of a stored date, exactly as written (no zone shift). */
function partsOf(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(value || ''));
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] == null ? null : +m[4], mi: m[5] == null ? null : +m[5] };
}

/** Weekday and date of a stored date: "الخميس" + "11 ديسمبر 2026". */
function dayParts(value, lang) {
  const p = partsOf(value);
  if (!p) return null;
  // Noon UTC keeps the calendar day the same in every visitor's zone.
  const date = new Date(Date.UTC(p.y, p.mo - 1, p.d, 12));
  const locale = intlLocale(lang);
  return {
    weekday: date.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' }),
    date: toLatinDigits(date.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })),
  };
}

/** The 12-hour time a stored date carries, or '' when it is a date only (midnight). */
function timeOf(value, lang) {
  const p = partsOf(value);
  if (!p || p.h == null || (p.h === 0 && p.mi === 0)) return '';
  return formatTime12(`${p.h}:${String(p.mi).padStart(2, '0')}`, lang);
}

const sameDay = (a, b) => String(a).slice(0, 10) === String(b).slice(0, 10);
const DAY = 24 * 3600 * 1000;

/** upcoming → active → done, from a single moment or a start–end window. */
function statusOf(now, starts, ends) {
  if (starts == null) return null;
  if (now < starts) return 'upcoming';
  if (ends != null && now < ends) return 'active';
  return 'done';
}

export function buildSchedule({ activity, tournament, lang, now = Date.now() }) {
  const ar = lang === 'ar';
  const pick = (arabic, english) => (ar ? arabic : english);

  const opens = tournament.registrationOpensAt;
  const closes = tournament.registrationClosesAt;
  const siteStart = tournament.onSiteCheckInStartsAt;
  const siteEnd = tournament.onSiteCheckInEndsAt;
  const first = activity.startDate;
  const last = activity.endDate || activity.startDate;

  // On-site window: "9:00 ص إلى 3:30 م", or "… إلى الخميس، 03 ديسمبر 2026 3:30 م" over two days.
  let siteTime = timeOf(siteStart, lang);
  if (siteStart && siteEnd) {
    const endDay = dayParts(siteEnd, lang);
    const until = sameDay(siteStart, siteEnd) || !endDay
      ? timeOf(siteEnd, lang)
      : [`${endDay.weekday}${ar ? '، ' : ', '}${endDay.date}`, timeOf(siteEnd, lang)].filter(Boolean).join(' ');
    siteTime = [siteTime, until && `${pick('إلى', 'to')} ${until}`].filter(Boolean).join(' ');
  }

  // Competition begins on its first day at the first bout's time, when set.
  const bout = /^(\d{1,2}):(\d{2})/.exec(String(tournament.firstBoutTime || ''));
  const firstDay = first ? String(first).slice(0, 10) : null;
  const beginsAt = firstDay ? `${firstDay}T${bout ? `${bout[1].padStart(2, '0')}:${bout[2]}` : '00:00'}:00` : null;
  const lastDay = last ? String(last).slice(0, 10) : null;

  const rows = [
    {
      key: 'registration-opens',
      title: pick('فتح التسجيل', 'Registration Opens'),
      description: pick('بدء استقبال طلبات التسجيل للمشاركة في البطولة.', 'Tournament registration opens for athletes.'),
      icon: 'laptop',
      when: opens,
      time: '',
      status: statusOf(now, instantOf(opens, 0)),
    },
    {
      key: 'registration-closes',
      title: pick('إغلاق التسجيل', 'Registration Closes'),
      description: pick('آخر موعد لقبول طلبات التسجيل.', 'Final deadline for tournament registration.'),
      icon: 'laptop',
      when: closes,
      time: timeOf(closes, lang),
      status: statusOf(now, instantOf(closes, 0)),
    },
    {
      key: 'on-site',
      title: pick('التسجيل الحضوري والفحص الطبي والوزن', 'On-site Check-in, Medical Examination & Weigh-in'),
      description: pick('التسجيل في موقع البطولة، وإجراء الفحص الطبي، وقياس الوزن الرسمي.', 'On-site athlete check-in, medical examination and official weigh-in.'),
      icon: 'medical',
      when: siteStart,
      time: siteTime,
      status: statusOf(now, instantOf(siteStart, RIYADH_OFFSET_HOURS), instantOf(siteEnd, RIYADH_OFFSET_HOURS)),
    },
    {
      key: 'competition-begins',
      title: pick('بداية المنافسات', 'Competition Begins'),
      description: pick('انطلاق منافسات البطولة الرسمية.', 'Official tournament competition begins.'),
      icon: 'flag',
      when: beginsAt,
      time: bout ? formatTime12(tournament.firstBoutTime, lang) : '',
      status: statusOf(now, instantOf(beginsAt, RIYADH_OFFSET_HOURS)),
    },
    {
      key: 'competition-ends',
      title: pick('ختام المنافسات', 'Competition Ends'),
      description: pick('ختام المنافسات النهائية وتوزيع الجوائز.', 'Final competitions conclude and awards are presented.'),
      icon: 'trophy',
      when: lastDay,
      time: '',
      // The last day is a whole day of competition: it is over when that day is.
      status: lastDay ? statusOf(now, instantOf(lastDay, RIYADH_OFFSET_HOURS) + DAY) : null,
    },
  ].map((row) => ({ ...row, day: row.when ? dayParts(row.when, lang) : null }));

  // A row without a date has no status of its own.
  for (const row of rows) if (!row.day) row.status = null;

  // The marked step: the one under way, else the next to come, else the last.
  const current = rows.find((r) => r.status === 'active')
    || rows.find((r) => r.status === 'upcoming')
    || [...rows].reverse().find((r) => r.status === 'done');
  return rows.map((row) => ({ ...row, current: row === current }));
}
