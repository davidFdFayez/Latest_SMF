import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import PageHero from '../components/PageHero';
import { fetchEvents } from '../api/services';
import { formatDateRange, toLatinDigits } from '../utils/format';

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

const yearOf = (event) => new Date(event.startDate).getFullYear();

export default function Calendar() {
  const { lang } = useLang();
  const ar = lang === 'ar';
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

  /** Twelve buckets for the grid view, so empty months still show. */
  const grid = useMemo(() => {
    const months = Array.from({ length: 12 }, () => []);
    for (const ev of filtered) {
      const month = new Date(ev.startDate).getMonth();
      if (month >= 0 && month < 12) months[month].push(ev);
    }
    return months;
  }, [filtered]);

  const heading = year === null
    ? (ar ? 'تقويم الفعاليات' : 'Events Calendar')
    : (ar ? `تقويم الفعاليات ${toLatinDigits(year)}` : `${year} Events Calendar`);

  return (
    <>
      <PageHero
        title={heading}
        /* TXT-02 — «وورش» corrected to «ودورات». */
        subtitle={ar ? 'جميع بطولات ومعسكرات ودورات وفعاليات الاتحاد' : 'Championships, camps, courses, and federation events'}
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

          {view === 'list' ? (
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
          ) : (
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

function EventCard({ ev, ar, lang }) {
  const st = STATUS[ev.status] || { ar: ev.status, en: ev.status };
  const cat = FILTERS.find((f) => f.key === ev.category);

  return (
    <Link to={`/activities/event/${ev.id}`} className="fed-nav-card">
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
