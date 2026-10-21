import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { SmartLink, usePageContent, useText } from '../../content/useContent';

function IconDoc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function IconExternal({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export default function AboutRules() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('about-rules');
  const tx = useText();

  if (!c) return fallback;

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/about-muaythai/history">{ar ? 'عن المواي تاي' : 'About Muaythai'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'القواعد والأنظمة' : 'Muaythai Rules'}</span>
          </nav>
          <h1>{tx(c.header.title)}</h1>
          {tx(c.header.subtitle) && <p>{tx(c.header.subtitle)}</p>}
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.documents.label)}</span>
            <h2>{tx(c.documents.heading)}</h2>
            {tx(c.documents.subtitle) && <p>{tx(c.documents.subtitle)}</p>}
          </div>

          {/* Official IFMA rule books — by default linked to the international federation's own site.
              TXT-05 — the WKMM "Turkey Special Edition" document was removed: the
              federation publishes the IFMA rulebooks only, not a single tournament's
              special edition. */}
          <div className="rules-doc-grid">
            {c.documents.items.map((d, i) => (
              <SmartLink key={`${i}-${d.link}`} className="rules-doc-card" to={d.link}>
                <div className="rules-doc-card__icon" aria-hidden="true"><IconDoc /></div>
                <div className="rules-doc-card__body">
                  {tx(c.documents.typeBadge) && <span className="rules-doc-card__type">{tx(c.documents.typeBadge)}</span>}
                  <h3>{tx(d.title)}</h3>
                  <p>{tx(d.description)}</p>
                </div>
                <div className="rules-doc-card__arrow" aria-hidden="true"><IconExternal /></div>
              </SmartLink>
            ))}
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.links.label)}</span>
            <h2>{tx(c.links.heading)}</h2>
          </div>

          <div className="rules-link-grid">
            {c.links.items.map((l, i) => (
              <SmartLink key={`${i}-${l.url}`} className="rules-link-card" to={l.url}>
                <div className="rules-link-card__icon" aria-hidden="true"><IconGlobe /></div>
                <div className="rules-link-card__body">
                  <h3>{tx(l.title)}</h3>
                  <p>{tx(l.description)}</p>
                </div>
                <IconExternal className="rules-link-card__arrow" />
              </SmartLink>
            ))}
          </div>
        </div>
      </section>

      <section className="section--green-gradient values-cta">
        <div className="container">
          <h2>{tx(c.cta.heading)}</h2>
          <p className="values-cta__text">{tx(c.cta.text)}</p>
          {c.cta.buttonUrl && (
            <SmartLink to={c.cta.buttonUrl} className="btn btn--gold">{tx(c.cta.buttonLabel)}</SmartLink>
          )}
        </div>
      </section>
    </>
  );
}
