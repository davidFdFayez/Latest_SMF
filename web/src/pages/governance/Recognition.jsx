import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

const logoProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const LOGOS = [
  <svg {...logoProps}><circle cx="12" cy="8" r="4" /><path d="M2 20c0-4 4-7 10-7s10 3 10 7" /><path d="M12 12v-1a2 2 0 012-2h1" /></svg>,
  <svg {...logoProps}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>,
  <svg {...logoProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
];

function IconYear() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconTick() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const CARDS = [
  {
    yearAr: '2019',
    yearEn: '2019',
    orgAr: 'المملكة العربية السعودية',
    orgEn: 'Kingdom of Saudi Arabia',
    titleAr: 'اللجنة الأولمبية والبارالمبية السعودية',
    titleEn: 'Saudi Olympic & Paralympic Committee',
    bodyAr: 'أُسِّس الاتحاد رسمياً عام 2019 تحت مظلة اللجنة الأولمبية والبارالمبية السعودية، مما أضفى عليه الشرعية المؤسسية الرسمية بوصفه الجهة الحاكمة المعتمدة للمواي تاي في المملكة.',
    bodyEn: 'SMF was officially established in 2019 under the SOPC, conferring institutional legitimacy as the recognized governing body for Muaythai in the Kingdom.',
    benefits: null,
  },
  {
    yearAr: 'ديسمبر 2020',
    yearEn: 'December 2020',
    orgAr: 'IFMA',
    orgEn: 'IFMA',
    titleAr: 'عضوية الاتحاد الدولي لجمعيات الملاكمة التايلندية',
    titleEn: 'IFMA International Membership',
    bodyAr: 'انضم الاتحاد إلى أسرة IFMA، الاتحادِ الدولي الأعلى للمواي تاي المعترَف به من اللجنة الأولمبية الدولية. ومنذ ذلك الحين، بات الرياضيون السعوديون يتنافسون في بطولات العالم الرسمية تحت اعتراف دولي كامل.',
    bodyEn: 'SMF joined the IFMA family — the global governing body recognized by the International Olympic Committee — enabling Saudi athletes to compete in official World Championships under full international recognition.',
    benefits: [
      { ar: 'المشاركة في بطولات العالم الرسمية', en: 'Participation in official World Championships' },
      { ar: 'أعلى معايير الحوكمة الدولية', en: 'Highest international governance standards' },
      { ar: 'الوصول إلى برامج التدريب الدولية', en: 'Access to international training programs' },
    ],
  },
  {
    yearAr: '2023',
    yearEn: '2023',
    orgAr: 'IFMA — قيادة دولية',
    orgEn: 'IFMA — International Leadership',
    titleAr: 'نيابة رئاسة IFMA الدولية',
    titleEn: 'IFMA International Vice Presidency',
    bodyAr: 'تعيين سمو الأمير فهد بن منصور بن سعد بن سعود بن عبدالعزيز آل سعود نائباً لرئيس IFMA — أول قيادي سعودي يتولى هذا المنصب الدولي الرفيع، تعبيراً عن الثقة الدولية في القيادة السعودية للمواي تاي.',
    bodyEn: 'HRH Prince Fahad Bin Mansour Bin Saad Bin Saud Bin Abdulaziz Al Saud was appointed Vice President of IFMA — the first Saudi official to hold this senior international position, reflecting global confidence in Saudi Muaythai leadership.',
    benefits: null,
  },
];

const SUPERVISORS = [
  { img: '/assets/images/partner-mos.png', ar: 'وزارة الرياضة', en: 'Ministry of Sport' },
  { img: '/assets/images/partner-sopc.jpg', ar: 'اللجنة الأولمبية والبارالمبية السعودية', en: 'Saudi Olympic & Paralympic Committee' },
  { img: '/assets/images/partner-ifma.webp', ar: 'الاتحاد الدولي لجمعيات الملاكمة التايلندية', en: 'International Federation of Muaythai Associations' },
];

export default function Recognition() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/governance/recognition">{ar ? 'الحوكمة' : 'Governance'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'الاعتراف الرسمي' : 'SMF Recognition'}</span>
          </nav>
          <h1>{ar ? 'الاعتراف الرسمي والانتماء الدولي' : 'Official Recognition & International Affiliation'}</h1>
          <p>
            {ar
              ? 'يحظى الاتحاد السعودي للملاكمة التايلندية باعتراف رسمي من المنظمات الرياضية الدولية والوطنية، مما يُعزز مكانته ووزنه على الساحة الرياضية العالمية.'
              : 'The Saudi Muaythai Federation holds official recognition from international and national sports organizations, solidifying its standing on the global sporting stage.'}
          </p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <p className="recognition-intro">
            {ar
              ? 'شكّل الاعتراف الرسمي الذي ناله الاتحاد السعودي للملاكمة التايلندية من المنظمات الرياضية الدولية والوطنية خطوةً محوريةً في مسيرته، إذ أتاح للرياضيين السعوديين تمثيل بلادهم على أرفع المحافل الدولية بصفة رسمية معترف بها.'
              : 'The official recognition received by SMF from international and national sporting organizations was a pivotal step, enabling Saudi athletes to officially represent their country at the highest international competitions.'}
          </p>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'مؤسسي ودولي' : 'Institutional & International'}</span>
            <h2>{ar ? 'مراحل الاعتراف' : 'Recognition Milestones'}</h2>
          </div>

          <div className="recognition-grid">
            {CARDS.map((c, i) => (
              <div className="recognition-card recognition-card--featured" key={c.titleEn}>
                <div className="recognition-card__header">
                  <div className="recognition-card__logo">{LOGOS[i]}</div>
                  <div>
                    <div className="recognition-card__org">{ar ? c.orgAr : c.orgEn}</div>
                    <h3>{ar ? c.titleAr : c.titleEn}</h3>
                  </div>
                </div>
                <span className="recognition-card__year">
                  <IconYear />
                  {ar ? c.yearAr : c.yearEn}
                </span>
                <p>{ar ? c.bodyAr : c.bodyEn}</p>
                {c.benefits && (
                  <div className="recognition-benefits">
                    {c.benefits.map((b) => (
                      <span className="recognition-benefit" key={b.en}>
                        <IconTick />
                        {ar ? b.ar : b.en}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="supervision-strip">
            <p className="supervision-strip__label">{ar ? 'تحت الإشراف الرسمي لـ' : 'Under the Official Supervision of'}</p>
            <div className="supervision-strip__logos">
              {SUPERVISORS.map((s) => (
                <div className="supervision-strip__item" key={s.en}>
                  <img className="supervision-strip__img" src={s.img} alt={ar ? s.ar : s.en} loading="lazy" />
                  <span>{ar ? s.ar : s.en}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
