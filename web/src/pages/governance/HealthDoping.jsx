import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

const trustProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const TRUST_ICONS = [
  <svg {...trustProps}><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>,
  <svg {...trustProps}><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>,
  <svg {...trustProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
];

const BODIES = [
  {
    img: '/assets/images/partner-saadc.png',
    orgAr: 'المملكة العربية السعودية',
    orgEn: 'Kingdom of Saudi Arabia',
    titleAr: 'اللجنة السعودية للرقابة على المنشطات (SAADC)',
    titleEn: 'Saudi Arabian Anti-Doping Committee (SAADC)',
    bodyAr: 'تُعنى اللجنة السعودية للرقابة على المنشطات بتهيئة بيئة رياضية نظيفة وعادلة في المملكة، من خلال الاختبارات الدقيقة والبرامج التثقيفية وفق أعلى المعايير الدولية.',
    bodyEn: 'SAADC is dedicated to promoting a clean and fair sporting environment in Saudi Arabia through rigorous testing and educational programs aligned with international standards.',
    site: 'https://saadc.com',
    resources: 'https://saadc.com/?page_id=9029&lang=en',
  },
  {
    img: '/assets/images/partner-wada.jpg',
    orgAr: 'دولي',
    orgEn: 'International',
    titleAr: 'الوكالة العالمية لمكافحة المنشطات (WADA)',
    titleEn: 'World Anti-Doping Agency (WADA)',
    bodyAr: 'تُمثّل الوكالة العالمية لمكافحة المنشطات المرجعَ الدولي الأعلى في مجال مكافحة المنشطات. تضع المعايير الدولية للسياسات، وتُشرف على الامتثال، وتدعم البحث العلمي والتوعية لحماية صحة الرياضيين ونزاهة المنافسة عالمياً.',
    bodyEn: 'WADA sets international standards for anti-doping policies, oversees compliance, and supports scientific research and education to protect the health and integrity of athletes worldwide.',
    site: 'https://www.wada-ama.org/en',
    resources: 'https://www.wada-ama.org/en/resources',
  },
];

const COMMITMENTS = [
  {
    ar: 'تطبيق برامج الاختبارات وفق معايير WADA وSAADC في جميع البطولات الرسمية.',
    en: 'Implementing testing programs aligned with WADA and SAADC standards across all official competitions.',
  },
  {
    ar: 'تثقيف الرياضيين والمدربين والمسؤولين حول اللوائح والأنظمة الخاصة بمكافحة المنشطات.',
    en: 'Educating athletes, coaches, and officials on anti-doping regulations and athlete responsibilities.',
  },
  {
    ar: 'تعزيز ثقافة اللعب النظيف والأمانة الرياضية في جميع أنشطة الاتحاد وفعالياته.',
    en: 'Promoting a culture of clean sport and integrity throughout all federation activities and events.',
  },
];

export default function HealthDoping() {
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
            <span>{ar ? 'الصحة ومكافحة المنشطات' : 'Health & Anti-Doping'}</span>
          </nav>
          <h1>{ar ? 'الصحة ومكافحة المنشطات' : 'Health & Anti-Doping'}</h1>
          <p>
            {ar
              ? 'يلتزم الاتحاد السعودي للملاكمة التايلندية بأعلى المعايير الدولية في مجال الصحة الرياضية ومكافحة استخدام المنشطات، صوناً لنزاهة الرياضة وصحة الرياضيين.'
              : 'The Saudi Muaythai Federation is committed to the highest international standards in sports health and anti-doping, protecting the integrity of the sport and the health of athletes.'}
          </p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <p className="health-intro">
            {ar
              ? 'تُعدّ رياضة المواي تاي النظيفة والصحية أساساً راسخاً في رسالة الاتحاد السعودي للملاكمة التايلندية. يعمل الاتحاد بالتنسيق الوثيق مع الجهات الوطنية والدولية المعنية لضمان بيئة رياضية خالية من المنشطات، تقوم على مبادئ النزاهة والشفافية والعدالة.'
              : "Clean and healthy sport is a foundational principle of the Saudi Muaythai Federation's mission. SMF works in close coordination with national and international bodies to ensure a doping-free sporting environment built on integrity, transparency, and fairness."}
          </p>
        </div>
      </section>

      {/* Approved anti-doping statement — official federation content */}
      <section className="section--white">
        <div className="container container--narrow">
          <div className="section-header">
            <span className="section-label section-label--green">{ar ? 'النص المعتمد' : 'Approved Statement'}</span>
            <h2>{ar ? 'مكافحة المنشطات' : 'Anti-Doping'}</h2>
          </div>

          <p className="health-intro">
            {ar
              ? 'يلتزم الاتحاد السعودي للملاكمة التايلندية بدعم مبادئ الرياضة النظيفة، وتوعية اللاعبين والمدربين بأهمية الالتزام بالأنظمة والتعليمات المتعلقة بمكافحة المنشطات. ويُعد كل لاعب مسؤولاً مسؤولية كاملة عن أي أدوية أو مكملات أو مواد يستخدمها قبل أو أثناء المشاركة في البطولات، بما يتوافق مع الأنظمة المعمول بها لدى الجهات المختصة.'
              : 'The Saudi Muaythai Federation is committed to upholding the principles of clean sport and to educating athletes and coaches on the importance of complying with anti-doping regulations and instructions. Every athlete bears full responsibility for any medication, supplement, or substance they use before or during participation in competitions, in accordance with the regulations of the competent authorities.'}
          </p>

          <p className="health-intro">
            {ar
              ? 'ولغرض التوعية، يمكن للاعبين والمدربين الاطلاع على منصة ADEL التابعة للوكالة العالمية لمكافحة المنشطات WADA من خلال الرابط التالي:'
              : 'For educational purposes, athletes and coaches may access the ADEL platform of the World Anti-Doping Agency (WADA) via the following link:'}
          </p>

          <p>
            <a
              className="btn btn--green btn--sm"
              href="https://adel.wada-ama.org/learn/signin"
              target="_blank"
              rel="noopener noreferrer"
            >
              {ar ? 'منصة ADEL التعليمية ↗' : 'ADEL Learning Platform ↗'}
            </a>
          </p>

          {/* Athlete pledge & declaration — short approved wording */}
          <div className="wb-confidentiality">
            <div className="wb-confidentiality__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3>{ar ? 'نص التعهد والإقرار' : 'Pledge & Declaration'}</h3>
              <p>
                {ar
                  ? 'أقر بالتزامي بالأنظمة والتعليمات المتعلقة بمكافحة المنشطات، وأتحمل المسؤولية الكاملة عن أي أدوية أو مكملات أو مواد أستخدمها قبل أو أثناء البطولة.'
                  : 'I acknowledge my commitment to anti-doping regulations and instructions, and I accept full responsibility for any medication, supplement, or substance I use before or during the competition.'}
              </p>
            </div>
          </div>

          <p className="s-sub" style={{ marginTop: '1.5rem' }}>
            {ar
              ? 'المرفقات الداعمة: نموذج الفحص الطبي المستخدم في البطولات، ونموذج التعهد والإقرار — تُطلب وقت البطولة فقط.'
              : 'Supporting attachments: the medical examination form used in competitions, and the pledge & declaration form — required at competition time only.'}
          </p>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'الهيئات المرجعية' : 'Governing Bodies'}</span>
            <h2>{ar ? 'الهيئات الرقابية المعتمدة' : 'Official Anti-Doping Bodies'}</h2>
          </div>

          <div className="recognition-grid">
            {BODIES.map((b) => (
              <div className="recognition-card" key={b.titleEn}>
                <div className="recognition-card__header">
                  <div className="recognition-card__logo recognition-card__logo--img">
                    <img className="recognition-card__logo-img" src={b.img} alt={ar ? b.titleAr : b.titleEn} loading="lazy" />
                  </div>
                  <div>
                    <div className="recognition-card__org">{ar ? b.orgAr : b.orgEn}</div>
                    <h3>{ar ? b.titleAr : b.titleEn}</h3>
                  </div>
                </div>
                <p>{ar ? b.bodyAr : b.bodyEn}</p>
                <div className="recognition-card__actions">
                  <a className="btn btn--green btn--sm" href={b.site} target="_blank" rel="noopener noreferrer">
                    {ar ? 'الموقع الرسمي ↗' : 'Official Website ↗'}
                  </a>
                  <a className="btn btn--outline-dark btn--sm" href={b.resources} target="_blank" rel="noopener noreferrer">
                    {ar ? 'الموارد التثقيفية ↗' : 'Educational Resources ↗'}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--green-gradient">
        <div className="container">
          <div className="section-header section-header--center">
            <h2>{ar ? 'التزامات الاتحاد' : "SMF's Anti-Doping Commitments"}</h2>
          </div>
          <div className="trust-grid">
            {COMMITMENTS.map((c, i) => (
              <div className="trust-card" key={c.en}>
                <div className="trust-card__icon">{TRUST_ICONS[i]}</div>
                <p>{ar ? c.ar : c.en}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
