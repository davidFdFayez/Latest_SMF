import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import PageHero from '../components/PageHero';
import { fetchEventById } from '../api/services';
import { formatDateLong } from '../utils/format';

const CATEGORY = {
  community: { ar: 'فعاليات مجتمعية', en: 'Community' },
  regional: { ar: 'بطولات داخلية', en: 'Regional' },
  international: { ar: 'بطولات دولية', en: 'International' },
  camp: { ar: 'معسكرات تدريبية', en: 'Training Camps' },
  workshop: { ar: 'تدريب', en: 'Workshops' },
};

const STATUS = {
  confirmed: { ar: 'مؤكد', en: 'Confirmed' },
  tentative: { ar: 'مبدئي', en: 'Tentative' },
  completed: { ar: 'منتهية', en: 'Completed' },
  ongoing: { ar: 'جارية الآن', en: 'Ongoing' },
};

export default function EventDetail() {
  const { id } = useParams();
  const { lang } = useLang();
  const ar = lang === 'ar';
  const [ev, setEv] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchEventById(id, lang).then((data) => {
      if (data) setEv(data);
      else setError(true);
    });
  }, [id, lang]);

  if (error) {
    return (
      <section className="section--white">
        <div className="container" style={{ textAlign: 'center' }}>
          <p>{ar ? 'الفعالية غير موجودة' : 'Event not found'}</p>
          <Link to="/activities/calendar" className="btn btn--green">
            {ar ? 'العودة للتقويم' : 'Back to calendar'}
          </Link>
        </div>
      </section>
    );
  }

  if (!ev) {
    return (
      <section className="section--white">
        <div className="container" style={{ textAlign: 'center' }}>
          {ar ? 'جاري التحميل…' : 'Loading…'}
        </div>
      </section>
    );
  }

  const title = ev.title || (ar ? ev.titleAr : ev.titleEn);
  const cat = CATEGORY[ev.category] || { ar: ev.category, en: ev.category };
  const status = STATUS[ev.status] || { ar: ev.status, en: ev.status };
  /* QA — events now carry a banner image. When there is none the card keeps its
     current shape exactly, with no placeholder box. The title sits right below
     it, so the image is decorative and takes an empty alt. */
  const banner = String(ev.imageUrl || '').trim();

  return (
    <>
      <PageHero
        title={title}
        subtitle={ar ? cat.ar : cat.en}
        breadcrumb={[
          { label: ar ? 'الأنشطة' : 'Activities', to: '/activities/calendar' },
          { label: ar ? 'التقويم' : 'Calendar', to: '/activities/calendar' },
          { label: title },
        ]}
      />
      <section className="section--white">
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="fed-nav-card" style={{ padding: '1.5rem' }}>
            {banner && (
              <img
                className="fed-nav-card__img fed-nav-card__img--banner"
                src={banner}
                alt=""
                loading="lazy"
              />
            )}
            <div className="fed-nav-card__cat">
              {ar ? cat.ar : cat.en} · {ar ? status.ar : status.en}
            </div>
            <h1 className="fed-nav-card__title" style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>
              {title}
            </h1>
            <p className="fed-nav-card__desc" style={{ fontSize: '1.05rem', lineHeight: 1.8 }}>
              <strong>{ar ? 'التاريخ: ' : 'Dates: '}</strong>
              {formatDateLong(ev.startDate, lang)}
              {ev.endDate && ev.endDate !== ev.startDate ? ` – ${formatDateLong(ev.endDate, lang)}` : ''}
              <br />
              <strong>{ar ? 'الموقع: ' : 'Location: '}</strong>
              {ev.location || (ar ? ev.locationAr : ev.locationEn)}
            </p>
            {(ev.description || ev.descriptionAr || ev.descriptionEn) && (
              <p style={{ marginTop: '1.25rem', lineHeight: 1.8, color: '#334155' }}>
                {ev.description || (ar ? ev.descriptionAr : ev.descriptionEn)}
              </p>
            )}
            <div style={{ marginTop: '1.5rem' }}>
              <Link to="/activities/calendar" className="btn btn--outline">
                {ar ? '← جميع الفعاليات' : 'All events →'}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
