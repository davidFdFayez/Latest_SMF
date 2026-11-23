import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cleanCrop } from '../utils/bannerCrop';
import PositionedBanner from './PositionedBanner';

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
 *  - image: a page's own background photo in place of the fighter photo (optional)
 *  - imageCrop: a tournament banner's position ({ x, y, zoom }) — the image then
 *    keeps the area the admin chose, fitted to the header's frame (optional)
 *  - plain: no photo at all — the hero's green on its own (optional)
 *  - className: an extra class for a page's variant (optional)
 *  - children: anything more under the subtitle, e.g. a page's key facts (optional)
 */
export default function PageHero({
  tag, title, subtitle, breadcrumb = [], stats, abstract = false, image, imageCrop, plain = false, className = '', children,
}) {
  const { t } = useTranslation();
  const photo = !abstract && !plain;
  const positioned = Boolean(cleanCrop(imageCrop));

  return (
    <section className={`page-hero${abstract ? ' page-hero--abstract' : ''}${image ? ' page-hero--image' : ''}${className ? ` ${className}` : ''}`}>
      {/* A page's own image is a layer of its own, drawn whole at the hero's
          height on the side opposite the text — not stretched to cover it. */}
      {photo && image && (
        <div className="page-hero__media" aria-hidden="true">
          {positioned ? (
            /* Positioned in the admin: the area chosen there, fitted to this frame. */
            <PositionedBanner
              className="page-hero__media-frame"
              imgClassName="page-hero__media-fill"
              src={String(image)}
              crop={imageCrop}
            />
          ) : (
            <img className="page-hero__media-img" src={String(image)} alt="" />
          )}
        </div>
      )}
      {photo && !image && <div className="page-hero__bg" />}
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
        {children}

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
