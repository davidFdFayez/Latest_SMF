import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { SmartLink, usePageContent, useText } from '../../content/useContent';

export default function AboutHistory() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('about-history');
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
            <span>{ar ? 'تاريخ المواي تاي' : 'History of Muaythai'}</span>
          </nav>
          <h1>{tx(c.header.title)}</h1>
          {tx(c.header.subtitle) && <p>{tx(c.header.subtitle)}</p>}
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <p className="page-intro">{tx(c.intro)}</p>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--amber">{tx(c.limbs.label)}</span>
            <h2>{tx(c.limbs.heading)}</h2>
          </div>

          <div className="eight-limbs-grid">
            {c.limbs.items.map((l, i) => (
              <div className="limb-card" key={`${i}-${l.title?.en}`}>
                <div className="limb-card__img">
                  <img src={l.image} alt={tx(l.title)} loading="lazy" />
                </div>
                <h3>{tx(l.title)}</h3>
                <p>{tx(l.description)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.timeline.label)}</span>
            <h2>{tx(c.timeline.heading)}</h2>
          </div>

          <ol className="timeline">
            {c.timeline.items.map((t, i) => (
              <li className="timeline__item" key={`${i}-${t.number}`}>
                <div className="timeline__year">{t.number}</div>
                <div className="timeline__dot" aria-hidden="true" />
                <div className="timeline__content">
                  <span className="timeline__tag">{tx(t.tag)}</span>
                  <h3>{tx(t.title)}</h3>
                  <p>{tx(t.body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section--green-gradient values-cta">
        <div className="container">
          <h2>{tx(c.cta.heading)}</h2>
          <p className="values-cta__text">{tx(c.cta.text)}</p>
          {c.cta.buttonUrl && (
            <SmartLink to={c.cta.buttonUrl} className="btn btn--gold">
              {tx(c.cta.buttonLabel)}
            </SmartLink>
          )}
        </div>
      </section>
    </>
  );
}
