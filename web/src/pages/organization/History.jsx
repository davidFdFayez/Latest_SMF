import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { MultilineText, SmartLink, usePageContent, useText } from '../../content/useContent';

export default function History() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('organization-history');
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
            <span>{ar ? 'تاريخ الاتحاد' : 'SMF History'}</span>
          </nav>
          <h1>{tx(c.header.title)}</h1>
          <p>
            {tx(c.header.subtitle)}
          </p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <blockquote className="history-quote">
            <span className="history-quote__mark" aria-hidden="true">&quot;</span>
            {/* Paragraphs are separated by a blank line, which renders as <br /><br />. */}
            <p className="history-quote__text">
              <MultilineText text={tx(c.quote.text)} />
            </p>
            {tx(c.quote.author) && (
              <footer className="history-quote__footer">
                —{' '}
                <cite>
                  {tx(c.quote.author)}
                </cite>
              </footer>
            )}
          </blockquote>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.timeline.label)}</span>
            <h2>{tx(c.timeline.heading)}</h2>
          </div>

          <ol className="timeline">
            {c.timeline.items.map((item, i) => (
              <li className="timeline__item" key={`${i}-${item.year}`}>
                <div className="timeline__year">{item.year}</div>
                <div className="timeline__dot" aria-hidden="true" />
                <div className="timeline__content">
                  <span className="timeline__tag">{tx(item.tag)}</span>
                  <h3>{tx(item.title)}</h3>
                  <p>{tx(item.body)}</p>
                </div>
              </li>
            ))}
          </ol>
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
