import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import { SmartLink, usePageContent, useText } from '../content/useContent';

const ico = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/* One icon per step, by position; extra steps reuse them in turn. */
const STEP_ICONS = [
  <svg key="form" {...ico}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  <svg key="phone" {...ico}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.1 1.22 2 2 0 012.1 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>,
  <svg key="team" {...ico}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
  <svg key="check" {...ico}><polyline points="20 6 9 17 4 12" /></svg>,
];

export default function RegistrationHub() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('registration-hub');
  const tx = useText();

  if (!c) return fallback;

  return (
    <>
      <section className="reg-hero">
        <div className="reg-hero__bg" />
        <div className="reg-hero__overlay" aria-hidden="true" />
        <div className="reg-hero__accent" aria-hidden="true" />
        <div className="container reg-hero__content">
          <div>
            <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
              <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
              <span className="breadcrumb__sep" aria-hidden="true">›</span>
              <span>{ar ? 'التسجيل' : 'Registration'}</span>
            </nav>
            {tx(c.hero.tag) && (
              <span className="reg-hero__tag">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                {tx(c.hero.tag)}
              </span>
            )}
            <h1>{tx(c.hero.title)}</h1>
            {tx(c.hero.text) && <p>{tx(c.hero.text)}</p>}
          </div>

          <div className="reg-hero__numbers">
            {c.hero.numbers.map((n, i) => (
              <div className="reg-hero__num" key={`${i}-${n.value}`}>
                <div className="reg-hero__num-value">{n.value}</div>
                <div className="reg-hero__num-label">{tx(n.label)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.steps.label)}</span>
            <h2>{tx(c.steps.heading)}</h2>
          </div>

          <div className="stepper-v2">
            {c.steps.items.map((s, i) => (
              <div className="step-v2" key={`${s.number}-${i}`}>
                <div className="step-v2__circle" aria-hidden="true">
                  {STEP_ICONS[i % STEP_ICONS.length]}
                  <span className="step-v2__num">{s.number}</span>
                </div>
                <h3 className="step-v2__title">{tx(s.title)}</h3>
                <p className="step-v2__text">{tx(s.text)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.types.label)}</span>
            <h2>{tx(c.types.heading)}</h2>
          </div>

          {tx(c.types.note) && (
            <div
              className="registration-note"
              role="note"
              style={{ maxWidth: 640, marginInline: 'auto', marginBottom: 'var(--space-2xl)' }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                <path fillRule="evenodd" clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
              </svg>
              <span>{tx(c.types.note)}</span>
            </div>
          )}

          <div className="reg-cards-v2">
            {c.types.items.map((t, i) => (
              <article className="reg-card-v2" key={`${t.prefix}-${i}`}>
                <div
                  className="reg-card-v2__image reg-card-v2__image--art"
                  style={{ backgroundImage: `url('${t.image}')` }}
                  role="img"
                  aria-label={tx(t.title)}
                />
                <div className="reg-card-v2__body">
                  {t.prefix && (
                    <p className="reg-card-v2__ref">
                      {tx(c.types.refPrefixLabel)} <strong>{t.prefix}</strong>
                    </p>
                  )}
                  <h3 className="reg-card-v2__title">{tx(t.title)}</h3>
                  <p className="reg-card-v2__desc">{tx(t.description)}</p>
                  {t.url && (
                    <SmartLink to={t.url} className="btn btn--green">{tx(c.types.buttonLabel)}</SmartLink>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
