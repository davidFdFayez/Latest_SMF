import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

/*
 * TXT-29 — names only. The member listing this file used to render was removed
 * at the federation's request, so the chairs and members are not kept here
 * either: anything left in this array ships in the JavaScript bundle whether it
 * is rendered or not.
 */
const COMMITTEES = [
  { titleAr: 'اللجنة الفنية', titleEn: 'Technical Committee' },
  { titleAr: 'لجنة الحكّام', titleEn: 'Referees Committee' },
  { titleAr: 'لجنة الرياضيين', titleEn: 'Athletes Committee' },
  { titleAr: 'لجنة الاستئناف', titleEn: 'Appeals Committee' },
  { titleAr: 'لجنة المنافسات', titleEn: 'Competitions Committee' },
  { titleAr: 'لجنة الانضباط', titleEn: 'Disciplinary Committee' },
  { titleAr: 'لجنة فض المنازعات', titleEn: 'Dispute Resolution Committee' },
];

export default function Committees() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  return (
    <>
      <section className="page-hero">
        <div className="page-hero__bg" />
        <div className="page-hero__overlay" aria-hidden="true" />
        <div className="page-hero__accent" aria-hidden="true" />
        <div className="container page-hero__content">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/governance/recognition">{ar ? 'الحوكمة' : 'Governance'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'اللجان' : 'Committees'}</span>
          </nav>
          <span className="page-hero__tag">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
            {ar ? 'الحوكمة والرقابة' : 'Governance & Oversight'}
          </span>
          <h1>{ar ? 'لجان الاتحاد السعودي للملاكمة التايلندية' : 'Federation Committees'}</h1>
          <p className="page-hero__sub">
            {ar
              ? 'تضطلع لجان الاتحاد بدور محوري في إدارة الشؤون الرياضية والتقنية والانضباطية وفق أعلى معايير الحوكمة.'
              : 'Federation committees play a central role in managing sporting, technical, and disciplinary affairs to the highest governance standards.'}
          </p>
          <div className="page-hero__stats">
            <div className="page-hero__stat">
              <span className="page-hero__stat-value">7</span>
              <span className="page-hero__stat-label">{ar ? 'لجنة دائمة' : 'Standing Committees'}</span>
            </div>
            <div className="page-hero__stat">
              <span className="page-hero__stat-value">29</span>
              <span className="page-hero__stat-label">{ar ? 'عضو في اللجان' : 'Committee Members'}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="governance-diagram">
        <div className="container governance-diagram__inner">
          <span className="governance-diagram__label">{ar ? 'هيكل اللجان' : 'Committee Structure'}</span>
          <h2 className="governance-diagram__title">{ar ? 'هيكل اللجان التخصصية' : 'Specialist Committee Structure'}</h2>
          <p className="governance-diagram__sub">
            {ar
              ? 'سبع لجان متخصصة تعمل تحت إشراف مجلس الإدارة لضمان أعلى معايير الحوكمة والأداء الرياضي.'
              : 'Seven specialist committees operating under Board oversight to ensure the highest standards of governance and sporting performance.'}
          </p>

          <div className="gov-structure">
            <div className="gov-tier">
              <div className="gov-box gov-box--president">{ar ? 'مجلس الإدارة' : 'Board of Directors'}</div>
            </div>
            <div className="gov-connector"><span className="gov-connector-v" /></div>
            <div className="gov-connector"><div className="gov-connector-h" /></div>
            <div className="gov-tier">
              {COMMITTEES.map((c) => (
                <div className="gov-box gov-box--committee" key={c.titleEn}>{ar ? c.titleAr : c.titleEn}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TXT-29 — the "اللجان الدائمة" (Standing Committees) team listing under
          "الهيكل التنظيمي" was removed at the federation's request, in both
          languages. The committees themselves still appear by name in the
          structure diagram above; their individual members no longer do. */}
    </>
  );
}
