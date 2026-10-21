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

/* One icon per initiative, by position; extra initiatives reuse them in turn. */
const ICONS = [
  <svg key="megaphone" {...svgProps}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14" /><path d="M15.54 8.46a5 5 0 010 7.07" /></svg>,
  <svg key="book" {...svgProps}><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>,
  <svg key="search" {...svgProps}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  <svg key="clipboard" {...svgProps}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12l2 2 4-4" /></svg>,
  <svg key="medal" {...svgProps}><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" /></svg>,
  <svg key="badge" {...svgProps}><path d="M3.85 8.62a4 4 0 014.78-4.77 4 4 0 016.74 0 4 4 0 014.78 4.78 4 4 0 010 6.74 4 4 0 01-4.77 4.78 4 4 0 01-6.75 0 4 4 0 01-4.78-4.77 4 4 0 010-6.76z" /><path d="M9 12l2 2 4-4" /></svg>,
  <svg key="calendar" {...svgProps}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  <svg key="person" {...svgProps}><circle cx="12" cy="5" r="3" /><path d="M6.5 21l5.5-11 5.5 11" /><path d="M4 12h5" /><path d="M15 12h5" /></svg>,
];

export default function Initiatives() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('organization-initiatives');
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
            <span>{ar ? 'المبادرات' : 'Initiatives'}</span>
          </nav>
          <h1>{tx(c.header.title)}</h1>
          <p>
            {tx(c.header.subtitle)}
          </p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <p className="values-intro">
            {tx(c.intro)}
          </p>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.initiatives.label)}</span>
            <h2>{tx(c.initiatives.heading)}</h2>
          </div>

          <div className="initiative-grid">
            {c.initiatives.items.map((it, i) => (
              <div className="initiative-card" key={`${i}-${tx(it.title)}`}>
                <div className="initiative-card__header">
                  <div className="initiative-card__icon">{ICONS[i % ICONS.length]}</div>
                  <div className="initiative-card__header-text">
                    <div className="initiative-card__category">{tx(it.category)}</div>
                    <h3>{tx(it.title)}</h3>
                  </div>
                </div>
                <div className="initiative-card__body">
                  <p>{tx(it.body)}</p>
                  <span className={`initiative-card__status initiative-card__status--${it.pending ? 'pending' : 'active'}`}>
                    {it.pending
                      ? tx(c.initiatives.pendingBadge)
                      : tx(c.initiatives.activeBadge)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--green-gradient values-cta">
        <div className="container">
          <p className="values-cta__text">
            {tx(c.cta.text)}
          </p>
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
