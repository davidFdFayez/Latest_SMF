import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

/* One icon per initiative, matching the published cards. */
const ICONS = [
  <svg {...svgProps}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14" /><path d="M15.54 8.46a5 5 0 010 7.07" /></svg>,
  <svg {...svgProps}><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>,
  <svg {...svgProps}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  <svg {...svgProps}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12l2 2 4-4" /></svg>,
  <svg {...svgProps}><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" /></svg>,
  <svg {...svgProps}><path d="M3.85 8.62a4 4 0 014.78-4.77 4 4 0 016.74 0 4 4 0 014.78 4.78 4 4 0 010 6.74 4 4 0 01-4.77 4.78 4 4 0 01-6.75 0 4 4 0 01-4.78-4.77 4 4 0 010-6.76z" /><path d="M9 12l2 2 4-4" /></svg>,
  <svg {...svgProps}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  <svg {...svgProps}><circle cx="12" cy="5" r="3" /><path d="M6.5 21l5.5-11 5.5 11" /><path d="M4 12h5" /><path d="M15 12h5" /></svg>,
];

const INITIATIVES = [
  {
    catAr: 'المشاركة المجتمعية',
    catEn: 'Community Participation',
    titleAr: '1. حملات تنشيط المشاركة الشعبية',
    titleEn: '1. Activation Campaigns',
    bodyAr: 'تنظيم حملات موجّهة لتعزيز المشاركة وزيادة الوعي وتطوير المهارات لدى مختلف الفئات العمرية والجنسين، بما في ذلك الفعاليات المفتوحة والمعارض الرياضية والدورات التمهيدية للمبتدئين.',
    bodyEn: 'Organised targeted campaigns to promote participation, increase awareness, and develop skills across age groups and genders, including open events, sports exhibitions, and introductory workshops for beginners.',
    pending: false,
  },
  {
    catAr: 'الرياضة المدرسية',
    catEn: 'School Sports',
    titleAr: '2. إدراج المواي تاي في المناهج المدرسية',
    titleEn: '2. Muaythai in Schools',
    bodyAr: 'إدخال رياضة المواي تاي في المدارس ضمن مناهج التربية البدنية أو الأنشطة اللاصفية، بهدف تعزيز اللياقة البدنية وتطوير المهارات واستقطاب المواهب الشابة.',
    bodyEn: 'Introduce Muaythai in schools as part of the PE curriculum or as after-school activities, promoting physical fitness, skill development, and student interest.',
    pending: false,
  },
  {
    catAr: 'اكتشاف المواهب',
    catEn: 'Talent Identification',
    titleAr: '3. برنامج الكشف الوطني عن المواهب',
    titleEn: '3. National Talent Scouting Program',
    bodyAr: 'إنشاء برنامج وطني متكامل لاكتشاف المواهب الواعدة وصقلها في مختلف أنحاء المملكة، وبناء خط تغذية مستدام للرياضيين المستقبليين عبر شبكة من المراقبين المتخصصين.',
    bodyEn: 'Establish a national scouting program to identify and nurture promising talent across the country and build a pipeline for future athletes through a network of specialist scouts.',
    pending: false,
  },
  {
    catAr: 'الرعاية والتطوير',
    catEn: 'Nurturing & Development',
    titleAr: '4. نظام اختيار المنتخب الوطني الشفّاف',
    titleEn: '4. Transparent National Team Selection',
    bodyAr: 'وضع نظام واضح ومنصف لاختيار أعضاء المنتخب الوطني، يكفل تقييماً موضوعياً شفافاً للرياضيين، مما يعزز الثقة ويُحفّز الجميع على بلوغ أعلى مستويات الأداء.',
    bodyEn: 'Develop a structured and transparent selection process for the national team to ensure fair and objective evaluation of athletes, building trust and motivating all athletes to achieve peak performance.',
    pending: false,
  },
  {
    catAr: 'المدربون والحكام',
    catEn: 'Coaches & Officials',
    titleAr: '5. المسار الوطني لتطوير المدربين',
    titleEn: '5. National Coaching Pathway',
    bodyAr: 'إرساء مسار وطني لتدريب المدربين وفق معايير الاتحاد الدولي، يشمل برامج تدريبية منظّمة وشهادات اعتماد وفرص تطوير مستمر.',
    bodyEn: 'Establish a national coaching pathway aligned with international federation standards, with structured training programs, certification, and ongoing development.',
    pending: false,
  },
  {
    catAr: 'المدربون والحكام',
    catEn: 'Coaches & Officials',
    titleAr: '6. المسار الوطني لتأهيل الحكام والمسؤولين',
    titleEn: "6. National Officials' Pathway",
    bodyAr: 'تأسيس مسار وطني لتأهيل الحكام والمسؤولين الرياضيين، يتضمن برامج تدريبية وشهادات اعتماد دولية وآليات للتطوير المستمر.',
    bodyEn: "Establish a national officials' pathway with structured training, international certification, and ongoing development to enhance refereeing standards.",
    pending: false,
  },
  {
    catAr: 'المنافسات الوطنية والدولية',
    catEn: 'National & International Competitions',
    titleAr: '7. إعادة هيكلة التقويم البطولي الوطني',
    titleEn: '7. Redesigning the Competition Calendar',
    bodyAr: 'إعادة تصميم هيكل البطولات الوطنية السنوية لتكون أكثر تنظيماً وشمولاً واستراتيجية من حيث التوقيت، بما يخدم الرياضيين ويُسهم في رفع مستوى التنافسية الدولية.',
    bodyEn: 'Redesign the structure and calendar of yearly domestic competitions to create a more organised, accessible, and strategically timed schedule that prepares teams for international participation.',
    pending: false,
  },
  {
    catAr: 'الرياضة الشاملة',
    catEn: 'Inclusive Sport',
    titleAr: '8. مبادرة تطوير بارا مواي تاي',
    titleEn: '8. Para Muaythai Development Initiative',
    bodyAr: 'مبادرة مخصصة لتطوير بارا مواي تاي بوصفها أحد الأولويات الاستراتيجية للاتحاد، انسجاماً مع التزامات IFMA الدولية نحو شمولية الرياضة. تُعدّ مؤشرات الأداء الرئيسية (KPI) والأهداف التفصيلية حالياً.',
    bodyEn: "A dedicated initiative aligned with IFMA's international commitments to inclusive sport. KPIs and detailed objectives are currently being developed in partnership with the national Para sport framework.",
    pending: true,
  },
];

export default function Initiatives() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/organization/overview">{ar ? 'الاتحاد' : 'The Organization'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'المبادرات' : 'Initiatives'}</span>
          </nav>
          <h1>{ar ? 'مبادراتنا الرئيسية' : 'Our Key Initiatives'}</h1>
          <p>
            {ar
              ? 'يُكرّس الاتحاد السعودي للملاكمة التايلندية جهوده لبناء منظومة رياضية متكاملة ومستدامة للمواي تاي في المملكة.'
              : 'The Saudi Muaythai Federation is dedicated to building a strong and inclusive Muaythai ecosystem across the Kingdom.'}
          </p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <p className="values-intro">
            {ar
              ? 'صُمِّمت مبادرات الاتحاد لتحريك عجلة النمو والتطوير الرياضي في جميع مناطق المملكة العربية السعودية، مع التركيز على رعاية المواهب وتعزيز الروح الرياضية وتوسيع الحضور الدولي للمواي تاي.'
              : 'Our initiatives are designed to drive the growth and development of the sport across all regions of Saudi Arabia, with a focus on nurturing talent, promoting sportsmanship, and enhancing global recognition.'}
          </p>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'المبادرات النشطة' : 'Active Initiatives'}</span>
            <h2>{ar ? 'مبادرات الاتحاد السعودي للملاكمة التايلندية' : 'SMF Initiatives'}</h2>
          </div>

          <div className="initiative-grid">
            {INITIATIVES.map((it, i) => (
              <div className="initiative-card" key={it.titleEn}>
                <div className="initiative-card__header">
                  <div className="initiative-card__icon">{ICONS[i]}</div>
                  <div className="initiative-card__header-text">
                    <div className="initiative-card__category">{ar ? it.catAr : it.catEn}</div>
                    <h3>{ar ? it.titleAr : it.titleEn}</h3>
                  </div>
                </div>
                <div className="initiative-card__body">
                  <p>{ar ? it.bodyAr : it.bodyEn}</p>
                  <span className={`initiative-card__status initiative-card__status--${it.pending ? 'pending' : 'active'}`}>
                    {it.pending
                      ? (ar ? 'KPI قيد التطوير' : 'KPI In Development')
                      : (ar ? 'جارٍ التنفيذ' : 'Active')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--green-gradient values-cta">
        <div className="container">
          <p className="values-cta__text">
            {ar
              ? 'كن جزءاً من هذه المبادرات وأسهم في تشكيل مستقبل المواي تاي في المملكة العربية السعودية.'
              : 'Be part of our initiatives and help shape the future of Muaythai in Saudi Arabia.'}
          </p>
          <div className="values-cta__btns">
            <Link to="/registration" className="btn btn--gold">{ar ? 'سجّل الآن' : 'Register Now'}</Link>
            <Link to="/organization/goals" className="btn btn--outline btn--outline-white">{ar ? 'الأهداف' : 'Our Goals'}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
