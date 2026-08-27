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
  <svg {...svgProps}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  <svg {...svgProps}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
  <svg {...svgProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>,
  <svg {...svgProps}><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" /></svg>,
  <svg {...svgProps}><path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" /><path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" /><path d="M7 21h10" /><path d="M12 3v18" /><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" /></svg>,
];

const PILLARS = [
  {
    n: '01',
    titleAr: 'التميّز',
    titleEn: 'Excellence',
    bodyAr: 'نسعى إلى التميّز في كل ما نضطلع به؛ من تدريب الرياضيين وتأهيل المدربين، إلى تنظيم البطولات على أعلى مستوى. يعني التميّز تخطّي الحدود والارتقاء بمعايير الأداء داخل الحلبة وخارجها.',
    bodyEn: 'We strive for excellence in everything we do — from training athletes and coaches to organising world-class championships. Excellence means pushing boundaries and fostering the highest standards of performance on and off the ring.',
  },
  {
    n: '02',
    titleAr: 'الاحترام',
    titleEn: 'Respect',
    bodyAr: 'الاحترام ركيزة المواي تاي الأساسية؛ ندرّب رياضيينا على احترام منافسيهم وحكّامهم ومدربيهم والتقاليد العريقة لهذه الرياضة. إذ يُدرك الأبطال الحقيقيون أن الاحترام يبني مجتمعات متماسكة ويعزز قيم الروح الرياضية.',
    bodyEn: 'Respect is the cornerstone of Muaythai. We teach our athletes to show respect to their opponents, referees, coaches, and traditions. True champions understand that respect builds stronger communities and promotes sportsmanship.',
  },
  {
    n: '03',
    titleAr: 'الشرف',
    titleEn: 'Honour',
    bodyAr: 'تُجسّد المواي تاي مفهوم الشرف المتجذّر في التواضع والفخر معاً؛ نُكرم ثقافتنا وتقاليدنا والتضحيات التي قدّمها من سبقونا. وكلّ منافسة هي فرصة للتمسك بقيم العدالة والكرامة.',
    bodyEn: 'Muaythai embodies a sense of honour rooted in humility and pride. We honour our culture, traditions, and the sacrifices of those who paved the way. Every competition is an opportunity to uphold the values of fairness and dignity.',
  },
  {
    n: '04',
    titleAr: 'التقاليد',
    titleEn: 'Tradition',
    bodyAr: 'تُذكّرنا التقاليد بالإرث الثقافي الثري لرياضة المواي تاي؛ فمن الوي كرو إلى الممارسات الطقوسية، نصون هذه الأعراف التي منحت المواي تاي خصوصيتها وعمقها.',
    bodyEn: 'Tradition reminds us of the rich cultural heritage of Muaythai. From the Wai Kru to ceremonial practices, we preserve the customs that make Muaythai unique and meaningful.',
  },
  {
    n: '05',
    titleAr: 'اللعب النظيف',
    titleEn: 'Fair Play',
    bodyAr: 'يعني اللعب النظيف المنافسةَ بصدق ونزاهة واحترامٍ تام للقواعد والأنظمة. نؤمن بتهيئة بيئة تسود فيها العدالة والإنصاف في كل قرار ومنافسة.',
    bodyEn: 'Fair play means competing with honesty, integrity, and respect for the rules. We believe in fostering an environment where fairness and justice are at the core of every competition and decision.',
  },
];

export default function Values() {
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
            <span>{ar ? 'القيم' : 'Values'}</span>
          </nav>
          <h1>{ar ? 'الركائز الخمس للمواي تاي' : 'The 5 Pillars of Muaythai'}</h1>
          <p>
            {ar
              ? 'الركائز الخمس هي القيم الجوهرية التي تُعرّف روح المواي تاي وترسم فلسفتها الحضارية العميقة.'
              : 'The 5 Pillars are the core values that define the spirit of Muaythai and shape the philosophy of the sport.'}
          </p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <p className="values-intro">
            {ar
              ? 'تمثّل هذه الركائز الروح الجوهرية التي تنبثق منها رياضة المواي تاي، وتُشكّل الأساس المتين لبناء رياضيين يتمتعون بالشخصية القويمة والشرف والانضباط الرفيع. كلّ ركيزة من هذه الركائز تعكس جوهر رسالة الاتحاد في إرساء مجتمع مزدهر للمواي تاي في المملكة العربية السعودية وما وراءها.'
              : 'These pillars represent the spirit from which Muaythai emerges, forming the foundation for building athletes of character, honour, and discipline. Each pillar reflects the essence of our mission in developing a thriving Muaythai community in Saudi Arabia and beyond.'}
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

      <section className="section--white">
        <div className="container values-ifma">
          <span className="section-label section-label--green">{ar ? 'المرجعية الدولية' : 'International Reference'}</span>
          <p className="values-ifma__text">
            {ar
              ? 'تستند الركائز الخمس للمواي تاي إلى الإطار القيمي الذي أرسته IFMA — الاتحاد الدولي لجمعيات المواي تاي — باعتباره المرجعية الدولية العليا لهذه الرياضة.'
              : 'The 5 Pillars of Muaythai are drawn from the value framework established by IFMA — the International Federation of Muaythai Associations — as the supreme international authority for the sport.'}
          </p>
          <a
            className="btn btn--green btn--icon"
            href="https://muaythai.sport/organisation/values/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            {ar ? 'IFMA — قيم المواي تاي' : 'IFMA — Muaythai Values'}
          </a>
        </div>
      </section>

      <section className="section--green-gradient values-cta">
        <div className="container">
          <p className="values-cta__text">
            {ar
              ? 'انضم إلينا في الحفاظ على هذه القيم الجوهرية والاحتفاء بروح المواي تاي في أرجاء المملكة العربية السعودية كافة.'
              : 'Join us in upholding these core values as we continue to grow and celebrate the spirit of Muaythai across Saudi Arabia.'}
          </p>
          <div className="values-cta__btns">
            <Link to="/organization/history" className="btn btn--gold">{ar ? 'تاريخ الاتحاد' : 'SMF History'}</Link>
            <Link to="/organization/initiatives" className="btn btn--outline btn--outline-white">{ar ? 'المبادرات' : 'Initiatives'}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
