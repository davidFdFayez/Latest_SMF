import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

const ico = {
  width: '22',
  height: '22',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.8',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const IconEye = () => <svg {...ico}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
const IconShield = () => <svg {...ico}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
const IconUsers = () => <svg {...ico}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>;
const IconGlobe = () => <svg {...ico}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>;
const IconHome = () => <svg {...ico}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
const IconClock = () => <svg {...ico}><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconHeart = () => <svg {...ico}><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>;
const IconChart = () => <svg {...ico}><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
const IconMedal = () => <svg {...ico}><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" /></svg>;
const IconBoard = () => <svg {...ico}><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;

const STATS = [
  { value: '2019', labelAr: 'عام التأسيس', labelEn: 'Year Founded' },
  { value: '72', labelAr: 'ميدالية دولية', labelEn: 'International Medals' },
  { value: '13', labelAr: 'منطقة نشطة', labelEn: 'Active Regions' },
  { value: '2020', labelAr: 'عضو في IFMA منذ', labelEn: 'IFMA Member Since' },
];

const PILLARS = [
  {
    icon: <IconShield />,
    mod: '',
    titleAr: 'الحوكمة',
    titleEn: 'Governance',
    bodyAr: 'يعمل الاتحاد وفق أنظمة وزارة الرياضة ومعايير IFMA الدولية في جميع قراراته وأنشطته.',
    bodyEn: 'SMF operates under Ministry of Sport regulations and IFMA international standards in all decisions and activities.',
  },
  {
    icon: <IconUsers />,
    mod: '',
    titleAr: 'التطوير الرياضي',
    titleEn: 'Sport Development',
    bodyAr: 'برامج تطوير متخصصة للرياضيين والمدربين والحكام عبر مسارات واضحة ومعتمدة دولياً.',
    bodyEn: 'Specialised development programmes for athletes, coaches and referees through internationally accredited pathways.',
  },
  {
    icon: <IconGlobe />,
    mod: ' gov-pillar-card--gold',
    titleAr: 'التمثيل الدولي',
    titleEn: 'International Representation',
    bodyAr: 'تمثيل المملكة في بطولات IFMA العالمية والآسيوية والدولية بمنتخبات مؤهلة ومجهزة.',
    bodyEn: 'Representing the Kingdom in IFMA World, Asian and international championships with qualified and prepared teams.',
  },
  {
    icon: <IconHome />,
    mod: ' gov-pillar-card--charcoal',
    titleAr: 'الانتشار المجتمعي',
    titleEn: 'Community Outreach',
    bodyAr: 'فعاليات ومبادرات مجتمعية تنشر ثقافة المواي تاي وتوسّع قاعدة الممارسين في مختلف مناطق المملكة.',
    bodyEn: 'Community events and initiatives that spread Muaythai culture and expand the practitioner base across the Kingdom.',
  },
];

const HUBS = [
  {
    to: '/organization/history',
    icon: <IconClock />,
    catAr: 'التاريخ', catEn: 'History',
    titleAr: 'تاريخ الاتحاد', titleEn: 'Federation History',
    descAr: 'المحطات والإنجازات الكبرى منذ تأسيس الاتحاد عام 2019 حتى اليوم.',
    descEn: 'Key milestones and achievements since the Federation was established in 2019.',
  },
  {
    to: '/organization/values',
    icon: <IconHeart />,
    catAr: 'القيم', catEn: 'Values',
    titleAr: 'القيم والمبادئ', titleEn: 'Values & Principles',
    descAr: 'المبادئ التي تحكم عمل الاتحاد وتوجّه كل قراراته وأنشطته.',
    descEn: 'The principles that govern the Federation and guide every decision and activity.',
  },
  {
    to: '/organization/strategy',
    icon: <IconChart />,
    catAr: 'الاستراتيجية', catEn: 'Strategy',
    titleAr: 'الخطة الاستراتيجية', titleEn: 'Strategic Plan',
    descAr: 'خارطة الطريق 2026 وأولويات التطوير الرياضي والمؤسسي.',
    descEn: '2026 roadmap and priorities for sport and institutional development.',
  },
  {
    to: '/organization/achievements',
    icon: <IconMedal />,
    catAr: 'الإنجازات', catEn: 'Achievements',
    titleAr: 'الإنجازات والألقاب', titleEn: 'Achievements & Titles',
    descAr: 'الميداليات الدولية والألقاب العالمية للمنتخبات السعودية.',
    descEn: 'International medals and world titles earned by Saudi national teams.',
  },
  {
    to: '/governance/hq',
    icon: <IconBoard />,
    catAr: 'القيادة', catEn: 'Leadership',
    titleAr: 'مجلس الإدارة', titleEn: 'Board of Directors',
    descAr: 'الرئيس وأعضاء مجلس الإدارة والهيكل التنفيذي.',
    descEn: 'The President, board members and executive structure.',
  },
  {
    to: '/governance/hq',
    icon: <IconHome />,
    catAr: 'المقر', catEn: 'Headquarters',
    titleAr: 'المقر الرئيسي والجهاز الإداري', titleEn: 'HQ & Administrative Staff',
    descAr: 'الجهاز الإداري والتنفيذي والأقسام المتخصصة في مقر الاتحاد.',
    descEn: 'The administrative and executive apparatus and specialised departments at Federation HQ.',
  },
];

export default function Overview() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  return (
    <>
      <section className="page-hero">
        <div className="page-hero__bg" role="img" aria-label={ar ? 'الاتحاد السعودي للملاكمة التايلندية' : 'Saudi Muaythai Federation'} />
        <div className="page-hero__overlay" aria-hidden="true" />
        <div className="page-hero__accent" aria-hidden="true" />

        <div className="container page-hero__inner">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/organization/overview">{ar ? 'الاتحاد' : 'The Organization'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'نظرة عامة' : 'Overview'}</span>
          </nav>

          <div className="page-hero__content">
            <span className="section-label section-label--amber">
              {ar ? 'الاتحاد السعودي للملاكمة التايلندية' : 'Saudi Muaythai Federation'}
            </span>
            <h1 className="page-hero__title">{ar ? 'نظرة عامة على الاتحاد' : 'About the Federation'}</h1>
            <p className="page-hero__sub">
              {ar
                ? 'الجهة الرياضية الوطنية المعنية بتنظيم رياضة المواي تاي، والإشراف على تطويرها ونشرها والارتقاء بها في المملكة العربية السعودية.'
                : 'The national sports authority responsible for organising Muaythai and overseeing its development in the Kingdom of Saudi Arabia'}
            </p>

            <div className="hero-stats">
              {STATS.map((s, i) => (
                <div key={s.labelEn} style={{ display: 'contents' }}>
                  {i > 0 && <div className="hero-stat__div" aria-hidden="true" />}
                  <div className="hero-stat">
                    <div className="hero-stat__val">{s.value}</div>
                    <div className="hero-stat__lbl">{ar ? s.labelAr : s.labelEn}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="recognition-bar">
        <div className="container">
          <div className="recognition-bar__inner">
            <span className="recognition-bar__label">{ar ? 'تحت إشراف' : 'Under supervision of'}</span>
            <img src="/assets/images/partner-mos.png" alt={ar ? 'وزارة الرياضة' : 'Ministry of Sport'} loading="lazy" className="recognition-bar__logo" />
            <img src="/assets/images/partner-sopc.jpg" alt={ar ? 'اللجنة الأولمبية والبارالمبية السعودية' : 'Saudi Olympic & Paralympic Committee'} loading="lazy" className="recognition-bar__logo" />
            <img src="/assets/images/partner-ifma.webp" alt={ar ? 'الاتحاد الدولي لجمعيات المواي تاي' : 'International Federation of Muaythai Associations'} loading="lazy" className="recognition-bar__logo" />
          </div>
        </div>
      </div>

      <section className="section--white">
        <div className="container container--narrow">
          <p className="overview-intro">
            {ar
              ? 'تأسّس الاتحاد السعودي للملاكمة التايلندية عام 2019 تحت مظلة اللجنة الأولمبية والبارالمبية السعودية ووزارة الرياضة، ليكون الجهة الحاكمة الرسمية لرياضة المواي تاي في المملكة العربية السعودية. يعمل الاتحاد على بناء منظومة رياضية متكاملة تُعدّ الأبطال وتُعزز الانتماء وتُحقق التمثيل الدولي على أعلى المستويات، مع الالتزام الكامل بمعايير الحوكمة الرياضية المحلية والدولية.'
              : 'Established in 2019 under the Saudi Olympic & Paralympic Committee (SOPC) and the Ministry of Sport, the Saudi Muaythai Federation (SMF) is the official governing body for Muaythai in the Kingdom of Saudi Arabia. SMF builds a comprehensive sporting ecosystem that develops champions, fosters belonging, and achieves the highest international representation, while maintaining full compliance with national and international sports governance standards.'}
          </p>
        </div>
      </section>

      <section className="vm-section">
        <div className="container">
          <div className="s-header s-header--center">
            <div className="s-label">{ar ? 'هويتنا' : 'Our Identity'}</div>
            <h2 className="s-heading">{ar ? 'الرؤية والرسالة' : 'Vision & Mission'}</h2>
          </div>
          <div className="vm-grid">
            <div className="vm-card">
              <div className="vm-card__icon"><IconEye /></div>
              <div>
                <div className="s-label">{ar ? 'الرؤية' : 'Vision'}</div>
                <p className="vm-card__body">
                  {ar
                    ? 'أن تكون رياضة المواي تاي في المملكة نموذجاً رياضياً رائداً محلياً وعالمياً.'
                    : 'For Muaythai in the Kingdom to be a leading sporting model, both locally and globally.'}
                </p>
              </div>
            </div>
            <div className="vm-card vm-card--gold">
              <div className="vm-card__icon"><IconShield /></div>
              <div>
                <div className="s-label s-label--gold">{ar ? 'الرسالة' : 'Mission'}</div>
                <p className="vm-card__body">
                  {ar
                    ? 'تمكين ممارسي رياضة المواي تاي، وتطوير بيئة تنافسية مستدامة تدعم النجاحات الرياضية الوطنية والعالمية.'
                    : 'Empowering Muaythai practitioners and developing a sustainable competitive environment that supports national and international sporting success.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="gov-pillars">
        <div className="container">
          <div className="s-header s-header--center">
            <div className="s-label">{ar ? 'هيكل الاتحاد' : 'Federation Structure'}</div>
            <h2 className="s-heading">{ar ? 'الإطار الحاكم' : 'Governance Framework'}</h2>
          </div>
          <div className="gov-pillars__grid">
            {PILLARS.map((p) => (
              <div key={p.titleEn} className={`gov-pillar-card${p.mod}`}>
                <div className="gov-pillar-card__icon">{p.icon}</div>
                <h3 className="gov-pillar-card__title">{ar ? p.titleAr : p.titleEn}</h3>
                <p className="gov-pillar-card__body">{ar ? p.bodyAr : p.bodyEn}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="fed-hub">
        <div className="container">
          <div className="s-header s-header--center">
            <div className="s-label">{ar ? 'استكشف الاتحاد' : 'Explore the Federation'}</div>
            <h2 className="s-heading">{ar ? 'أقسام الاتحاد' : 'Federation Sections'}</h2>
            <p className="s-sub">
              {ar ? 'تعرف على تاريخنا وقيمنا واستراتيجيتنا وفريق القيادة' : 'Learn about our history, values, strategy and leadership'}
            </p>
          </div>
          <div className="fed-hub__grid">
            {HUBS.map((h) => (
              <Link key={h.titleEn} to={h.to} className="fed-nav-card">
                <div className="fed-nav-card__icon">{h.icon}</div>
                <div className="fed-nav-card__cat">{ar ? h.catAr : h.catEn}</div>
                <div className="fed-nav-card__title">{ar ? h.titleAr : h.titleEn}</div>
                <p className="fed-nav-card__desc">{ar ? h.descAr : h.descEn}</p>
                <div className="fed-nav-card__arrow">{ar ? '← اقرأ المزيد' : 'Learn more →'}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
