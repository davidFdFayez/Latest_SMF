import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Shared hero banner used on every interior page.
 *
 * Props:
 *  - tag: small eyebrow label shown above the title (optional)
 *  - title: page H1
 *  - subtitle: supporting paragraph (optional)
 *  - breadcrumb: array of { label, to? } — last item has no link
 *  - stats: array of { value, label } shown under the text (optional)
 *  - abstract: use the plain gradient background instead of the fighter photo
 */
export default function PageHero({ tag, title, subtitle, breadcrumb = [], stats, abstract = false }) {
  const { t } = useTranslation();

  return (
    <section className={`page-hero${abstract ? ' page-hero--abstract' : ''}`}>
      {!abstract && <div className="page-hero__bg" />}
      <div className="page-hero__overlay" />
      <div className="page-hero__accent" />
      <div className="container page-hero__content">
        <nav className="breadcrumb" aria-label="breadcrumb">
          <Link to="/">{t('common.home')}</Link>
          {breadcrumb.map((item, idx) => (
            <span key={item.label}>
              <span className="breadcrumb__sep"> / </span>
              {item.to && idx !== breadcrumb.length - 1 ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <span>{item.label}</span>
              )}
            </span>
          ))}
        </nav>

        {tag && <span className="page-hero__tag">{tag}</span>}
        <h1>{title}</h1>
        {subtitle && <p className="page-hero__sub">{subtitle}</p>}

        {stats && stats.length > 0 && (
          <div className="page-hero__stats">
            {stats.map((stat) => (
              <div className="page-hero__stat" key={stat.label}>
                <span className="page-hero__stat-value">{stat.value}</span>
                <span className="page-hero__stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
