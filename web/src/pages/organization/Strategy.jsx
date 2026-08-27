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

const PILLAR_ICONS = [
  <svg {...svgProps}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
  <svg {...svgProps}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  <svg {...svgProps}><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>,
  <svg {...svgProps}><path d="M6 9H4.5a2.5 2.5 0 010-5H6" /><path d="M18 9h1.5a2.5 2.5 0 000-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0012 0V2z" /></svg>,
];

function RoadmapDot() {
  return (
    <div className="roadmap-v2-item__dot" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <circle cx="12" cy="12" r="6" />
      </svg>
    </div>
  );
}

const KPIS = [
  { value: '4', labelAr: 'محاور استراتيجية', labelEn: 'Strategic Pillars' },
  { value: '8', labelAr: 'مراحل تنفيذية', labelEn: 'Roadmap Phases' },
  { value: '2030', labelAr: 'أفق رؤية المملكة', labelEn: 'Vision Horizon' },
  { value: '1,300+', labelAr: 'رياضي مسجّل', labelEn: 'Registered Athletes' },
];

const PILLARS = [
  {
    n: '01',
    titleAr: 'تعزيز المشاركة الشعبية',
    titleEn: 'Ignite Participation',
    textAr: 'تعزيز ودعم المشاركة والنجاح في الرياضة، مع تركيز خاص على الشباب والمرأة في جميع مناطق المملكة.',
    textEn: 'Promote and support increased participation and success in the sport, with a focus on youth and women.',
  },
  {
    n: '02',
    titleAr: 'تطوير الأداء الرياضي',
    titleEn: 'Unlock Athlete Performance',
    textAr: 'الارتقاء بأداء الرياضيين السعوديين عبر أنظمة اكتشاف الموهبة الشفافة وبرامج التطوير الرياضي المتقدمة.',
    textEn: 'Elevate Saudi performance through transparent scouting systems and advanced athlete development programs.',
  },
  {
    n: '03',
    titleAr: 'رفع معايير التدريب والتحكيم',
    titleEn: 'Elevate Coaching & Officials Standards',
    textAr: 'دعم التطوير المهني للمدربين والحكام المحليين للارتقاء بمستوى الأداء ورفع جودة البطولات.',
    textEn: 'Support the development of local coaches and officials to elevate player performance and raise league standards.',
  },
  {
    n: '04',
    titleAr: 'تطوير مسار المنافسات',
    titleEn: 'Optimize Competition Pathway',
    textAr: 'بناء دوري وطني احترافي ومستدام تجارياً مع تعزيز المشاركة الدولية وزيادة التعرض العالمي للاعبين السعوديين.',
    textEn: 'Build a professional, commercially sustainable national league while increasing international participation and exposure for Saudi players.',
  },
];

/* Roadmap grouped by development phase, matching the published layout. */
const ROADMAP = [
  {
    badgeAr: 'التطوير الشعبي',
    badgeEn: 'Grassroots Development',
    cols: 2,
    items: [
      {
        q: '1.1',
        nameAr: 'إطلاق حملات التفعيل',
        nameEn: 'Launch Activation Campaigns',
        textAr: 'تنظيم حملات موجّهة لتعزيز المشاركة ورفع الوعي بالرياضة وتطوير المهارات عبر مختلف الفئات العمرية والجنسين.',
        textEn: 'Organize targeted campaigns to promote participation, increase awareness and develop skills across age groups and genders.',
      },
      {
        q: '2.1',
        nameAr: 'إدراج الرياضة في المدارس',
        nameEn: 'Introduce the Sport within Schools',
        textAr: 'تقديم المواي تاي في المدارس ضمن المنهج الدراسي أو كنشاط بعد الدراسة لتعزيز اللياقة البدنية وتطوير المهارات واستقطاب المواهب الشابة.',
        textEn: 'Introduce the sport in schools, as part of the curriculum or as an after-school activity, to promote physical fitness, skill development, and interest among students.',
      },
    ],
  },
  {
    badgeAr: 'تطوير المواهب',
    badgeEn: 'Talent Development',
    cols: 2,
    items: [
      {
        q: '3.1',
        nameAr: 'البرنامج الوطني لاكتشاف المواهب',
        nameEn: 'Develop a National Scouting Program',
        textAr: 'بناء برنامج وطني لاكتشاف المواهب الواعدة ورعايتها في جميع أنحاء المملكة، وتأسيس قاعدة رياضيين مستقبليين.',
        textEn: 'Establish a national scouting program to identify and nurture promising talent across the country and build a pipeline for future athletes.',
      },
      {
        q: '4.1',
        nameAr: 'انتقاء شفاف للفرق الوطنية',
        nameEn: 'Transparent National Team Selection',
        textAr: 'تصميم منظومة انتقاء هيكلية وشفافة للفرق الوطنية تضمن تقييماً موضوعياً وعادلاً لجميع الرياضيين.',
        textEn: 'Develop a structured and transparent selection process for the national team to ensure fair and objective evaluation of athletes.',
      },
    ],
  },
  {
    badgeAr: 'الأداء العالي',
    badgeEn: 'High Performance',
    cols: 3,
    items: [
      {
        q: '5.1',
        nameAr: 'المسار الوطني لتطوير المدربين',
        nameEn: 'National Coaching Pathway',
        textAr: 'إنشاء مسار وطني للتدريب متوافق مع الاتحاد الدولي، يشمل التدريب الهيكلي والاعتماد والتطوير المهني المستمر.',
        textEn: 'Establish a national coaching pathway aligned with the international federation, with structured training, certification, and ongoing development.',
      },
      {
        q: '5.2',
        nameAr: 'المسار الوطني لتطوير الحكام',
        nameEn: "National Officials' Pathway",
        textAr: 'إنشاء مسار وطني للحكام يتضمن التدريب والاعتماد والتطوير المستمر لرفع مستوى التحكيم وضمان توفر الكوادر اللازمة.',
        textEn: "Establish a national officials' pathway with structured training, certification, and ongoing development to enhance refereeing standards and availability.",
      },
      {
        q: '6.1',
        nameAr: 'إعادة تصميم هيكل المنافسات',
        nameEn: 'Redesign Competition Structure',
        textAr: 'إعادة تصميم هيكل وتقويم المنافسات المحلية السنوية لإيجاد جدول زمني أكثر تنظيماً وإتاحةً واستراتيجيةً في التوقيت.',
        textEn: 'Redesign the structure and calendar of yearly domestic sports competitions to create a more organized, accessible, and strategically timed schedule.',
      },
    ],
  },
  {
    badgeAr: 'الحوكمة — دعم تمكيني',
    badgeEn: 'Governance Enabler',
    cols: 2,
    items: [
      {
        q: '7.1',
        nameAr: 'تعزيز إطار ترخيص الأندية والحوكمة',
        nameEn: 'Strengthen Club Licensing & Governance',
        textAr: 'تعزيز حوكمة الأندية من خلال معايير الترخيص والامتثال وأطر التشغيل المستدامة.',
        textEn: 'Enhance club governance through licensing, compliance standards, and sustainable operating frameworks.',
      },
    ],
  },
];

export default function Strategy() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  return (
    <>
      <section className="strategy-dashboard">
        <div className="container">
          <div className="strategy-dashboard__inner">
            <div>
              <span className="strategy-dashboard__tag">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                {ar ? 'رؤية 2030 — الاستراتيجية الرياضية' : 'Vision 2030 — Sports Strategy'}
              </span>
              <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
                <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
                <span className="breadcrumb__sep" aria-hidden="true">›</span>
                <Link to="/organization/overview">{ar ? 'الاتحاد' : 'The Organization'}</Link>
                <span className="breadcrumb__sep" aria-hidden="true">›</span>
                <span>{ar ? 'الاستراتيجية' : 'Strategy'}</span>
              </nav>
              <h1 className="strategy-dashboard__title">
                {ar ? 'رؤيتنا الاستراتيجية: بناء مستقبل المواي تاي' : 'Our Strategic Vision: Building the Future of Muaythai'}
              </h1>
              <p className="strategy-dashboard__sub">
                {ar
                  ? 'يلتزم الاتحاد السعودي للملاكمة التايلندية برؤية استراتيجية جريئة وطموحة تنسجم مع أهداف رؤية المملكة 2030 ومتطلبات اللجنة الأولمبية والبارالمبية السعودية.'
                  : "The Saudi Muaythai Federation is committed to a bold strategy aligned with Vision 2030 and the Saudi Olympic & Paralympic Committee's objectives."}
              </p>
            </div>

            <div className="strategy-kpis">
              {KPIS.map((k) => (
                <div className="strategy-kpi" key={k.labelEn}>
                  <div className="strategy-kpi__value">{k.value}</div>
                  <div className="strategy-kpi__label">{ar ? k.labelAr : k.labelEn}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'الاستراتيجية' : 'Strategy'}</span>
            <h2>{ar ? 'المحاور الاستراتيجية الأربعة' : '4 Strategic Pillars'}</h2>
            <p>
              {ar
                ? 'تقوم استراتيجية الاتحاد على تعزيز المواهب المحلية وتطوير الأداء التنافسي ورفع مستوى حضور المواي تاي على الساحة الدولية.'
                : "Our strategy focuses on fostering talent, promoting excellence, and enhancing Muaythai's presence on the global stage."}
            </p>
          </div>

          <div className="pillars-v2">
            {PILLARS.map((p, i) => (
              <div className="pillar-v2" key={p.n}>
                <span className="pillar-v2__num">{p.n}</span>
                <div className="pillar-v2__content">
                  <div className="pillar-v2__icon">{PILLAR_ICONS[i]}</div>
                  <h3 className="pillar-v2__title">{ar ? p.titleAr : p.titleEn}</h3>
                  <p className="pillar-v2__text">{ar ? p.textAr : p.textEn}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'خطة التطوير' : 'Development Plan'}</span>
            <h2>{ar ? 'خارطة الطريق الاستراتيجية' : 'Strategic Development Roadmap'}</h2>
            <p>
              {ar
                ? 'مسار هيكلي متكامل يمتد عبر ثلاثة محاور تنموية: من التطوير الشعبي القاعدي، إلى تطوير المواهب، وصولاً إلى الأداء العالي على المستوى الدولي.'
                : 'A structured pathway across three development pillars — from grassroots community growth, through talent nurturing, to world-class high performance.'}
            </p>
          </div>

          {ROADMAP.map((group, gi) => (
            <div key={group.badgeEn}>
              <div className={`roadmap-year-sep${gi === 0 ? ' roadmap-year-sep--first' : ''}`}>
                <span className="roadmap-year-sep__badge">{ar ? group.badgeAr : group.badgeEn}</span>
              </div>
              <div className={`roadmap-v2 roadmap-v2--cols-${group.cols}`}>
                {group.items.map((item) => (
                  <div className="roadmap-v2-item" key={item.q}>
                    <RoadmapDot />
                    <div className="roadmap-v2-item__quarter">{item.q}</div>
                    <p className="roadmap-v2-item__name">{ar ? item.nameAr : item.nameEn}</p>
                    <p className="roadmap-v2-item__text">{ar ? item.textAr : item.textEn}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section--green-gradient strategy-cta">
        <div className="container">
          <h2>{ar ? 'انضم إلى مسيرة النجاح' : 'Join Our Journey'}</h2>
          <p>
            {ar
              ? 'انضم إلينا في هذه الرحلة الطموحة ونحن نواصل رسم مستقبل المواي تاي في المملكة العربية السعودية وما وراءها.'
              : 'Join us on this journey as we continue to shape the future of Muaythai in Saudi Arabia and beyond.'}
          </p>
          <Link to="/organization/initiatives" className="btn btn--gold">{ar ? 'المبادرات' : 'Initiatives'}</Link>
        </div>
      </section>
    </>
  );
}
