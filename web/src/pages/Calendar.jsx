import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import PageHero from '../components/PageHero';
import { fetchEvents } from '../api/services';
import { formatDateRange, toLatinDigits } from '../utils/format';
import { usePageContent, useText } from '../content/useContent';

/* TXT-34/35/36 — the federation's own terminology: training rather than
   workshops, "internal" rather than "regional", "international championships"
   rather than "international competitions". */
const FILTERS = [
  { key: 'all', ar: 'الكل', en: 'All' },
  { key: 'community', ar: 'فعاليات مجتمعية', en: 'Community' },
  { key: 'regional', ar: 'بطولات داخلية', en: 'Regional' },
  { key: 'international', ar: 'بطولات دولية', en: 'International' },
  { key: 'camp', ar: 'معسكرات تدريبية', en: 'Camps' },
  { key: 'workshop', ar: 'تدريب', en: 'Workshops' },
];

const STATUS = {
  confirmed: { ar: 'مؤكد', en: 'Confirmed' },
  tentative: { ar: 'مبدئي', en: 'Tentative' },
  completed: { ar: 'منتهية', en: 'Completed' },
  ongoing: { ar: 'جارية الآن', en: 'Ongoing' },
};

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* The week starts on Sunday, as it does in Saudi Arabia. The grid itself is
   laid out by the document direction, so in Arabic Sunday sits on the right
   and the week reads right-to-left without any mirroring logic here. */
const WEEKDAYS = [
  { ar: 'الأحد', en: 'Sunday', shortAr: 'ح', shortEn: 'Su' },
  { ar: 'الاثنين', en: 'Monday', shortAr: 'ن', shortEn: 'Mo' },
  { ar: 'الثلاثاء', en: 'Tuesday', shortAr: 'ث', shortEn: 'Tu' },
  { ar: 'الأربعاء', en: 'Wednesday', shortAr: 'ر', shortEn: 'We' },
  { ar: 'الخميس', en: 'Thursday', shortAr: 'خ', shortEn: 'Th' },
  { ar: 'الجمعة', en: 'Friday', shortAr: 'ج', shortEn: 'Fr' },
  { ar: 'السبت', en: 'Saturday', shortAr: 'س', shortEn: 'Sa' },
];

const yearOf = (event) => new Date(event.startDate).getFullYear();

const titleOf = (event, ar) =>
  (ar ? event.titleAr || event.title : event.titleEn || event.title) || event.title || '';

/* When a day carries several events, one of them has to give the cell its
   colour. A training camp can run for two months and would otherwise bury every
   championship inside it, so the rarer, headline categories win the day. */
const CATEGORY_RANK = { international: 0, regional: 1, workshop: 2, community: 3, camp: 4 };
const byProminence = (a, b) =>
  (CATEGORY_RANK[a.category] ?? 9) - (CATEGORY_RANK[b.category] ?? 9);

/** Local calendar key, so a day is compared by its date and not by UTC offset. */
const dayKey = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export default function Calendar() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('calendar');
  const tx = useText();
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  // FEA-01 — the page only ever showed one year in one layout, so past seasons
  // were unreachable. Year and view are now the two axes of a real archive.
  const [year, setYear] = useState(null);
  const [view, setView] = useState('list');

  useEffect(() => {
    fetchEvents({ lang }).then((data) => setEvents(data || []));
  }, [lang]);

  /** Every year the calendar holds, newest first. */
  const years = useMemo(() => {
    const found = [...new Set(events.map(yearOf).filter(Number.isFinite))];
    return found.sort((a, b) => b - a);
  }, [events]);

  /* Land on the current year when it has events, otherwise the most recent. */
  useEffect(() => {
    if (year !== null || years.length === 0) return;
    const current = new Date().getFullYear();
    setYear(years.includes(current) ? current : years[0]);
  }, [years, year]);

  const inYear = useMemo(
    () => (year === null ? events : events.filter((event) => yearOf(event) === year)),
    [events, year],
  );

  const filtered = filter === 'all' ? inYear : inYear.filter((e) => e.category === filter);

  const stats = useMemo(() => {
    const count = (key) => inYear.filter((e) => e.category === key).length;
    return {
      total: inYear.length,
      international: count('international'),
      regional: count('regional'),
      camp: count('camp'),
      community: count('community'),
      workshop: count('workshop'),
    };
  }, [inYear]);

  const byMonth = useMemo(() => {
    const map = new Map();
    for (const ev of filtered) {
      const d = new Date(ev.startDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  /** Twelve buckets, used only by the "all years" fallback panel. */
  const grid = useMemo(() => {
    const months = Array.from({ length: 12 }, () => []);
    for (const ev of filtered) {
      const month = new Date(ev.startDate).getMonth();
      if (month >= 0 && month < 12) months[month].push(ev);
    }
    return months;
  }, [filtered]);

  /* QA — the year view used to be twelve bullet lists, which read as a list and
     not as a calendar. It is now a real day grid, so every event has to be
     resolved onto each calendar day it occupies, multi-day ranges included. */
  const eventsByDay = useMemo(() => {
    const map = new Map();
    if (year === null) return map;
    for (const ev of filtered) {
      const start = new Date(ev.startDate);
      if (Number.isNaN(start.getTime())) continue;
      const parsedEnd = ev.endDate ? new Date(ev.endDate) : start;
      const end = Number.isNaN(parsedEnd.getTime()) || parsedEnd < start ? start : parsedEnd;
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      // A malformed range must never spin the loop; 400 days covers any year.
      for (let step = 0; cursor <= last && step < 400; step += 1) {
        if (cursor.getFullYear() === year) {
          const key = dayKey(year, cursor.getMonth(), cursor.getDate());
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(ev);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    for (const dayEvents of map.values()) dayEvents.sort(byProminence);
    return map;
  }, [filtered, year]);

  if (!c) return fallback;

  // The title carries a {year} placeholder, so each language places the year itself.
  const heading = year === null
    ? tx(c.hero.titleAllYears)
    : tx(c.hero.title).replaceAll('{year}', toLatinDigits(year));

  return (
    <>
      <PageHero
        title={heading}
        /* TXT-02 — «وورش» corrected to «ودورات». */
        subtitle={tx(c.hero.subtitle)}
        breadcrumb={[
          { label: ar ? 'الأنشطة' : 'Activities', to: '/activities/calendar' },
          { label: ar ? 'التقويم' : 'Calendar' },
        ]}
      />

      <section className="section--green">
        <div className="container">
          <div className="hero-stats" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
            {[
              { value: stats.total, label: ar ? 'فعالية' : 'Events' },
              { value: stats.international, label: ar ? 'دولية' : 'International' },
              { value: stats.regional, label: ar ? 'داخلية' : 'Regional' },
              { value: stats.camp, label: ar ? 'معسكر' : 'Camps' },
              { value: stats.community, label: ar ? 'مجتمعية' : 'Community' },
              { value: stats.workshop, label: ar ? 'تدريب' : 'Training' },
            ].map((s) => (
              <div className="hero-stat" key={s.label}>
                <div className="hero-stat__val">{toLatinDigits(s.value)}</div>
                <div className="hero-stat__lbl">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          {/* FEA-01 — year navigation and the list/grid switch. */}
          <div className="cal-controls">
            <div className="cal-controls__group" role="group" aria-label={ar ? 'السنة' : 'Year'}>
              <span className="cal-controls__label">{ar ? 'السنة' : 'Year'}</span>
              {years.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={`btn btn--sm ${year === entry ? 'btn--green' : 'btn--outline'}`}
                  onClick={() => setYear(entry)}
                  aria-pressed={year === entry}
                >
                  {toLatinDigits(entry)}
                </button>
              ))}
              <button
                type="button"
                className={`btn btn--sm ${year === null ? 'btn--green' : 'btn--outline'}`}
                onClick={() => setYear(null)}
                aria-pressed={year === null}
              >
                {ar ? 'كل السنوات' : 'All years'}
              </button>
            </div>

            <div className="cal-controls__group" role="group" aria-label={ar ? 'طريقة العرض' : 'View'}>
              <span className="cal-controls__label">{ar ? 'العرض' : 'View'}</span>
              <button
                type="button"
                className={`btn btn--sm ${view === 'list' ? 'btn--green' : 'btn--outline'}`}
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
              >
                {ar ? 'قائمة' : 'List'}
              </button>
              <button
                type="button"
                className={`btn btn--sm ${view === 'grid' ? 'btn--green' : 'btn--outline'}`}
                onClick={() => setView('grid')}
                aria-pressed={view === 'grid'}
              >
                {ar ? 'شبكة السنة' : 'Year grid'}
              </button>
            </div>
          </div>

          <div className="cal-filters">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`btn ${filter === f.key ? 'btn--green' : 'btn--outline'}`}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
              >
                {ar ? f.ar : f.en}
                {f.key !== 'all' ? ` (${toLatinDigits(stats[f.key] || 0)})` : ''}
              </button>
            ))}
          </div>

          {view === 'list' && (
            byMonth.map(([key, monthEvents]) => {
              const [monthYear, monthNumber] = key.split('-');
              const monthIdx = Number(monthNumber) - 1;
              const monthLabel = ar ? MONTHS_AR[monthIdx] : MONTHS_EN[monthIdx];
              return (
                <div key={key} style={{ marginBottom: '2.5rem' }}>
                  <h2 className="s-heading" style={{ fontSize: '1.35rem', marginBottom: '1rem' }}>
                    {monthLabel} {toLatinDigits(monthYear)}
                    <span style={{ marginInlineStart: '0.75rem', fontSize: '0.95rem', color: '#64748b', fontWeight: 500 }}>
                      {toLatinDigits(monthEvents.length)} {ar ? 'فعالية' : 'events'}
                    </span>
                  </h2>
                  <div className="fed-hub__grid">
                    {monthEvents.map((ev) => (
                      <EventCard key={ev.id} ev={ev} ar={ar} lang={lang} />
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {/* A twelve-month day grid needs one year to draw. "All years" keeps the
              per-month summary panels instead — there is no single year to lay out. */}
          {view === 'grid' && year !== null && (
            <>
              <ul className="cal-legend">
                {FILTERS.filter((f) => f.key !== 'all').map((f) => (
                  <li className="cal-legend__item" key={f.key}>
                    <span className={`cal-legend__dot cat--${f.key}`} aria-hidden="true" />
                    {ar ? f.ar : f.en}
                  </li>
                ))}
              </ul>
              <p className="cal-year__hint">
                {ar
                  ? 'الأيام الملوّنة تحمل فعاليات. اختر يوماً لعرض تفاصيله.'
                  : 'Coloured days carry events. Choose a day to open it.'}
              </p>
              <div className="cal-year" key={`${year}-${filter}`}>
                {MONTHS_EN.map((_, month) => (
                  <CalendarMonth
                    key={month}
                    year={year}
                    month={month}
                    monthLabel={ar ? MONTHS_AR[month] : MONTHS_EN[month]}
                    eventsByDay={eventsByDay}
                    ar={ar}
                  />
                ))}
              </div>
            </>
          )}

          {view === 'grid' && year === null && (
            <>
              <p className="cal-year__hint">
                {ar
                  ? 'اختر سنة لعرض شبكة الأيام. «كل السنوات» تعرض ملخّصاً شهرياً.'
                  : 'Pick a year to see the day grid. “All years” shows a monthly summary.'}
              </p>
              <div className="cal-grid">
                {grid.map((monthEvents, index) => (
                  <div className={`cal-grid__month${monthEvents.length === 0 ? ' is-empty' : ''}`} key={index}>
                    <h3 className="cal-grid__month-name">
                      {ar ? MONTHS_AR[index] : MONTHS_EN[index]}
                      <span>{toLatinDigits(monthEvents.length)}</span>
                    </h3>
                    <ul className="cal-grid__list">
                      {monthEvents.map((ev) => (
                        <li key={ev.id} className={`cal-grid__item cat--${ev.category}`}>
                          <Link to={`/activities/event/${ev.id}`}>
                            <span className="cal-grid__item-date">
                              {formatDateRange(ev.startDate, ev.endDate, lang, { day: 'numeric', month: 'short' })}
                            </span>
                            <span className="cal-grid__item-title">
                              {ar ? ev.titleAr || ev.title : ev.titleEn || ev.title}
                            </span>
                          </Link>
                        </li>
                      ))}
                      {monthEvents.length === 0 && (
                        <li className="cal-grid__empty">
                          {ar ? 'لا توجد فعاليات' : 'No events'}
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          {filtered.length === 0 && (
            <p style={{ textAlign: 'center' }}>
              {ar ? 'لا توجد فعاليات مطابقة لهذا الاختيار.' : 'No events match this selection.'}
            </p>
          )}
        </div>
      </section>
    </>
  );
}

/**
 * One month of the year grid: weekday headings, the right starting weekday, the
 * right number of days, and every day that carries an event marked in its
 * category colour. A day with exactly one event links straight to it; a day with
 * several opens a short list beneath the month, which stays readable at the
 * width of a twelve-up grid and needs no popover positioning in either
 * direction.
 */
function CalendarMonth({ year, month, monthLabel, eventsByDay, ar }) {
  const [openDay, setOpenDay] = useState(null);

  const firstWeekday = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();

  const weeks = useMemo(() => {
    const cells = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= dayCount; day += 1) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [firstWeekday, dayCount]);

  /** Distinct events touching this month, for the header count. */
  const monthEvents = useMemo(() => {
    const seen = new Map();
    for (let day = 1; day <= dayCount; day += 1) {
      for (const ev of eventsByDay.get(dayKey(year, month, day)) || []) seen.set(ev.id, ev);
    }
    return [...seen.values()];
  }, [eventsByDay, year, month, dayCount]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const openEvents = openDay ? eventsByDay.get(dayKey(year, month, openDay)) || [] : [];

  return (
    <div className={`cal-month${monthEvents.length === 0 ? ' is-empty' : ''}`}>
      <h3 className="cal-month__name">
        {monthLabel}
        <span>{toLatinDigits(monthEvents.length)}</span>
      </h3>

      {/* The <h3> above names the month, and each day's own label repeats the
          month and year, so the table needs no caption of its own. */}
      <table className="cal-month__grid">
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th key={weekday.en} scope="col" abbr={ar ? weekday.ar : weekday.en}>
                <span aria-hidden="true">{ar ? weekday.shortAr : weekday.shortEn}</span>
                <span className="sr-only">{ar ? weekday.ar : weekday.en}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((day, dayIndex) => {
                if (day === null) {
                  return <td key={dayIndex} className="cal-month__cell is-pad" />;
                }

                const dayEvents = eventsByDay.get(dayKey(year, month, day)) || [];
                const number = toLatinDigits(day);
                const names = dayEvents.map((ev) => titleOf(ev, ar)).join(ar ? ' ، ' : ', ');
                const isToday = isCurrentMonth && today.getDate() === day;
                const classes = [
                  'cal-month__day',
                  dayEvents.length > 0 ? `is-marked cat--${dayEvents[0].category}` : '',
                  dayEvents.length > 1 ? 'is-multi' : '',
                  isToday ? 'is-today' : '',
                ].filter(Boolean).join(' ');
                const label = `${number} ${monthLabel} ${toLatinDigits(year)}${names ? ` — ${names}` : ''}`;

                return (
                  <td key={dayIndex} className="cal-month__cell">
                    {dayEvents.length === 1 && (
                      <Link
                        to={`/activities/event/${dayEvents[0].id}`}
                        className={classes}
                        title={names}
                        aria-label={label}
                      >
                        {number}
                      </Link>
                    )}
                    {dayEvents.length > 1 && (
                      <button
                        type="button"
                        className={classes}
                        title={names}
                        aria-label={label}
                        aria-expanded={openDay === day}
                        onClick={() => setOpenDay(openDay === day ? null : day)}
                      >
                        {number}
                      </button>
                    )}
                    {dayEvents.length === 0 && <span className={classes}>{number}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {openEvents.length > 0 && (
        <div className="cal-month__panel">
          <p className="cal-month__panel-head">
            {toLatinDigits(openDay)} {monthLabel} {toLatinDigits(year)}
            {' · '}
            {toLatinDigits(openEvents.length)} {ar ? 'فعالية' : 'events'}
          </p>
          <ul>
            {openEvents.map((ev) => (
              <li key={ev.id} className={`cal-month__panel-item cat--${ev.category}`}>
                <Link to={`/activities/event/${ev.id}`}>{titleOf(ev, ar)}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EventCard({ ev, ar, lang }) {
  const st = STATUS[ev.status] || { ar: ev.status, en: ev.status };
  const cat = FILTERS.find((f) => f.key === ev.category);
  // QA — events now carry a banner image; cards without one keep their old shape.
  const banner = String(ev.imageUrl || '').trim();

  return (
    <Link to={`/activities/event/${ev.id}`} className="fed-nav-card">
      {banner && <img className="fed-nav-card__img" src={banner} alt="" loading="lazy" />}
      <div className="fed-nav-card__cat">
        {cat ? (ar ? cat.ar : cat.en) : ev.category} · {ar ? st.ar : st.en}
      </div>
      <div className="fed-nav-card__title">
        {ar ? ev.titleAr || ev.title : ev.titleEn || ev.title}
      </div>
      <p className="fed-nav-card__desc">
        {formatDateRange(ev.startDate, ev.endDate, lang)}
        <br />
        {ar ? ev.locationAr || ev.location : ev.locationEn || ev.location}
      </p>
      <div className="fed-nav-card__arrow">{ar ? '← التفاصيل' : 'Details →'}</div>
    </Link>
  );
}
