import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { usePageContent, useText } from '../../content/useContent';
import { useSiteContent } from '../../content/site';

const logoProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

/* One icon per recognition card, by position; extra cards reuse them in turn. */
const LOGOS = [
  <svg key="person" {...logoProps}><circle cx="12" cy="8" r="4" /><path d="M2 20c0-4 4-7 10-7s10 3 10 7" /><path d="M12 12v-1a2 2 0 012-2h1" /></svg>,
  <svg key="globe" {...logoProps}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>,
  <svg key="shield" {...logoProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
];

function IconYear() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconTick() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function Recognition() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('governance-recognition');
  const { site } = useSiteContent();
  const tx = useText();

  if (!c) return fallback;

  // The supervising bodies are site-wide content; this page only labels the strip.
  const partners = site?.partners ?? [];

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/governance/recognition">{ar ? 'الحوكمة' : 'Governance'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'الاعتراف الرسمي' : 'SMF Recognition'}</span>
          </nav>
          <h1>{tx(c.header.title)}</h1>
          {tx(c.header.subtitle) && <p>{tx(c.header.subtitle)}</p>}
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <p className="recognition-intro">{tx(c.intro)}</p>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.milestones.label)}</span>
            <h2>{tx(c.milestones.heading)}</h2>
          </div>

          <div className="recognition-grid">
            {c.milestones.cards.map((card, i) => (
              <div className="recognition-card recognition-card--featured" key={`${i}-${card.title?.en ?? ''}`}>
                <div className="recognition-card__header">
                  <div className="recognition-card__logo">{LOGOS[i % LOGOS.length]}</div>
                  <div>
                    <div className="recognition-card__org">{tx(card.organisation)}</div>
                    <h3>{tx(card.title)}</h3>
                  </div>
                </div>
                {tx(card.year) && (
                  <span className="recognition-card__year">
                    <IconYear />
                    {tx(card.year)}
                  </span>
                )}
                <p>{tx(card.body)}</p>
                {card.benefits?.length > 0 && (
                  <div className="recognition-benefits">
                    {card.benefits.map((b, j) => (
                      <span className="recognition-benefit" key={`${j}-${b.text?.en ?? ''}`}>
                        <IconTick />
                        {tx(b.text)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="supervision-strip">
            <p className="supervision-strip__label">{tx(c.supervision.label)}</p>
            <div className="supervision-strip__logos">
              {partners.map((s, i) => (
                <div className="supervision-strip__item" key={`${i}-${s.name?.en ?? ''}`}>
                  {s.logo && <img className="supervision-strip__img" src={s.logo} alt={tx(s.name)} loading="lazy" />}
                  <span>{tx(s.name)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
