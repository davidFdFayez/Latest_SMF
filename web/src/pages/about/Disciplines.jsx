import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { SmartLink, usePageContent, useText } from '../../content/useContent';

export default function AboutDisciplines() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('about-disciplines');
  const tx = useText();

  if (!c) return fallback;

  const block = c.comingSoon;

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/about-muaythai/history">{ar ? 'عن المواي تاي' : 'About Muaythai'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'الأنواع والتخصصات' : 'Muaythai Disciplines'}</span>
          </nav>
          <h1>{tx(c.header.title)}</h1>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="coming-soon-block">
            <div className="coming-soon-block__icon coming-soon-block__icon--amber" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="6" />
                <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
              </svg>
            </div>

            {tx(block.badge) && (
              <div className="coming-soon-block__badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {tx(block.badge)}
              </div>
            )}

            <h2 className="coming-soon-block__title">{tx(block.title)}</h2>

            <p className="coming-soon-block__text">{tx(block.text)}</p>

            <div className="coming-soon-block__tags">
              {block.tags.map((t, i) => (
                <span className="coming-soon-block__tag" key={`${i}-${t.name?.en}`}>{tx(t.name)}</span>
              ))}
            </div>

            <div className="coming-soon-block__actions">
              {block.primaryUrl && (
                <SmartLink to={block.primaryUrl} className="btn btn--green">
                  {tx(block.primaryLabel)}
                </SmartLink>
              )}
              {block.secondaryUrl && (
                <SmartLink to={block.secondaryUrl} className="btn btn--outline-dark">
                  {tx(block.secondaryLabel)}
                </SmartLink>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
