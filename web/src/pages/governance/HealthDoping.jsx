import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { SmartLink, usePageContent, useText } from '../../content/useContent';

const trustProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/* One icon per commitment, by position; extra commitments reuse them in turn. */
const TRUST_ICONS = [
  <svg key="check" {...trustProps}><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  <svg key="education" {...trustProps}><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>,
  <svg key="shield" {...trustProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
];

export default function HealthDoping() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('governance-health-doping');
  const tx = useText();

  if (!c) return fallback;

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/governance/recognition">{ar ? 'الحوكمة' : 'Governance'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'الصحة ومكافحة المنشطات' : 'Health & Anti-Doping'}</span>
          </nav>
          <h1>{tx(c.header.title)}</h1>
          {tx(c.header.subtitle) && <p>{tx(c.header.subtitle)}</p>}
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <p className="health-intro">{tx(c.intro)}</p>
        </div>
      </section>

      {/* Approved anti-doping statement — official federation content */}
      <section className="section--white">
        <div className="container container--narrow">
          <div className="section-header">
            <span className="section-label section-label--green">{tx(c.statement.label)}</span>
            <h2>{tx(c.statement.heading)}</h2>
          </div>

          <p className="health-intro">{tx(c.statement.paragraph1)}</p>

          {tx(c.statement.paragraph2) && <p className="health-intro">{tx(c.statement.paragraph2)}</p>}

          {c.statement.adelUrl && (
            <p>
              <SmartLink className="btn btn--green btn--sm" to={c.statement.adelUrl}>
                {tx(c.statement.adelLabel)}
              </SmartLink>
            </p>
          )}

          {/* Athlete pledge & declaration — short approved wording */}
          <div className="wb-confidentiality">
            <div className="wb-confidentiality__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3>{tx(c.statement.pledgeTitle)}</h3>
              <p>{tx(c.statement.pledgeText)}</p>
            </div>
          </div>

          {tx(c.statement.attachmentsNote) && (
            <p className="s-sub" style={{ marginTop: '1.5rem' }}>{tx(c.statement.attachmentsNote)}</p>
          )}
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.bodies.label)}</span>
            <h2>{tx(c.bodies.heading)}</h2>
          </div>

          <div className="recognition-grid">
            {c.bodies.items.map((b, i) => (
              <div className="recognition-card" key={`${i}-${b.title.en}`}>
                <div className="recognition-card__header">
                  {b.logo && (
                    <div className="recognition-card__logo recognition-card__logo--img">
                      <img className="recognition-card__logo-img" src={b.logo} alt={tx(b.title)} loading="lazy" />
                    </div>
                  )}
                  <div>
                    <div className="recognition-card__org">{tx(b.organisation)}</div>
                    <h3>{tx(b.title)}</h3>
                  </div>
                </div>
                <p>{tx(b.body)}</p>
                {(b.websiteUrl || b.resourcesUrl) && (
                  <div className="recognition-card__actions">
                    {b.websiteUrl && (
                      <SmartLink className="btn btn--green btn--sm" to={b.websiteUrl}>
                        {tx(c.bodies.websiteLabel)}
                      </SmartLink>
                    )}
                    {b.resourcesUrl && (
                      <SmartLink className="btn btn--outline-dark btn--sm" to={b.resourcesUrl}>
                        {tx(c.bodies.resourcesLabel)}
                      </SmartLink>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--green-gradient">
        <div className="container">
          <div className="section-header section-header--center">
            <h2>{tx(c.commitments.heading)}</h2>
          </div>
          <div className="trust-grid">
            {c.commitments.items.map((item, i) => (
              <div className="trust-card" key={`${i}-${item.text.en}`}>
                <div className="trust-card__icon">{TRUST_ICONS[i % TRUST_ICONS.length]}</div>
                <p>{tx(item.text)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
