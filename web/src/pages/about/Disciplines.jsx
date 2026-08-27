import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

const TAGS = [
  { ar: 'المواي تاي', en: 'Muaythai' },
  { ar: 'مواي بوران', en: 'Muay Boran' },
  { ar: 'مواي إيروبيك', en: 'Muay Aerobic' },
  { ar: 'بارا مواي تاي', en: 'Para Muaythai' },
  { ar: 'واي كرو', en: 'Wai Khru' },
  { ar: 'مواي تالاي', en: 'Muay Talay' },
  { ar: 'مواي كيتا', en: 'Muay Keta' },
];

export default function AboutDisciplines() {
  const { lang } = useLang();
  const ar = lang === 'ar';

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
          <h1>{ar ? 'تخصصات المواي تاي' : 'Muaythai Disciplines'}</h1>
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

            <div className="coming-soon-block__badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {ar ? 'قريباً' : 'Coming Soon'}
            </div>

            <h2 className="coming-soon-block__title">{ar ? 'تخصصات المواي تاي' : 'Muaythai Disciplines'}</h2>

            <p className="coming-soon-block__text">
              {ar
                ? 'يُعدّ المحتوى التفصيلي لتخصصات المواي تاي حالياً، وسيُتاح للعموم فور الاعتماد. يشمل هذا القسم الأنواع والتخصصات الرسمية المعتمدة من قِبل الاتحاد الدولي للمواي تاي IFMA.'
                : 'Detailed content for Muaythai disciplines is currently being prepared and will be published upon approval. This section will cover the official disciplines and formats recognised by the International Federation of Muaythai Associations (IFMA).'}
            </p>

            <div className="coming-soon-block__tags">
              {TAGS.map((t) => (
                <span className="coming-soon-block__tag" key={t.en}>{ar ? t.ar : t.en}</span>
              ))}
            </div>

            <div className="coming-soon-block__actions">
              <Link to="/about-muaythai/pillars" className="btn btn--green">
                {ar ? 'الركائز الخمس للمواي تاي' : '5 Pillars of Muaythai'}
              </Link>
              <Link to="/about-muaythai/rules" className="btn btn--outline-dark">
                {ar ? 'قواعد المواي تاي' : 'Muaythai Rules'}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
