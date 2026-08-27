import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import PageHero from '../components/PageHero';
import { fetchNews, fetchNewsById } from '../api/services';
import { formatDate } from '../utils/format';

/**
 * CNT-03 — the article page used to render a hero, a title, a source line, and
 * a single paragraph, with no category, no featured image (even though the API
 * has always returned `imageUrl`), no breadcrumb, and no way onward. It now
 * carries the full layout: category badge, date, headline, lead, featured
 * image, multi-paragraph body, share links, related stories, and a back link.
 */

const CATEGORY_LABELS = {
  news: { ar: 'أخبار الاتحاد', en: 'Federation news' },
  events: { ar: 'الفعاليات والمنافسات', en: 'Events & competitions' },
  results: { ar: 'النتائج', en: 'Results' },
};

const categoryLabel = (item, ar) => {
  if (item.source === 'IFMA' || item.externalUrl) return 'IFMA';
  const entry = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.news;
  return ar ? entry.ar : entry.en;
};

/** Body text arrives as one string; blank lines separate paragraphs. */
const paragraphsOf = (body) =>
  String(body || '')
    .split(/\n{2,}|\r\n\r\n/)
    .map((block) => block.trim())
    .filter(Boolean);

function ShareLinks({ url, title, ar }) {
  const links = [
    { key: 'x', label: 'X', href: `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
    { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { key: 'email', label: ar ? 'بريد إلكتروني' : 'Email', href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}` },
  ];

  return (
    <div className="news-article__share">
      <span className="news-article__share-label">{ar ? 'مشاركة' : 'Share'}</span>
      <ul>
        {links.map((link) => (
          <li key={link.key}>
            <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function NewsDetail() {
  const { id } = useParams();
  const { lang } = useLang();
  const ar = lang === 'ar';
  const [item, setItem] = useState(null);
  const [related, setRelated] = useState([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let live = true;
    setItem(null);
    setNotFound(false);

    fetchNewsById(id, lang).then((data) => {
      if (!live) return;
      if (data) setItem(data);
      else setNotFound(true);
    });

    return () => { live = false; };
  }, [id, lang]);

  useEffect(() => {
    let live = true;
    fetchNews({ pageSize: 8, lang }).then((data) => {
      if (live) setRelated(data || []);
    });
    return () => { live = false; };
  }, [lang]);

  const title = item ? item.title || (ar ? item.titleAr : item.titleEn) : '';
  const summary = item ? item.summary || (ar ? item.summaryAr : item.summaryEn) : '';
  const body = item ? item.body || (ar ? item.bodyAr : item.bodyEn) : '';
  const paragraphs = useMemo(() => paragraphsOf(body), [body]);

  const others = useMemo(
    () =>
      related
        .filter((entry) => String(entry.id) !== String(id) && !entry.externalUrl)
        .slice(0, 3),
    [related, id],
  );

  if (notFound) {
    return (
      <>
        <PageHero
          title={ar ? 'الخبر غير موجود' : 'Article not found'}
          breadcrumb={[{ label: ar ? 'الأخبار' : 'News', to: '/news' }, { label: ar ? 'غير موجود' : 'Not found' }]}
        />
        <section className="section--white">
          <div className="container container--narrow" style={{ textAlign: 'center', padding: '3rem 0' }}>
            <p>{ar ? 'لم نعثر على هذا الخبر.' : 'We could not find that article.'}</p>
            <Link to="/news" className="btn btn--green">{ar ? 'العودة للأخبار' : 'Back to news'}</Link>
          </div>
        </section>
      </>
    );
  }

  if (!item) {
    return (
      <section className="section--white">
        <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>
          <p>{ar ? 'جاري التحميل…' : 'Loading…'}</p>
          <Link to="/news" className="btn btn--outline">{ar ? 'العودة للأخبار' : 'Back to news'}</Link>
        </div>
      </section>
    );
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <>
      <PageHero
        title={title}
        subtitle={summary}
        breadcrumb={[{ label: ar ? 'الأخبار' : 'News', to: '/news' }, { label: title }]}
      />

      <section className="section--white">
        <article className="container container--narrow news-article">
          <header className="news-article__head">
            <span className="news-article__badge">{categoryLabel(item, ar)}</span>
            <time className="news-article__date" dateTime={item.publishedAt}>
              {formatDate(item.publishedAt, lang)}
            </time>
            {item.source && item.source !== 'SMF' && (
              <span className="news-article__source">{item.source}</span>
            )}
          </header>

          <h2 className="news-article__title">{title}</h2>

          {summary && <p className="news-article__lead">{summary}</p>}

          {item.imageUrl && (
            <figure className="news-article__figure">
              <img src={item.imageUrl} alt={title} loading="lazy" />
            </figure>
          )}

          <div className="news-article__body">
            {paragraphs.length > 0
              ? paragraphs.map((paragraph) => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)
              : <p>{summary}</p>}
          </div>

          {item.externalUrl && (
            <p className="news-article__external">
              <a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className="btn btn--outline">
                {ar ? 'اقرأ على المصدر الخارجي' : 'Read on external source'}
              </a>
            </p>
          )}

          <ShareLinks url={shareUrl} title={title} ar={ar} />

          <p className="news-article__back">
            <Link to="/news" className="btn btn--green">{ar ? '← العودة للأخبار' : '← Back to News'}</Link>
          </p>
        </article>
      </section>

      {others.length > 0 && (
        <section className="section--grey">
          <div className="container">
            <div className="section-header">
              <span className="section-label section-label--green">{ar ? 'أخبار ذات صلة' : 'Related news'}</span>
            </div>
            <div className="fed-hub__grid">
              {others.map((entry) => {
                const otherTitle = entry.title || (ar ? entry.titleAr : entry.titleEn);
                return (
                  <Link key={entry.id} to={`/news/${entry.id}`} className="fed-nav-card">
                    {entry.imageUrl && (
                      <img
                        src={entry.imageUrl}
                        alt=""
                        style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8, marginBottom: '0.75rem' }}
                        loading="lazy"
                      />
                    )}
                    <div className="fed-nav-card__cat">
                      {categoryLabel(entry, ar)} · {formatDate(entry.publishedAt, lang)}
                    </div>
                    <div className="fed-nav-card__title">{otherTitle}</div>
                    <div className="fed-nav-card__arrow">{ar ? '← اقرأ المزيد' : 'Read more →'}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
