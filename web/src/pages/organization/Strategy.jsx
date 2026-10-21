import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { SmartLink, usePageContent, useText } from '../../content/useContent';

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

/* One icon per pillar, by position; extra pillars reuse them in turn. */
const PILLAR_ICONS = [
  <svg key="users" {...svgProps}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
  <svg key="activity" {...svgProps}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  <svg key="graduation" {...svgProps}><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>,
  <svg key="trophy" {...svgProps}><path d="M6 9H4.5a2.5 2.5 0 010-5H6" /><path d="M18 9h1.5a2.5 2.5 0 000-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0012 0V2z" /></svg>,
];

function RoadmapDot() {
  return (
    <div className="roadmap-v2-item__dot" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <circle cx="12" cy="12" r="6" />
      </svg>
    </div>
  );
}

export default function Strategy() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('organization-strategy');
  const tx = useText();

  if (!c) return fallback;

  return (
    <>
      <section className="strategy-dashboard">
        <div className="container">
          <div className="strategy-dashboard__inner">
            <div>
              <span className="strategy-dashboard__tag">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                {tx(c.hero.tag)}
              </span>
              <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
                <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
                <span className="breadcrumb__sep" aria-hidden="true">›</span>
                <Link to="/organization/overview">{ar ? 'الاتحاد' : 'The Organization'}</Link>
                <span className="breadcrumb__sep" aria-hidden="true">›</span>
                <span>{ar ? 'الاستراتيجية' : 'Strategy'}</span>
              </nav>
              <h1 className="strategy-dashboard__title">
                {tx(c.hero.title)}
              </h1>
              <p className="strategy-dashboard__sub">
                {tx(c.hero.subtitle)}
              </p>
            </div>

            <div className="strategy-kpis">
              {c.hero.kpis.map((k, i) => (
                <div className="strategy-kpi" key={`${i}-${k.value}`}>
                  <div className="strategy-kpi__value">{k.value}</div>
                  <div className="strategy-kpi__label">{tx(k.label)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.pillars.label)}</span>
            <h2>{tx(c.pillars.heading)}</h2>
            {tx(c.pillars.intro) && (
              <p>
                {tx(c.pillars.intro)}
              </p>
            )}
          </div>

          <div className="pillars-v2">
            {c.pillars.items.map((p, i) => (
              <div className="pillar-v2" key={`${i}-${p.number}`}>
                <span className="pillar-v2__num">{p.number}</span>
                <div className="pillar-v2__content">
                  <div className="pillar-v2__icon">{PILLAR_ICONS[i % PILLAR_ICONS.length]}</div>
                  <h3 className="pillar-v2__title">{tx(p.title)}</h3>
                  <p className="pillar-v2__text">{tx(p.text)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.roadmap.label)}</span>
            <h2>{tx(c.roadmap.heading)}</h2>
            {tx(c.roadmap.intro) && (
              <p>
                {tx(c.roadmap.intro)}
              </p>
            )}
          </div>

          {/* Roadmap grouped by development phase, matching the published layout. */}
          {c.roadmap.groups.map((group, gi) => (
            <div key={`${gi}-${tx(group.badge)}`}>
              <div className={`roadmap-year-sep${gi === 0 ? ' roadmap-year-sep--first' : ''}`}>
                <span className="roadmap-year-sep__badge">{tx(group.badge)}</span>
              </div>
              <div className={`roadmap-v2 roadmap-v2--cols-${group.cols || '2'}`}>
                {group.items.map((item, i) => (
                  <div className="roadmap-v2-item" key={`${i}-${item.quarter}`}>
                    <RoadmapDot />
                    <div className="roadmap-v2-item__quarter">{item.quarter}</div>
                    <p className="roadmap-v2-item__name">{tx(item.name)}</p>
                    <p className="roadmap-v2-item__text">{tx(item.text)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section--green-gradient strategy-cta">
        <div className="container">
          <h2>{tx(c.cta.heading)}</h2>
          <p>
            {tx(c.cta.text)}
          </p>
          {c.cta.buttonUrl && (
            <SmartLink to={c.cta.buttonUrl} className="btn btn--gold">{tx(c.cta.buttonLabel)}</SmartLink>
          )}
        </div>
      </section>
    </>
  );
}
