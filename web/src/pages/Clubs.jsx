import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import PageHero from '../components/PageHero';
import Avatar from '../components/Avatar';
import { fetchClubRegions, fetchClubs } from '../api/services';

const ENTITY_LABELS = {
  club: { ar: 'نادي', en: 'Club' },
  center: { ar: 'مركز', en: 'Centre' },
  academy: { ar: 'أكاديمية', en: 'Academy' },
};

/** Normalises a stored URL that may have been typed without a scheme. */
function externalUrl(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function ClubCard({ club, ar }) {
  const name = (ar ? club.nameAr : club.nameEn) || club.nameAr || club.nameEn || '';
  const entity = ENTITY_LABELS[club.entityType];
  const place = [club.city, club.district].filter(Boolean).join(ar ? ' · ' : ' · ');
  const maps = externalUrl(club.googleMapsUrl);
  const website = externalUrl(club.website);

  return (
    <article className="club-card">
      <header className="club-card__head">
        <Avatar name={name} size="md" />
        <div className="club-card__id">
          <h3 className="club-card__name">{name}</h3>
          <p className="club-card__meta">
            {entity && <span className="club-card__type">{ar ? entity.ar : entity.en}</span>}
            {club.region && <span>{club.region}</span>}
          </p>
        </div>
      </header>

      <dl className="club-card__facts">
        {place && (
          <div>
            <dt>{ar ? 'الموقع' : 'Location'}</dt>
            <dd>{place}</dd>
          </div>
        )}
        {club.shortAddress && (
          <div>
            <dt>{ar ? 'العنوان' : 'Address'}</dt>
            <dd>{club.shortAddress}</dd>
          </div>
        )}
        {club.categoriesAccepted && (
          <div>
            <dt>{ar ? 'الفئات المستقبَلة' : 'Categories accepted'}</dt>
            <dd>{club.categoriesAccepted}</dd>
          </div>
        )}
        {club.trainingSchedule && (
          <div>
            <dt>{ar ? 'أوقات التدريب' : 'Training times'}</dt>
            <dd>{club.trainingSchedule}</dd>
          </div>
        )}
      </dl>

      <footer className="club-card__actions">
        {maps && (
          <a className="btn btn--green btn--small" href={maps} target="_blank" rel="noreferrer">
            {ar ? 'الموقع على الخريطة' : 'View on map'}
          </a>
        )}
        {club.email && (
          <a className="btn btn--outline btn--small" href={`mailto:${club.email}`}>
            {ar ? 'راسل النادي' : 'Email club'}
          </a>
        )}
        {website && (
          <a className="btn btn--outline btn--small" href={website} target="_blank" rel="noreferrer">
            {ar ? 'الموقع الإلكتروني' : 'Website'}
          </a>
        )}
      </footer>
    </article>
  );
}

export default function Clubs() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [clubs, setClubs] = useState(null); // null = loading, [] = loaded empty
  const [regions, setRegions] = useState([]);
  const [region, setRegion] = useState('all');
  const [search, setSearch] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    fetchClubs().then((data) => {
      if (!active) return;
      if (data === null) {
        setFailed(true);
        setClubs([]);
      } else {
        setClubs(data);
      }
    });

    fetchClubRegions().then((data) => {
      if (active) setRegions(data);
    });

    return () => {
      active = false;
    };
  }, []);

  // Filtering happens client-side: the directory is small enough that a round
  // trip per keystroke would be slower than it is worth.
  const visible = useMemo(() => {
    if (!clubs) return [];
    const term = search.trim().toLowerCase();

    return clubs.filter((club) => {
      if (region !== 'all' && club.region !== region) return false;
      if (!term) return true;
      return [club.nameAr, club.nameEn, club.city, club.region, club.district]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [clubs, region, search]);

  const loading = clubs === null;

  return (
    <>
      <PageHero
        tag={ar ? 'جرب المواي تاي' : 'Try Muaythai'}
        title={ar ? 'الأندية والمراكز المعتمدة' : 'Approved Clubs & Centres'}
        subtitle={
          ar
            ? 'ابحث عن نادٍ أو مركز معتمد قريب منك وابدأ تدريب المواي تاي. جميع الجهات المعروضة معتمدة لدى الاتحاد السعودي للمواي تاي.'
            : 'Find an approved club or centre near you and start training Muaythai. Every facility listed here is approved by the Saudi Muaythai Federation.'
        }
        breadcrumb={[{ label: ar ? 'جرب المواي تاي' : 'Try Muaythai' }]}
      />

      <section className="section section--white">
        <div className="container">
          <div className="clubs-toolbar">
            <label className="clubs-toolbar__search">
              <span className="sr-only">{ar ? 'ابحث عن نادٍ' : 'Search clubs'}</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={ar ? 'ابحث بالاسم أو المدينة…' : 'Search by name or city…'}
              />
            </label>

            <label className="clubs-toolbar__region">
              <span className="sr-only">{ar ? 'تصفية بالمنطقة' : 'Filter by region'}</span>
              <select value={region} onChange={(event) => setRegion(event.target.value)}>
                <option value="all">{ar ? 'كل المناطق' : 'All regions'}</option>
                {regions.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>

            {!loading && (
              <p className="clubs-toolbar__count">
                {ar ? `${visible.length} جهة` : `${visible.length} ${visible.length === 1 ? 'facility' : 'facilities'}`}
              </p>
            )}
          </div>

          {loading ? (
            <p className="clubs-state">{ar ? 'جارٍ تحميل الأندية…' : 'Loading clubs…'}</p>
          ) : failed ? (
            <div className="clubs-state clubs-state--empty">
              <h2>{ar ? 'تعذر تحميل قائمة الأندية' : 'Could not load the club list'}</h2>
              <p>
                {ar
                  ? 'يرجى المحاولة مرة أخرى لاحقاً، أو التواصل مع الاتحاد للاستفسار عن أقرب نادٍ لك.'
                  : 'Please try again shortly, or contact the federation to ask about the nearest club to you.'}
              </p>
              <Link to="/contact" className="btn btn--green">{ar ? 'تواصل معنا' : 'Contact us'}</Link>
            </div>
          ) : visible.length === 0 ? (
            <div className="clubs-state clubs-state--empty">
              <h2>{clubs.length === 0 ? (ar ? 'لا توجد أندية معتمدة بعد' : 'No approved clubs yet') : (ar ? 'لا توجد نتائج' : 'No matches')}</h2>
              <p>
                {clubs.length === 0
                  ? ar
                    ? 'يجري الاتحاد حالياً مراجعة طلبات تسجيل الأندية. تواصل معنا وسنساعدك في الوصول إلى أقرب مكان للتدريب.'
                    : 'The federation is currently reviewing club registration applications. Get in touch and we will help you find somewhere to train.'
                  : ar
                    ? 'جرّب تعديل البحث أو اختيار منطقة أخرى.'
                    : 'Try adjusting your search or choosing a different region.'}
              </p>
              {clubs.length === 0 ? (
                <Link to="/contact" className="btn btn--green">{ar ? 'تواصل معنا' : 'Contact us'}</Link>
              ) : (
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => {
                    setSearch('');
                    setRegion('all');
                  }}
                >
                  {ar ? 'إعادة ضبط البحث' : 'Reset filters'}
                </button>
              )}
            </div>
          ) : (
            <div className="clubs-grid">
              {visible.map((club) => (
                <ClubCard key={club.id} club={club} ar={ar} />
              ))}
            </div>
          )}

          <div className="clubs-cta">
            <h2>{ar ? 'تمتلك نادياً أو مركزاً تدريبياً؟' : 'Run a club or training centre?'}</h2>
            <p>
              {ar
                ? 'سجّل منشأتك لدى الاتحاد السعودي للمواي تاي لتظهر في هذا الدليل.'
                : 'Register your facility with the Saudi Muaythai Federation to appear in this directory.'}
            </p>
            <Link to="/registration/club" className="btn btn--green">
              {ar ? 'تسجيل نادي / منشأة' : 'Register a club'}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
