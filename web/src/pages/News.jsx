import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import PageHero from '../components/PageHero';
import { fetchNews } from '../api/services';
import { formatDate } from '../utils/format';

export default function News() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetchNews({ pageSize: 40, lang }).then((data) => setItems(data || []));
  }, [lang]);

  return (
    <>
      <PageHero
        title={ar ? 'الأخبار' : 'News'}
        subtitle={ar ? 'آخر أخبار الاتحاد وأخبار IFMA الدولية' : 'Latest SMF news and international IFMA coverage'}
        breadcrumb={[{ label: ar ? 'الأخبار' : 'News' }]}
      />
      <section className="section--white">
        <div className="container">
          <div className="fed-hub__grid">
            {items.map((n) => {
              const isIfma = n.source === 'IFMA' || !!n.externalUrl;
              const title = n.title || (ar ? n.titleAr : n.titleEn);
              const summary = n.summary || (ar ? n.summaryAr : n.summaryEn);
              const catLabel = isIfma
                ? 'IFMA EN'
                : n.category === 'events'
                  ? (ar ? 'الفعاليات والمنافسات' : 'Events')
                  : n.category === 'results'
                    ? (ar ? 'النتائج' : 'Results')
                    : (ar ? 'أخبار الاتحاد' : 'Federation news');

              const body = (
                <>
                  {n.imageUrl && (
                    <img
                      src={n.imageUrl}
                      alt=""
                      style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8, marginBottom: '0.75rem' }}
                      loading="lazy"
                    />
                  )}
                  <div className="fed-nav-card__cat">
                    {catLabel} · {formatDate(n.publishedAt, lang)}
                  </div>
                  <div className="fed-nav-card__title">{title}</div>
                  <p className="fed-nav-card__desc">{summary}</p>
                  <div className="fed-nav-card__arrow">
                    {isIfma ? (ar ? 'اقرأ على موقع IFMA' : 'Read on IFMA') : (ar ? '← اقرأ المزيد' : 'Read more →')}
                  </div>
                </>
              );

              if (isIfma) {
                return (
                  <a
                    key={n.id}
                    href={n.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="fed-nav-card"
                  >
                    {body}
                  </a>
                );
              }

              return (
                <Link key={n.id} to={`/news/${n.id}`} className="fed-nav-card">
                  {body}
                </Link>
              );
            })}
            {items.length === 0 && (
              <p style={{ gridColumn: '1/-1', textAlign: 'center' }}>
                {ar ? 'لا توجد أخبار حالياً' : 'No news yet'}
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
