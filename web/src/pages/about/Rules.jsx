import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

function IconDoc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function IconExternal({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/* Official IFMA rule books — linked to the international federation's own site. */
const DOCS = [
  {
    href: 'https://muaythai.sport/wp-content/uploads/2026/05/IFMA-Rules-and-Regulations-v3.057_110526.pdf',
    titleAr: 'قواعد وأنظمة IFMA (الإصدار 3.057)',
    titleEn: 'IFMA Rules and Regulations v3.057',
    descAr: 'الوثيقة الرسمية الشاملة لقواعد وأنظمة المواي تاي المعتمدة من الاتحاد الدولي IFMA.',
    descEn: 'The official comprehensive rules and regulations document approved by the International Federation of Muaythai Associations.',
  },
  {
    href: 'https://muaythai.sport/wp-content/uploads/2025/07/IFMA-Muaythai-Lor-Pao-v1.03.3_060325.pdf',
    titleAr: 'أنظمة مواي تاي لور باو',
    titleEn: 'IFMA Muaythai Lor Pao Rules',
    descAr: 'أنظمة مواي تاي لور باو الصادرة عن IFMA.',
    descEn: 'Official IFMA Muaythai Lor Pao rules and regulations.',
  },
  {
    href: 'https://muaythai.sport/wp-content/uploads/2025/03/IFMA-Chok-Lom-Muaythai-v1.02.3_060325.pdf',
    titleAr: 'أنظمة تشوك لوم المواي تاي',
    titleEn: 'IFMA Chok Lom Muaythai Rules',
    descAr: 'أنظمة تشوك لوم المواي تاي الصادرة عن IFMA.',
    descEn: 'Official IFMA Chok Lom Muaythai rules and regulations.',
  },
  /* TXT-05 — the WKMM "Turkey Special Edition" document was removed: the
     federation publishes the IFMA rulebooks only, not a single tournament's
     special edition. */
];

const LINKS = [
  {
    href: 'https://muaythai.sport/about-muaythai/muaythai-rules/a-coach-and-managers-guide/',
    titleAr: 'دليل المدربين والمديرين — IFMA',
    titleEn: "A Coach & Manager's Guide — IFMA",
    descAr: 'دليل شامل للمدربين ومديري الفرق من الاتحاد الدولي IFMA.',
    descEn: 'Comprehensive guide for coaches and team managers from IFMA.',
  },
  {
    href: 'https://muaythai.sport/about-muaythai/muaythai-rules/',
    titleAr: 'قواعد المواي تاي — موقع IFMA',
    titleEn: 'Muaythai Rules — IFMA Website',
    descAr: 'صفحة قواعد المواي تاي الرسمية على الموقع الدولي لـ IFMA.',
    descEn: 'Official Muaythai rules page on the IFMA international website.',
  },
];

export default function AboutRules() {
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
            <span>{ar ? 'القواعد والأنظمة' : 'Muaythai Rules'}</span>
          </nav>
          <h1>{ar ? 'قواعد المواي تاي وأنظمة التحكيم' : 'Muaythai Rules & Officiating Standards'}</h1>
          <p>
            {ar
              ? 'القواعد والأنظمة الرسمية المعتمدة التي تحكم ممارسة رياضة المواي تاي في المملكة العربية السعودية، مع المرجعية الدولية لـ IFMA.'
              : "Official rules and standards governing Muaythai in the Kingdom of Saudi Arabia, with reference to IFMA's international framework."}
          </p>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'وثائق IFMA الرسمية' : 'Official IFMA Documents'}</span>
            <h2>{ar ? 'قواعد وأنظمة المواي تاي' : 'Rules & Regulations Documents'}</h2>
            <p>
              {ar
                ? 'وثائق PDF الرسمية الصادرة عن الاتحاد الدولي IFMA'
                : 'Official PDF documents published by the International Federation of Muaythai Associations'}
            </p>
          </div>

          <div className="rules-doc-grid">
            {DOCS.map((d) => (
              <a key={d.href} className="rules-doc-card" href={d.href} target="_blank" rel="noopener noreferrer">
                <div className="rules-doc-card__icon" aria-hidden="true"><IconDoc /></div>
                <div className="rules-doc-card__body">
                  <span className="rules-doc-card__type">PDF</span>
                  <h3>{ar ? d.titleAr : d.titleEn}</h3>
                  <p>{ar ? d.descAr : d.descEn}</p>
                </div>
                <div className="rules-doc-card__arrow" aria-hidden="true"><IconExternal /></div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'روابط مرجعية' : 'Reference Links'}</span>
            <h2>{ar ? 'موارد إضافية من IFMA' : 'Additional IFMA Resources'}</h2>
          </div>

          <div className="rules-link-grid">
            {LINKS.map((l) => (
              <a key={l.href} className="rules-link-card" href={l.href} target="_blank" rel="noopener noreferrer">
                <div className="rules-link-card__icon" aria-hidden="true"><IconGlobe /></div>
                <div className="rules-link-card__body">
                  <h3>{ar ? l.titleAr : l.titleEn}</h3>
                  <p>{ar ? l.descAr : l.descEn}</p>
                </div>
                <IconExternal className="rules-link-card__arrow" />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="section--green-gradient values-cta">
        <div className="container">
          <h2>{ar ? 'تعرّف على معدات المواي تاي' : 'Explore Muaythai Equipment'}</h2>
          <p className="values-cta__text">
            {ar
              ? 'اطّلع على متطلبات المعدات والتجهيزات المعتمدة لمنافسات المواي تاي.'
              : 'Learn about the approved equipment requirements for Muaythai competitions.'}
          </p>
          <Link to="/about-muaythai/equipment" className="btn btn--gold">{ar ? 'المعدات والتجهيزات' : 'Equipment & Gear'}</Link>
        </div>
      </section>
    </>
  );
}
