import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconCalendar, IconPerson, IconTrophy } from '../icons/Icons';
import { intlLocale, toLatinDigits } from '../../utils/format';
import { fetchPublishedSchedule } from '../../api/services';
import { countryCode } from '../../data/countryCodes';
import { Flag, isCountry } from './Nationality';
import { cornerView, filterDay, filterOptions, formatBoutTime, isFinal, photoUrl, scheduleStats } from './matchSchedule';

/**
 * The tournament's Match Schedule tab — the PUBLISHED bout schedule only.
 *
 * It reads the snapshot frozen when the federation published the schedule
 * (official bout numbers, days, rings, times and participants or "Winner of
 * Bout n" for later rounds). Until then the API answers 404 and the tab says
 * the schedule has not been published yet: no draft, no unpublished change and
 * no administrative control ever reaches the public site.
 *
 * Layout (owner's reference design): a side panel (title, tournament-wide
 * figures, colour key) beside the day tabs, the division / ring filters, the
 * table / list switch and one section per ring. The chosen day, filters and
 * view are kept in the URL (?section=schedule&day=2&division=…&ring=…&view=list),
 * so refresh and shared links keep them. Narrow screens always use the list.
 */
export default function TournamentMatchSchedule({ tournamentId, ar }) {
  const pick = (arabic, english) => (ar ? arabic : english);
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ loading: true, schedule: null, missing: false, failed: false });
  const narrow = useNarrow();

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, schedule: null, missing: false, failed: false });
    fetchPublishedSchedule(tournamentId)
      .then((schedule) => !cancelled && setState({ loading: false, schedule, missing: false, failed: false }))
      .catch((err) => {
        if (cancelled) return;
        const missing = err?.response?.status === 404;
        setState({ loading: false, schedule: null, missing, failed: !missing });
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  const { schedule } = state;
  const stats = useMemo(() => scheduleStats(schedule), [schedule]);
  const options = useMemo(() => filterOptions(schedule), [schedule]);

  const title = pick('جدول النزالات', 'Match Schedule');
  if (state.loading || !schedule) {
    return (
      <section className="tsection" aria-labelledby="tmatch-title">
        <h2 id="tmatch-title" className="tsection__title">{title}</h2>
        <div className="tpage-card tsection__placeholder" data-testid="tmatch-empty">
          <IconCalendar className="tsection__placeholder-icon" aria-hidden="true" />
          <p>
            {state.loading
              ? pick('جارٍ التحميل…', 'Loading…')
              : state.failed
                ? pick('تعذّر تحميل جدول المباريات. حاول مرة أخرى لاحقًا.', 'The match schedule could not be loaded. Please try again later.')
                : pick('لم يُنشر جدول المباريات بعد.', 'The match schedule has not been published yet.')}
          </p>
        </div>
      </section>
    );
  }

  const days = schedule.days || [];
  const chosen = Number(params.get('day'));
  const day = days.find((d) => d.day === chosen) || days[0];
  const division = options.divisions.some((d) => d.value === params.get('division')) ? params.get('division') : '';
  const ring = options.rings.includes(params.get('ring')) ? params.get('ring') : '';
  const view = narrow || params.get('view') === 'list' ? 'list' : 'table';
  const rings = filterDay(day, { division, ring });

  // Built from the browser's current URL (updated at once by each change), not from the last render,
  // so two changes made in quick succession never undo each other.
  const setParam = (key, value) => {
    const next = new URLSearchParams(window.location.search);
    next.set('section', 'schedule');
    if (value === '' || value == null) next.delete(key);
    else next.set(key, String(value));
    setParams(next, { replace: true });
  };
  const dateText = (iso, short = false) =>
    toLatinDigits(new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(ar ? 'ar' : 'en'), {
      timeZone: 'UTC', calendar: 'gregory', weekday: short ? 'short' : 'long', day: 'numeric', month: short ? 'short' : 'long',
    })).replace('،', '');
  const ringLabel = (name) => (ar || !/^ring\b/i.test(name || '') ? pick('الحلبة', 'Ring') : null);

  return (
    <section className="tsection tms" aria-labelledby="tmatch-title" data-testid="tmatch" data-version={schedule.version}>
      <aside className="tms__side">
        <div className="tms__brand">
          <IconCalendar className="tms__brand-icon" aria-hidden="true" />
          <h2 id="tmatch-title" className="tms__brand-title">{title}</h2>
        </div>

        <dl className="tms__card tms__stats" data-testid="tmatch-stats">
          <Stat icon={<IconGlove />} label={pick('إجمالي النزالات', 'Total bouts')} value={stats.bouts} id="bouts" />
          <Stat icon={<IconCalendar />} label={pick('عدد الأيام', 'Days')} value={stats.days} id="days" />
          <Stat icon={<IconRing />} label={pick('عدد الحلبات', 'Rings')} value={stats.rings} id="rings" />
        </dl>

        <div className="tms__card tms__legend" data-testid="tmatch-legend">
          <h3 className="tms__legend-title">
            <IconCalendar className="tms__legend-icon" aria-hidden="true" />
            {pick('مفتاح الألوان', 'Colour key')}
          </h3>
          <ul>
            <li><span className="tms__bar tms__bar--red" aria-hidden="true" />{pick('الزاوية الحمراء', 'Red corner')}</li>
            <li><span className="tms__bar tms__bar--blue" aria-hidden="true" />{pick('الزاوية الزرقاء', 'Blue corner')}</li>
            <li><IconTrophy className="tms__trophy tms__trophy--gold" aria-hidden="true" />{pick('نزال نهائي', 'Final bout')}</li>
          </ul>
        </div>
      </aside>

      <div className="tms__main">
        <div className="tms__days" role="tablist" aria-label={pick('أيام البطولة', 'Tournament days')}>
          {days.map((d) => (
            <button
              key={d.day}
              type="button"
              role="tab"
              aria-selected={d === day}
              className={`tms__day${d === day ? ' is-active' : ''}`}
              onClick={() => setParam('day', d.day)}
              data-testid="tmatch-day"
            >
              <strong>{pick(`اليوم ${d.day}`, `Day ${d.day}`)}</strong>
              <span className="tms__date-long">({dateText(d.date)})</span>
              <span className="tms__date-short">({dateText(d.date, true)})</span>
            </button>
          ))}
        </div>

        <div className="tms__toolbar">
          <label className="tms__select">
            <IconFunnel className="tms__select-icon" aria-hidden="true" />
            <span className="visually-hidden">{pick('القسم', 'Division')}</span>
            <select value={division} onChange={(e) => setParam('division', e.target.value)} data-testid="tmatch-filter-division">
              <option value="">{pick('جميع الأقسام', 'All divisions')}</option>
              {options.divisions.map((d) => (
                <option key={d.value} value={d.value}>{ar ? d.ar : d.en}</option>
              ))}
            </select>
          </label>
          <label className="tms__select">
            <IconDown className="tms__select-icon" aria-hidden="true" />
            <span className="visually-hidden">{pick('الحلبة', 'Ring')}</span>
            <select value={ring} onChange={(e) => setParam('ring', e.target.value)} data-testid="tmatch-filter-ring">
              <option value="">{pick('جميع الحلبات', 'All rings')}</option>
              {options.rings.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <div className="tms__views" role="group" aria-label={pick('طريقة العرض', 'View')}>
            <button
              type="button"
              className={`tms__view${view === 'table' ? ' is-active' : ''}`}
              aria-pressed={view === 'table'}
              aria-label={pick('عرض الجدول', 'Table view')}
              title={pick('عرض الجدول', 'Table view')}
              onClick={() => setParam('view', '')}
              data-testid="tmatch-view-table"
            >
              <IconTable aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`tms__view${view === 'list' ? ' is-active' : ''}`}
              aria-pressed={view === 'list'}
              aria-label={pick('عرض القائمة', 'List view')}
              title={pick('عرض القائمة', 'List view')}
              onClick={() => setParam('view', 'list')}
              data-testid="tmatch-view-list"
            >
              <IconList aria-hidden="true" />
            </button>
          </div>
        </div>

        {rings.length === 0 && (
          <p className="tms__none" data-testid="tmatch-none">
            {pick('لا توجد نزالات تطابق التصفية في هذا اليوم.', 'No bouts match these filters on this day.')}
          </p>
        )}

        {rings.map((r) => (
          <div key={r.name} className="tms__ring" data-testid="tmatch-ring">
            <div className="tms__ring-head">
              <IconRing className="tms__ring-icon" aria-hidden="true" />
              {ringLabel(r.name) && <span className="tms__ring-label">{ringLabel(r.name)}</span>}
              <h3 className="tms__ring-name">{r.name}</h3>
            </div>
            {view === 'table' ? (
              <table className="tms__table">
                <thead>
                  <tr>
                    <th scope="col" className="tms__c-num"># {pick('النزال', 'Bout')}</th>
                    <th scope="col" className="tms__c-time">{pick('الوقت', 'Time')}</th>
                    <th scope="col" className="tms__c-div">{pick('القسم', 'Division')}</th>
                    <th scope="col" className="tms__c-round">{pick('الدور', 'Round')}</th>
                    <th scope="col" className="tms__c-vs">{pick('المواجهة', 'Matchup')}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.bouts.map((b) => (
                    <tr key={b.number} className="tms__row" data-testid="tmatch-bout" data-number={b.number}>
                      <td className="tms__c-num tms__num">{b.number}</td>
                      <td className="tms__c-time tms__time" dir="ltr">{formatBoutTime(b.startTime)}</td>
                      <td className="tms__c-div tms__div">{pick(b.divisionAr, b.divisionEn)}</td>
                      <td className="tms__c-round"><Round bout={b} ar={ar} /></td>
                      <td className="tms__c-vs"><Matchup bout={b} ar={ar} tournamentId={tournamentId} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <ol className="tms__list">
                {r.bouts.map((b) => (
                  <li key={b.number} className="tms__item" data-testid="tmatch-bout" data-number={b.number}>
                    <div className="tms__item-top">
                      <span className="tms__item-num">
                        <span className="tms__item-hash">#</span>
                        {b.number}
                      </span>
                      <span className="tms__time" dir="ltr">{formatBoutTime(b.startTime)}</span>
                      <Round bout={b} ar={ar} />
                    </div>
                    <div className="tms__div">{pick(b.divisionAr, b.divisionEn)}</div>
                    <Matchup bout={b} ar={ar} tournamentId={tournamentId} stacked />
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ icon, label, value, id }) {
  return (
    <div className="tms__stat" data-testid={`tmatch-stat-${id}`}>
      <dt>
        <span className="tms__stat-icon" aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function Round({ bout, ar }) {
  const final = isFinal(bout);
  return (
    <span className={`tms__round${final ? ' tms__round--final' : ''}`} data-final={final || undefined}>
      {final && <IconTrophy className="tms__trophy tms__trophy--gold" aria-hidden="true" />}
      {ar ? bout.roundAr : bout.roundEn}
    </span>
  );
}

/**
 * Red and blue corners. As in the reference, red sits on the left and blue on
 * the right whatever the language, each corner's colour bar on its outer edge.
 * Stacked (list view): red above blue, both from the start edge.
 */
function Matchup({ bout, ar, tournamentId, stacked = false }) {
  const red = <Corner key="red" bout={bout} corner="red" ar={ar} tournamentId={tournamentId} end={!stacked && ar} />;
  const blue = <Corner key="blue" bout={bout} corner="blue" ar={ar} tournamentId={tournamentId} end={!stacked && !ar} />;
  const vs = (
    <span key="vs" className="tms__vs-mark" aria-hidden="true">
      VS
    </span>
  );
  if (stacked) return <div className="tms__vs tms__vs--stacked">{[red, vs, blue]}</div>;
  return <div className="tms__vs">{ar ? [blue, vs, red] : [red, vs, blue]}</div>;
}

function Corner({ bout, corner, ar, tournamentId, end }) {
  const v = cornerView(bout[corner], ar);
  const label = corner === 'red' ? (ar ? 'الزاوية الحمراء' : 'Red corner') : ar ? 'الزاوية الزرقاء' : 'Blue corner';
  const parts = [<span key="bar" className={`tms__bar tms__bar--${corner}`} role="img" aria-label={label} />];
  if (v.placeholder) {
    parts.push(<IconTrophy key="tbd" className="tms__trophy" aria-hidden="true" />);
  } else {
    parts.push(<Avatar key="photo" src={v.photo ? photoUrl(tournamentId, bout.number, corner, v.photo) : null} />);
  }
  parts.push(
    <span key="who" className="tms__who">
      <span className="tms__name">{v.name}</span>
      {!v.placeholder && <Nationality code={v.nationality} ar={ar} />}
    </span>,
  );
  return (
    <div
      className={`tms__corner tms__corner--${corner}${end ? ' is-end' : ''}${v.placeholder ? ' is-tbd' : ''}`}
      data-testid={`tmatch-corner-${corner}`}
      data-corner={corner}
    >
      {end ? parts.reverse() : parts}
    </div>
  );
}

/** The athlete's photo, or the neutral avatar when there is none or it fails to load. Decorative: the name is the label. */
function Avatar({ src }) {
  const [failed, setFailed] = useState(false);
  const photo = src && !failed;
  return (
    <span className={`tms__avatar${photo ? ' has-photo' : ''}`} aria-hidden="true" data-testid="tmatch-avatar" data-photo={photo ? 'yes' : 'no'}>
      {photo ? (
        <img src={src} alt="" loading="lazy" decoding="async" draggable="false" onError={() => setFailed(true)} />
      ) : (
        <IconPerson className="tms__avatar-icon" />
      )}
    </span>
  );
}

/**
 * The line under the athlete's name: a small flag and the sport (IOC) country
 * code — "KSA", "THA", "UAE" — from the athlete's registered nationality. When
 * it is not known: a subtle neutral marker, never a guessed country or flag.
 */
function Nationality({ code, ar }) {
  const known = code && isCountry(code);
  if (!known) {
    const unknown = ar ? 'الجنسية غير متاحة' : 'Nationality not available';
    return (
      <span className="tms__nat tms__nat--none" data-testid="tmatch-nat" data-nat="none" title={unknown}>
        <Flag code={null} ar={ar} />
        <span className="tms__nat-code" aria-hidden="true">—</span>
      </span>
    );
  }
  return (
    <span className="tms__nat" data-testid="tmatch-nat" data-nat={countryCode(code)}>
      <Flag code={code} ar={ar} />
      <span className="tms__nat-code" aria-hidden="true">{countryCode(code)}</span>
    </span>
  );
}

function useNarrow() {
  const query = '(max-width: 980px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useLayoutEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

/* Icons used only here (inline SVG, coloured by currentColor like the site's icon set). */
function IconGlove(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 13.5V8.5A4.5 4.5 0 0 1 11.5 4h2A4.5 4.5 0 0 1 18 8.5v3.2a3.3 3.3 0 0 1-1.2 2.6L15 15.8V19a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.4a3.5 3.5 0 0 1-1-2.5Z" />
      <path d="M7 11.5a2.5 2.5 0 0 1 2.5-2.5H12M8 17h7M18 10.5h-3.5" />
    </svg>
  );
}

function IconRing(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 19h18M4 19l3-11h10l3 11" />
      <path d="M5.2 15h13.6M6.1 11.5h11.8M7 8V5M17 8V5M12 8V4" />
    </svg>
  );
}

function IconFunnel(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5h16l-6 7.5V19l-4-2v-4.5L4 5Z" />
    </svg>
  );
}

function IconDown(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconTable(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9h17M3.5 13.5h17M9 9v10.5" />
    </svg>
  );
}

function IconList(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </svg>
  );
}
