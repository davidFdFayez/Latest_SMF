import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { usePageContent, useText } from '../../content/useContent';

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

function IconExternal({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export default function Policies() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('governance-policies');
  const tx = useText();

  if (!c) return fallback;

  /* Until the federation publishes a document, the page shows the "coming soon" block. */
  const documents = c.documents.items.filter((d) => d.file);

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/governance/recognition">{ar ? 'الحوكمة' : 'Governance'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'الأنظمة والسياسات' : 'Code & Policies'}</span>
          </nav>
          <h1>{tx(c.header.title)}</h1>
        </div>
      </section>

      {documents.length > 0 ? (
        <section className="section--grey">
          <div className="container">
            {(tx(c.documents.label) || tx(c.documents.heading)) && (
              <div className="section-header section-header--center">
                {tx(c.documents.label) && (
                  <span className="section-label section-label--green">{tx(c.documents.label)}</span>
                )}
                {tx(c.documents.heading) && <h2>{tx(c.documents.heading)}</h2>}
              </div>
            )}

            <div className="rules-doc-grid">
              {documents.map((d, i) => (
                <a key={`${i}-${d.file}`} className="rules-doc-card" href={d.file} target="_blank" rel="noopener noreferrer">
                  <div className="rules-doc-card__icon" aria-hidden="true"><IconDoc /></div>
                  <div className="rules-doc-card__body">
                    <span className="rules-doc-card__type">PDF{d.date && ` · ${d.date}`}</span>
                    <h3>{tx(d.title)}</h3>
                    {tx(d.description) && <p>{tx(d.description)}</p>}
                  </div>
                  <div className="rules-doc-card__arrow" aria-hidden="true"><IconExternal /></div>
                </a>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="section--white">
          <div className="container">
            <div className="coming-soon-block">
              <div className="coming-soon-block__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>

              <div className="coming-soon-block__badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {tx(c.comingSoon.badge)}
              </div>

              <h2 className="coming-soon-block__title">{tx(c.comingSoon.title)}</h2>

              {tx(c.comingSoon.text) && <p className="coming-soon-block__text">{tx(c.comingSoon.text)}</p>}

              <Link to="/" className="btn btn--outline-dark">{tx(c.comingSoon.backLabel)}</Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
