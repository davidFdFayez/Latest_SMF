import { toLatinDigits } from '../../utils/format';
import {
  IconCoach, IconFemale, IconGlove, IconMale, IconMedal, IconPlayers, IconStats, IconTrend, IconTrophy,
} from '../../components/icons/AccountIcons';
import { Empty, SectionTitle } from './clubParts';

/**
 * The account Statistics report, shared by the club and the coach. Both read
 * the same club roster; the headline tiles are worded for whoever is looking.
 * Its panel and participation chart also serve the athlete's own report.
 */

/* ── statistics ───────────────────────────────────────────────────────── */

export function Statistics({ stats, ar, viewer = 'club', note, empty }) {
  const title = ar ? 'الإحصائيات' : 'Statistics';

  // Nothing to report on, said plainly (a coach with no club, say).
  if (empty) {
    return (
      <>
        <SectionTitle Icon={IconStats} title={title} note={note} />
        {empty}
      </>
    );
  }

  if (!stats) {
    return (
      <>
        <SectionTitle Icon={IconStats} title={title} note={note} />
        <p className="club-dash__loading">{ar ? 'جارٍ تحميل الإحصائيات…' : 'Loading statistics…'}</p>
      </>
    );
  }

  const { totals } = stats;
  // The same four figures; a coach reads them as their club's.
  const coach = viewer === 'coach';
  const summary = [
    {
      key: 'athletes', tone: 'green', Icon: IconGlove, value: totals.athletes,
      label: coach ? (ar ? 'لاعبو النادي' : 'Club players') : (ar ? 'إجمالي اللاعبين' : 'Total players'),
    },
    {
      key: 'coaches', tone: 'violet', Icon: IconCoach, value: totals.coaches,
      label: coach ? (ar ? 'مدربو النادي' : 'Club coaches') : (ar ? 'إجمالي المدربين' : 'Total coaches'),
    },
    {
      key: 'competing', tone: 'blue', Icon: IconPlayers, value: totals.athletesInTournaments,
      label: coach
        ? (ar ? 'لاعبو النادي المشاركون حاليًا' : 'Club players in current tournaments')
        : (ar ? 'المشاركون حاليًا في البطولات' : 'Athletes in current tournaments'),
    },
    {
      key: 'tournaments', tone: 'gold', Icon: IconTrophy, value: totals.tournaments,
      label: ar ? 'البطولات المسجل بها النادي' : 'Tournaments the club is entered in',
    },
  ];

  return (
    <>
      <SectionTitle Icon={IconStats} title={title} note={note} />

      <div className="club-stats__summary">
        {summary.map(({ key, tone, Icon, label, value }) => (
          <div className={`club-kpi club-kpi--${tone}`} key={key}>
            <Icon className="club-kpi__icon" />
            <span className="club-kpi__label">{label}</span>
            <strong className="club-kpi__value">{toLatinDigits(value)}</strong>
          </div>
        ))}
      </div>

      <div className="club-stats__grid">
        <Panel title={ar ? 'توزيع اللاعبين حسب الجنس' : 'Players by gender'}>
          <GenderBars gender={stats.gender} ar={ar} />
        </Panel>
        <Panel title={ar ? 'تصنيف اللاعبين' : 'Player classification'}>
          <Classification data={stats.classification} ar={ar} />
        </Panel>
        <Panel title={ar ? 'مشاركات النادي في البطولات' : "Club's tournament participation"}>
          <ParticipationChart points={stats.participation} ar={ar} />
        </Panel>
        <Panel title={ar ? 'توزيع اللاعبين حسب الفئات العمرية' : 'Players by age category'}>
          <CategoryBars categories={stats.categories} ar={ar} />
        </Panel>
      </div>
    </>
  );
}

export function Panel({ title, children }) {
  return (
    <section className="club-panel">
      <h3 className="club-panel__title">{title}</h3>
      {children}
    </section>
  );
}

/* Men and women as two labelled bars against one shared scale. */
function GenderBars({ gender, ar }) {
  const total = gender.male + gender.female;
  if (total === 0) {
    return <Empty Icon={IconPlayers} text={ar ? 'لا يوجد لاعبون مرتبطون بالنادي بعد.' : 'No players are linked to the club yet.'} />;
  }

  const rows = [
    { key: 'male', Icon: IconMale, label: ar ? 'ذكور' : 'Male', count: gender.male },
    { key: 'female', Icon: IconFemale, label: ar ? 'إناث' : 'Female', count: gender.female },
  ];

  return (
    <div className="club-gender">
      {rows.map(({ key, Icon, label, count }) => {
        const percent = Math.round((count / total) * 100);
        return (
          <div className={`club-gender__row club-gender__row--${key}`} key={key}>
            <Icon className="club-gender__icon" />
            <span className="club-gender__label">{label}</span>
            <span className="club-gender__track" title={`${label}: ${count} (${percent}%)`}>
              <span className="club-gender__fill" style={{ inlineSize: `${percent}%` }} />
            </span>
            <span className="club-gender__percent">{toLatinDigits(percent)}%</span>
            <strong className="club-gender__count">{toLatinDigits(count)}</strong>
          </div>
        );
      })}
      {gender.unknown > 0 && (
        <p className="club-panel__note">
          {ar
            ? `${toLatinDigits(gender.unknown)} لاعب بلا جنس مسجل في ملفه.`
            : `${toLatinDigits(gender.unknown)} without a gender on their record.`}
        </p>
      )}
    </div>
  );
}

/* A ring of gold, silver and bronze — empty until the system records it. */
function Classification({ data, ar }) {
  const tiers = [
    { key: 'gold', label: ar ? 'ذهبي' : 'Gold' },
    { key: 'silver', label: ar ? 'فضي' : 'Silver' },
    { key: 'bronze', label: ar ? 'برونزي' : 'Bronze' },
  ];

  if (!data) {
    return (
      <div className="club-ring">
        <svg className="club-ring__chart" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="46" className="club-ring__track" />
        </svg>
        <div className="club-ring__side">
          <ul className="club-ring__legend">
            {tiers.map(({ key, label }) => (
              <li key={key}>
                <span className={`club-ring__dot club-ring__dot--${key}`} />
                <span>{label}</span>
                <span className="club-ring__none">—</span>
              </li>
            ))}
          </ul>
          <p className="club-panel__note">
            <IconMedal className="club-panel__note-icon" />
            {ar
              ? 'لا يوجد تصنيف للاعبين في النظام بعد.'
              : 'There is no player classification in the system yet.'}
          </p>
        </div>
      </div>
    );
  }

  // Drawn once classification data exists: one arc per tier, 2px apart.
  const total = tiers.reduce((sum, tier) => sum + (data[tier.key] || 0), 0);
  const circumference = 2 * Math.PI * 46;
  let offset = 0;

  return (
    <div className="club-ring">
      <div className="club-ring__chart-wrap">
        <svg className="club-ring__chart" viewBox="0 0 120 120" role="img"
             aria-label={tiers.map((tier) => `${tier.label} ${data[tier.key] || 0}`).join(', ')}>
          <circle cx="60" cy="60" r="46" className="club-ring__track" />
          {total > 0 && tiers.map(({ key, label }) => {
            const length = ((data[key] || 0) / total) * circumference;
            const arc = (
              <circle key={key} cx="60" cy="60" r="46"
                      className={`club-ring__arc club-ring__arc--${key}`}
                      strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`}
                      strokeDashoffset={-offset}>
                <title>{`${label}: ${data[key] || 0}`}</title>
              </circle>
            );
            offset += length;
            return arc;
          })}
        </svg>
        <div className="club-ring__center">
          <strong>{toLatinDigits(total)}</strong>
          <span>{ar ? 'لاعب' : 'players'}</span>
        </div>
      </div>
      <ul className="club-ring__legend">
        {tiers.map(({ key, label }) => (
          <li key={key}>
            <span className={`club-ring__dot club-ring__dot--${key}`} />
            <span>{label}</span>
            <strong>{toLatinDigits(data[key] || 0)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Players per age category: the categories the club has players in, in
   their official order, as columns with the count above each. */
function CategoryBars({ categories, ar }) {
  const shown = categories.filter((category) => category.count > 0);
  if (shown.length === 0) {
    return <Empty Icon={IconStats} text={ar ? 'لا يوجد لاعبون لعرض فئاتهم العمرية بعد.' : 'No players to show by age category yet.'} />;
  }

  const max = Math.max(...shown.map((category) => category.count));

  return (
    <div className="club-bars" dir="ltr">
      {shown.map((category) => {
        const label = ar ? category.ar : category.en;
        return (
          <div className="club-bars__col" key={category.value} title={`${label}: ${category.count}`}>
            <span className="club-bars__value">{toLatinDigits(category.count)}</span>
            <span className="club-bars__bar" style={{ blockSize: `${Math.max((category.count / max) * 100, 4)}%` }} />
            <span className="club-bars__label">{category.en}</span>
          </div>
        );
      })}
    </div>
  );
}

/* Tournaments per year as a line over a soft area, oldest year on the left. */
export function ParticipationChart({ points, ar, emptyText }) {
  if (!points || points.length === 0) {
    return (
      <Empty
        Icon={IconTrend}
        text={emptyText || (ar ? 'لم يشارك النادي في أي بطولة بعد.' : 'The club has not taken part in a tournament yet.')}
      />
    );
  }

  const width = 560;
  const height = 220;
  const pad = { top: 16, right: 24, bottom: 32, left: 36 };
  const max = Math.max(1, ...points.map((point) => point.tournaments));
  const step = max <= 5 ? 1 : Math.ceil(max / 5);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, index) => index * step);

  const x = (index) => points.length === 1
    ? (pad.left + width - pad.right) / 2
    : pad.left + (index * (width - pad.left - pad.right)) / (points.length - 1);
  const y = (value) => pad.top + (1 - value / top) * (height - pad.top - pad.bottom);

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.tournaments)}`).join(' ');
  const area = points.length > 1
    ? `${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
    : null;

  return (
    <div className="club-line" dir="ltr">
      <svg viewBox={`0 0 ${width} ${height}`} role="img"
           aria-label={points.map((point) => `${point.year}: ${point.tournaments}`).join(', ')}>
        <defs>
          <linearGradient id="club-line-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0E7A4A" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0E7A4A" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line className="club-line__grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
            <text className="club-line__axis" x={pad.left - 10} y={y(tick)} dy="0.32em" textAnchor="end">{tick}</text>
          </g>
        ))}

        {area && <path d={area} fill="url(#club-line-fill)" />}
        {points.length > 1 && <path d={line} className="club-line__path" />}

        {points.map((point, index) => (
          <g key={point.year}>
            <circle cx={x(index)} cy={y(point.tournaments)} r="12" className="club-line__hit">
              <title>{`${point.year}: ${point.tournaments} ${ar ? 'بطولة' : point.tournaments === 1 ? 'tournament' : 'tournaments'}`}</title>
            </circle>
            <circle cx={x(index)} cy={y(point.tournaments)} r="4.5" className="club-line__dot" />
            <text className="club-line__axis" x={x(index)} y={height - 10} textAnchor="middle">{point.year}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
