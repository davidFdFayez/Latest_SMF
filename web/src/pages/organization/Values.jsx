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
const ICONS = [
  <svg key="star" {...svgProps}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  <svg key="people" {...svgProps}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
  <svg key="shield" {...svgProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>,
  <svg key="flame" {...svgProps}><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" /></svg>,
  <svg key="scales" {...svgProps}><path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" /><path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" /><path d="M7 21h10" /><path d="M12 3v18" /><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" /></svg>,
];

export default function Values() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('organization-values');
  const tx = useText();

  if (!c) return fallback;

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/organization/overview">{ar ? 'الاتحاد' : 'The Organization'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'القيم' : 'Values'}</span>
          </nav>
          <h1>{tx(c.header.title)}</h1>
          <p>{tx(c.header.subtitle)}</p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <p className="values-intro">{tx(c.intro)}</p>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.pillars.label)}</span>
            <h2>{tx(c.pillars.heading)}</h2>
          </div>

          <div className="pillars-grid">
            {c.pillars.items.map((p, i) => (
              <div className="pillar-card-v2" key={`${p.number}-${i}`}>
                <div className="pillar-card-v2__top">
                  <span className="pillar-card-v2__number">{p.number}</span>
                  <div className="pillar-card-v2__icon">{ICONS[i % ICONS.length]}</div>
                </div>
                <h3>{tx(p.title)}</h3>
                <p>{tx(p.body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container values-ifma">
          <span className="section-label section-label--green">{tx(c.ifma.label)}</span>
          <p className="values-ifma__text">{tx(c.ifma.text)}</p>
          {c.ifma.linkUrl && (
            <SmartLink className="btn btn--green btn--icon" to={c.ifma.linkUrl}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              {tx(c.ifma.linkLabel)}
            </SmartLink>
          )}
        </div>
      </section>

      <section className="section--green-gradient values-cta">
        <div className="container">
          <p className="values-cta__text">{tx(c.cta.text)}</p>
          <div className="values-cta__btns">
            {c.cta.primaryUrl && (
              <SmartLink to={c.cta.primaryUrl} className="btn btn--gold">{tx(c.cta.primaryLabel)}</SmartLink>
            )}
            {c.cta.secondaryUrl && (
              <SmartLink to={c.cta.secondaryUrl} className="btn btn--outline btn--outline-white">{tx(c.cta.secondaryLabel)}</SmartLink>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
