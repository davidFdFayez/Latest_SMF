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

const ICONS = [
  <svg {...svgProps}><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" /></svg>,
  <svg {...svgProps}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
  <svg {...svgProps}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  <svg {...svgProps}><path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" /><path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" /><path d="M7 21h10" /><path d="M12 3v18" /><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" /></svg>,
  <svg {...svgProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>,
];

const PILLARS = [
  {
    n: '01',
    titleAr: 'التقاليد',
    titleEn: 'Tradition',
    bodyAr: 'المواي تاي متجذّرة في عمق الثقافة التايلاندية، تُعبّر عن التوقير والانتماء للموروث الأصيل من خلال الطقوس الراسخة كرقصة "واي كرو" (Wai Kru) وأداء "رام مواي" (Ram Muay). هذه الممارسات ليست مجرد حركات، بل هي خطاب ثقافي صامت تتناقله الأجيال.',
    bodyEn: 'Muaythai is deeply rooted in Thai culture, showcasing respect for heritage through rituals like Wai Kru and Ram Muay — cultural practices passed from generation to generation.',
  },
  {
    n: '02',
    titleAr: 'الاحترام',
    titleEn: 'Respect',
    bodyAr: 'يُكنّ الرياضيون التقدير لمنافسيهم ومدربيهم وللفن القتالي ذاته، مُجسِّدين روح الاحترام المتبادل والروح الرياضية النبيلة التي تُميّز المواي تاي عن غيرها.',
    bodyEn: 'Athletes honor their opponents, coaches, and the art itself, emphasizing mutual respect and sportsmanship that defines the spirit of Muaythai.',
  },
  {
    n: '03',
    titleAr: 'التميز',
    titleEn: 'Excellence',
    bodyAr: 'السعي الدائم نحو التطوير والإتقان في التقنيات القتالية يُعدّ ركيزةً أساسية في منهج المواي تاي، حيث لا يتوقف الممارس عن التحسين والتنقية مهما بلغ مستواه.',
    bodyEn: "Continuous improvement and mastery of technique define Muaythai's pursuit of excellence — a practitioner never stops refining their craft.",
  },
  {
    n: '04',
    titleAr: 'اللعب النظيف',
    titleEn: 'Fair Play',
    bodyAr: 'الالتزام بالأنظمة والسلوك الأخلاقي الرفيع ضمانٌ لنزاهة المنافسة وعدالتها، وهو ما تُرسّخه المواي تاي في كل ممارسيها منذ أولى خطواتهم.',
    bodyEn: 'Adherence to rules and ethical conduct ensures fairness in competition — values Muaythai instills from the very first day of training.',
  },
  {
    n: '05',
    titleAr: 'الشرف',
    titleEn: 'Honor',
    bodyAr: 'تُحفّز المواي تاي روح الوحدة والانتماء الجماعي، فتُجسّد الفخر الثقافي لمجتمعات شتى حول العالم وتبني علاقات إنسانية راسخة بين الممارسين.',
    bodyEn: 'Muaythai promotes unity and cultural pride, building strong communities worldwide — connecting practitioners across all backgrounds.',
  },
];

export default function AboutPillars() {
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
            <span>{ar ? 'ركائز المواي تاي' : 'Pillars of Muaythai'}</span>
          </nav>
          <h1>{ar ? 'ركائز المواي تاي الخمس' : '5 Pillars of Muaythai'}</h1>
          <p>
            {ar
              ? 'القيم الجوهرية التي تُحدّد هوية المواي تاي وتتجاوز حدود القوة البدنية لتبلغ مرتبة المبادئ الثقافية والأخلاقية الراقية.'
              : 'The core values that define Muaythai — transcending physical strength to embody cultural and ethical principles.'}
          </p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <p className="page-intro">
            {ar
              ? 'تُمثّل الركائز الخمس للمواي تاي القيمَ المحورية التي تُشكّل جوهر هذه الرياضة وهويتها، إذ تتخطى مستوى القدرة الجسدية لتُكرّس مبادئ ثقافية وأخلاقية عريقة تربط الممارسين بتراث ضارب في أعماق التاريخ.'
              : 'The 5 Pillars of Muaythai represent the core values that define the sport, transcending physical strength to embody cultural and ethical principles that connect practitioners to a centuries-old heritage.'}
          </p>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'القيم الجوهرية' : 'Core Values'}</span>
            <h2>{ar ? 'الركائز الخمس' : 'The 5 Pillars'}</h2>
          </div>

          <div className="pillars-grid">
            {PILLARS.map((p, i) => (
              <div className="pillar-card-v2" key={p.n}>
                <div className="pillar-card-v2__top">
                  <span className="pillar-card-v2__number">{p.n}</span>
                  <div className="pillar-card-v2__icon">{ICONS[i]}</div>
                </div>
                <h3>{ar ? p.titleAr : p.titleEn}</h3>
                <p>{ar ? p.bodyAr : p.bodyEn}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--green-gradient values-cta">
        <div className="container">
          <h2>{ar ? 'استكشف المواي تاي' : 'Explore Muaythai'}</h2>
          <p className="values-cta__text">
            {ar
              ? 'انطلق في رحلة عبر تاريخ المواي تاي العريق، من جذوره في تايلاند القديمة إلى مكانته اليوم كرياضة عالمية مزدهرة، تشهد نموًا متسارعًا ونجاحات متواصلة في المملكة العربية السعودية.'
              : 'Explore the timeless art of Muaythai and its incredible journey from ancient Thailand to becoming a globally celebrated sport thriving in Saudi Arabia.'}
          </p>
          <div className="values-cta__btns">
            <Link to="/about-muaythai/disciplines" className="btn btn--gold">{ar ? 'تصفّح التخصصات' : 'Explore Disciplines'}</Link>
            <Link to="/about-muaythai/history" className="btn btn--outline btn--outline-white">{ar ? 'تاريخ المواي تاي' : 'History of Muaythai'}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
