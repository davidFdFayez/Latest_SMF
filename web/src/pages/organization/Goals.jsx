import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

/* Inline icons matching the live goal cards. */
function IconShield() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconClockSm() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconCheckSm() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconChevronSm() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/**
 * The federation's officially approved goals, verbatim from the final content
 * requirements (§2). These are the charter-level goals; the seven entries in
 * GOALS below are the strategic roadmap that delivers them.
 */
const OFFICIAL_GOALS = [
  { ar: 'نشر رياضة المواي تاي في مختلف مناطق المملكة.', en: 'Spread Muaythai across the various regions of the Kingdom.' },
  { ar: 'إعداد أجيال من الأبطال في المواي تاي على المستوى المحلي والعالمي.', en: 'Develop generations of Muaythai champions at local and international level.' },
  { ar: 'بناء شراكات استراتيجية مع القطاعين العام والخاص.', en: 'Build strategic partnerships with the public and private sectors.' },
  { ar: 'تنظيم بطولات محلية ودولية وفق أعلى المعايير.', en: 'Organise local and international championships to the highest standards.' },
  { ar: 'تأهيل الكوادر الفنية والإدارية الوطنية.', en: 'Qualify national technical and administrative cadres.' },
];

/* The 7 strategic goals, mirroring the published Goals page in both languages. */
const GOALS = [
  {
    num: '01',
    pillarAr: 'التميّز · اللعب النظيف',
    pillarEn: 'Excellence · Fair Play',
    initAr: 'المبادرتان 1 + 2',
    initEn: 'Initiatives 1 + 2',
    titleAr: 'تنمية القاعدة الشعبية وتعزيز المشاركة الجماهيرية',
    titleEn: 'Grassroots Development & Mass Participation',
    summaryAr: 'تعزيز حضور المواي تاي في جميع مناطق المملكة العربية السعودية.',
    summaryEn: "Strengthen Muaythai's presence across all regions of the Kingdom.",
    itemsAr: [
      'إطلاق حملات توعية وطنية بالمواي تاي في المدارس والمجتمعات المحلية.',
      'تطوير برامج تدريبية منظّمة للشباب والمبتدئين.',
      'توسيع شبكة الأندية والصالات الرياضية وتعزيز الشراكات مع القطاع الخاص.',
    ],
    itemsEn: [
      'Launch Muaythai awareness campaigns in schools and communities.',
      'Develop structured training programs for youth and beginners.',
      'Expand Muaythai clubs and establish partnerships with private gyms.',
    ],
    keyAr: 'الحملة الوطنية للتوعية وإدراج المواي تاي في المناهج المدرسية.',
    keyEn: 'National Awareness Campaign and School Integration Program.',
  },
  {
    num: '02',
    pillarAr: 'التميّز · التقاليد',
    pillarEn: 'Excellence · Tradition',
    initAr: 'المبادرتان 3 + 4',
    initEn: 'Initiatives 3 + 4',
    titleAr: 'اكتشاف المواهب وتطويرها',
    titleEn: 'Talent Development',
    summaryAr: 'رصد المواهب المحلية وصقلها وإيصالها إلى المستويات الوطنية والدولية.',
    summaryEn: 'Identify, nurture, and elevate local talent to national and international stages.',
    itemsAr: [
      'تنظيم فعاليات وطنية وإقليمية لاكتشاف المواهب.',
      'تطبيق نظام رقمي لمتابعة الرياضيين وتتبع تطورهم.',
      'إطلاق برنامج إرشادي للرياضيين الناشئين.',
    ],
    itemsEn: [
      'Host regional and national talent scouting events.',
      'Implement a national athlete monitoring and tracking system.',
      'Launch a mentorship program for emerging athletes.',
    ],
    keyAr: 'البرنامج الوطني لاكتشاف المواهب والإرشاد الرياضي.',
    keyEn: 'National Talent Identification and Mentorship Program.',
  },
  {
    num: '03',
    pillarAr: 'الاحترام · اللعب النظيف',
    pillarEn: 'Respect · Fair Play',
    initAr: 'المبادرة 1',
    initEn: 'Initiative 1',
    titleAr: 'تمكين المرأة وتوسيع مشاركتها',
    titleEn: "Women's Inclusion & Expansion",
    summaryAr: 'توسيع فرص مشاركة المرأة في الملاكمة التايلندية على جميع المستويات.',
    summaryEn: 'Increase opportunities for women to engage in Muaythai at all levels.',
    itemsAr: [
      'إنشاء جلسات تدريبية ودورات نسائية متخصصة.',
      'توسيع مشاركة المرأة في المنافسات وأدوار القيادة الرياضية.',
      'ضمان التمثيل المتكافئ في أكاديميات المواي تاي الوطنية.',
    ],
    itemsEn: [
      'Establish women-only training sessions and workshops.',
      "Expand women's participation in competitions and leadership roles.",
      'Ensure equal representation in national Muaythai academies.',
    ],
    keyAr: 'برنامج تمكين المرأة وبطولة المواي تاي النسائية.',
    keyEn: "Women's Muaythai Program and Championship Series.",
  },
  {
    num: '04',
    pillarAr: 'التميّز · الشرف',
    pillarEn: 'Excellence · Honour',
    initAr: 'المبادرتان 4 + 7',
    initEn: 'Initiatives 4 + 7',
    titleAr: 'التميّز التنافسي',
    titleEn: 'Competitive Excellence',
    summaryAr: 'تعزيز مكانة المملكة العربية السعودية بوصفها قوة مؤثرة في المنافسات الدولية للملاكمة التايلندية.',
    summaryEn: 'Position Saudi Arabia as a top contender in international Muaythai competitions.',
    itemsAr: [
      'تطوير البيئة التدريبية بمرافق ومدربين على أعلى مستوى عالمي.',
      'توفير حوافز مادية وتمويل مستهدف لرياضيي النخبة.',
      'تعزيز التعاون مع المنظمات الدولية لزيادة التعرض للمنافسات العالمية.',
    ],
    itemsEn: [
      'Enhance the training environment with world-class facilities and coaches.',
      'Provide performance-based incentives and funding for elite athletes.',
      'Strengthen collaboration with international Muaythai organizations for global exposure.',
    ],
    keyAr: 'المشاركة في بطولات IFMA والمعسكرات التدريبية المتخصصة.',
    keyEn: 'Participation in IFMA Championships and Elite Training Camps.',
  },
  {
    num: '05',
    pillarAr: 'التميّز',
    pillarEn: 'Excellence',
    initAr: 'التمكين الحوكمي',
    initEn: 'Governance Enabler',
    titleAr: 'التحول الرقمي والابتكار',
    titleEn: 'Digital Transformation & Innovation',
    summaryAr: 'تحديث منظومة العمل الاتحادي وتعزيز التجربة الرقمية للرياضيين والأعضاء.',
    summaryEn: 'Modernize operations and enhance the digital experience for athletes and members.',
    itemsAr: [
      'تطبيق منصة رقمية متكاملة للتسجيل ورصد الأداء الرياضي.',
      'إطلاق تطبيق رسمي للاتحاد يتيح المتابعة الحية ومعلومات الفعاليات.',
      'دمج تتبع تطور الرياضيين مع أدوات التحليل الأداء.',
    ],
    itemsEn: [
      'Implement a digital registration and performance tracking platform.',
      'Launch a mobile app for real-time event updates and community engagement.',
      'Integrate athlete progress tracking with performance analytics.',
    ],
    keyAr: 'نظام الإدارة الرقمية للرياضيين.',
    keyEn: 'Digital Athlete Management System.',
  },
  {
    num: '06',
    pillarAr: 'الاحترام · التقاليد',
    pillarEn: 'Respect · Tradition',
    initAr: 'المبادرتان 1 + 2',
    initEn: 'Initiatives 1 + 2',
    titleAr: 'الانخراط المجتمعي وبناء الشراكات',
    titleEn: 'Community Engagement & Partnerships',
    summaryAr: 'تعزيز روح الانتماء الجماعي من خلال إشراك القطاعين العام والخاص.',
    summaryEn: 'Foster a strong community spirit by involving public and private sectors.',
    itemsAr: [
      'تنظيم فعاليات وطنية ومسابقات لياقة بدنية وتجمعات مجتمعية.',
      'إبرام شراكات استراتيجية مع المدارس والمنظمات الرياضية والمبادرات الحكومية.',
      'تشجيع ثقافة التطوع وإرساء شبكة من الرعاة والممولين.',
    ],
    itemsEn: [
      'Organize national events, fitness challenges, and community gatherings.',
      'Partner with schools, sports organizations, and government initiatives.',
      'Encourage volunteerism and establish sponsorship networks.',
    ],
    keyAr: 'فريق تطوير الرعاية والشراكات الاستراتيجية.',
    keyEn: 'Sponsorship and Partnership Development Team.',
  },
  {
    num: '07',
    pillarAr: 'اللعب النظيف · الشرف',
    pillarEn: 'Fair Play · Honour',
    initAr: 'التمكين الحوكمي',
    initEn: 'Governance Enabler',
    titleAr: 'الصحة والسلامة والامتثال',
    titleEn: 'Health, Safety & Compliance',
    summaryAr: 'ضمان صحة الرياضيين وسلامتهم من خلال الالتزام بالمعايير الدولية.',
    summaryEn: 'Ensure the health and well-being of athletes through compliance with global standards.',
    itemsAr: [
      'تطبيق برامج مكافحة المنشطات وأنظمة رصد الصحة الرياضية.',
      'توفير خدمات علم النفس الرياضي والعلاج الطبيعي والتغذية للرياضيين.',
      'التوافق مع بروتوكولات الصحة والسلامة الدولية المعتمدة.',
    ],
    itemsEn: [
      'Implement anti-doping programs and health monitoring systems.',
      'Provide athlete access to sports psychologists, physiotherapists, and nutrition experts.',
      'Align with international health and safety protocols.',
    ],
    keyAr: 'برنامج تعزيز الحوكمة والامتثال المؤسسي.',
    keyEn: 'Governance and Compliance Enhancement Program.',
  },
];

export default function Goals() {
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
            <span>{ar ? 'الأهداف' : 'Our Goals'}</span>
          </nav>
          <h1>{ar ? 'أهدافنا الاستراتيجية' : 'Our Strategic Goals'}</h1>
          <p>
            {ar
              ? 'يسعى الاتحاد السعودي للملاكمة التايلندية إلى بناء منظومة رياضية عالمية المستوى، تنسجم مع رؤية المملكة 2030 وأهداف اللجنة الأولمبية والبارالمبية السعودية.'
              : "SMF is dedicated to building a world-class Muaythai ecosystem, aligned with Vision 2030 and the Saudi Olympic & Paralympic Committee's objectives."}
          </p>
        </div>
      </section>

      {/* Framework bridge: Pillars → Initiatives → Goals */}
      <section className="section--white">
        <div className="container">
          <div className="goals-framework">
            <div className="goals-framework__item">
              <Link to="/organization/values" className="goals-framework__link">
                <span className="goals-framework__num">5</span>
                <span className="goals-framework__label">{ar ? 'الركائز الخمس' : 'Pillars'}</span>
                <IconChevronSm />
              </Link>
            </div>
            <div className="goals-framework__arrow" aria-hidden="true">›</div>
            <div className="goals-framework__item">
              <Link to="/organization/initiatives" className="goals-framework__link">
                <span className="goals-framework__num">8</span>
                <span className="goals-framework__label">{ar ? 'المبادرات' : 'Initiatives'}</span>
                <IconChevronSm />
              </Link>
            </div>
            <div className="goals-framework__arrow" aria-hidden="true">›</div>
            <div className="goals-framework__item goals-framework__item--current">
              <span className="goals-framework__num">7</span>
              <span className="goals-framework__label">{ar ? 'الأهداف' : 'Goals'}</span>
            </div>
          </div>

          <p className="values-intro">
            {ar
              ? 'تُجسّد أهدافنا الاستراتيجية التزامنا الراسخ بالتميز الرياضي والشمول والحضور الدولي، من خلال التركيز على تطوير القاعدة الشعبية وصقل النخب ورعاية الشراكات الفاعلة.'
              : 'Our strategic goals reflect our commitment to sporting excellence, inclusivity, and international presence — focusing on grassroots development, elite performance, and effective partnerships.'}
          </p>
        </div>
      </section>

      {/* Officially approved goals (§2 of the federation's content requirements) */}
      <section className="section--white">
        <div className="container container--narrow">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'الأهداف المعتمدة' : 'Approved Goals'}</span>
            <h2>{ar ? 'أهدافنا' : 'Our Goals'}</h2>
          </div>
          <ul className="goal-card-v2__list">
            {OFFICIAL_GOALS.map((g) => (
              <li key={g.en}>{ar ? g.ar : g.en}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Goals */}
      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'الأهداف السبعة' : '7 Strategic Goals'}</span>
            <h2>{ar ? 'خريطة الطريق الاستراتيجية' : 'Strategic Roadmap'}</h2>
          </div>

          <div className="goals-grid-v2">
            {GOALS.map((g) => (
              <div className="goal-card-v2" key={g.num}>
                <div className="goal-card-v2__head">
                  <span className="goal-card-v2__num">{g.num}</span>
                  <div className="goal-card-v2__meta">
                    <div className="goal-card-v2__pillar-tag">
                      <IconShield />
                      {ar ? g.pillarAr : g.pillarEn}
                    </div>
                    <div className="goal-card-v2__init-tag">
                      <IconClockSm />
                      {ar ? g.initAr : g.initEn}
                    </div>
                  </div>
                </div>
                <h3>{ar ? g.titleAr : g.titleEn}</h3>
                <p className="goal-card-v2__summary">{ar ? g.summaryAr : g.summaryEn}</p>
                <ul className="goal-card-v2__list">
                  {(ar ? g.itemsAr : g.itemsEn).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="goal-card-v2__initiative">
                  <IconCheckSm />
                  <span>{ar ? 'مبادرة محورية: ' : 'Key Initiative: '}</span>
                  {ar ? g.keyAr : g.keyEn}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pillars & Initiatives link bridge */}
      <section className="section--white">
        <div className="container values-ifma">
          <p className="values-ifma__text">
            {ar
              ? 'ترتبط كل هذه الأهداف بإحدى الركائز الخمس للمواي تاي، وتُعدّ المبادرات القائمة هي الأداة التنفيذية الرئيسية لتحقيقها.'
              : 'Each goal maps to one or more of the 5 Muaythai Pillars, with our active initiatives serving as the primary implementation vehicle.'}
          </p>
          <div className="values-cta__btns">
            <Link to="/organization/values" className="btn btn--green">{ar ? 'الركائز الخمس' : 'The 5 Pillars'}</Link>
            <Link to="/organization/initiatives" className="btn btn--green">{ar ? 'المبادرات' : 'Initiatives'}</Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section--green-gradient values-cta">
        <div className="container">
          <p className="values-cta__text">
            {ar
              ? 'انضم إلى مسيرتنا نحو جعل المواي تاي السعودي رمزاً للفخر الوطني والتميز العالمي.'
              : 'Join us in our mission to make Saudi Muaythai a symbol of national pride and global excellence.'}
          </p>
          <div className="values-cta__btns">
            <Link to="/organization/achievements" className="btn btn--gold">{ar ? 'الإنجازات' : 'Achievements'}</Link>
            <Link to="/organization/strategy" className="btn btn--outline btn--outline-white">{ar ? 'استراتيجيتنا' : 'Our Strategy'}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
