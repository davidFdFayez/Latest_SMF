import { useEffect, useState } from 'react';
import { useLang } from '../../context/LanguageContext';
import { fetchResultsStats } from '../../api/services';
import Avatar from '../../components/Avatar';

/**
 * CNT-01 — every athlete card on this page carried a stock photo of a different
 * person; the Ali Alnasser card was an event graphic showing two other athletes
 * with their names burned into the image. All six have been withdrawn to
 * web/_withdrawn-athlete-photos/ and the cards render a neutral silhouette
 * until the federation supplies a licensed photograph of the athlete named.
 *
 * To restore a real photo: drop the file in web/public/assets/images/ and set
 * `photo:` on that entry. Never point one of these at a photo of anyone else.
 */
const ATHLETE_PLACEHOLDER = '/assets/images/athlete-placeholder.svg';

/*
 * TODO(TXT-17) — Awaiting client data.
 *
 * QA reported errors in the athlete names, their photographs, and the
 * championship names on this page. The federation is supplying a data file with
 * the correct values; nothing on this page should be guessed or "corrected" from
 * memory until it arrives.
 *
 * Blocked on: SMF data file (athlete names, photos, championship names).
 * Affects: FEATURED, YOUTH_PARA, INTERNATIONAL, SAUDI_GAMES below — and the
 * withdrawn photographs described in web/_withdrawn-athlete-photos/README.md.
 */

const FEATURED = [
  {
    slug: 'hattan-alsaif-photo',
    photo: ATHLETE_PLACEHOLDER,
    tagAr: '🥇 بطلة العالم مرتين',
    tagEn: '🥇 2× World Champion',
    catAr: 'المنتخب الوطني النسائي',
    catEn: "Women's National Team",
    nameAr: 'هتان السف',
    nameEn: 'Hattan Alsaif',
    detailAr: 'فئة 54 كجم',
    detailEn: '54 kg Category',
    linesAr: ['🥇 بطلة العالم IFMA 2023 (بانكوك) — أول بطلة عالمية سعودية', '🥇 بطلة ألعاب القتال العالمية 2023 (الرياض)'],
    linesEn: ['🥇 IFMA World Champion 2023 (Bangkok) — First Saudi Female World Champion', '🥇 World Combat Games Champion 2023 (Riyadh)'],
  },
  {
    slug: 'inad-baowaydhan-photo',
    photo: ATHLETE_PLACEHOLDER,
    tagAr: '🥇 بطل ألعاب القتال',
    tagEn: '🥇 WCG Champion',
    catAr: 'المنتخب الوطني الرجالي',
    catEn: "Men's National Team",
    nameAr: 'عناد باعويضان',
    nameEn: 'Inad Baowaydhan',
    detailAr: 'فئة الكبار',
    detailEn: 'Senior Division',
    linesAr: ['🥇 بطل ألعاب القتال العالمية 2023 (الرياض)'],
    linesEn: ['🥇 World Combat Games Gold Medalist 2023 (Riyadh)'],
  },
  {
    slug: 'albaraa-alamoudi-photo',
    photo: ATHLETE_PLACEHOLDER,
    tagAr: '🥇 بطل العالم',
    tagEn: '🥇 World Champion',
    catAr: 'المنتخب الوطني الرجالي',
    catEn: "Men's National Team",
    nameAr: 'البراء العمودي',
    nameEn: 'Albaraa Alamoudi',
    detailAr: 'فئة 57 كجم',
    detailEn: '57 kg Category',
    linesAr: ['🥇 بطل العالم IFMA للكبار 2024 — أول رياضي سعودي ذكر يُحرز ذهبية العالم', '🥈 فضية ألعاب القتال العالمية 2023 (الرياض)'],
    linesEn: ['🥇 IFMA Senior World Champion 2024 — First Saudi Male World Champion', '🥈 World Combat Games Silver Medalist 2023 (Riyadh)'],
  },
];

const YOUTH_PARA = [
  {
    slug: 'fatimah-kashmiri-photo',
    photo: ATHLETE_PLACEHOLDER,
    tagAr: '🥇 بطلة العالم للشباب',
    tagEn: '🥇 Youth World Champion',
    catAr: 'منتخب الشباب النسائي',
    catEn: "Women's Youth National Team",
    nameAr: 'فاطمة كشميري',
    nameEn: 'Fatimah Kashmiri',
    detailAr: 'فئة الشباب',
    detailEn: 'Youth Division',
    linesAr: ['🥇 بطلة العالم للشباب IFMA 2025 (أبوظبي)'],
    linesEn: ['🥇 IFMA Youth World Champion 2025 (Abu Dhabi)'],
  },
  {
    slug: 'aljawhara-alhazza-photo',
    photo: ATHLETE_PLACEHOLDER,
    tagAr: '🥇 بطلة العالم للبارا',
    tagEn: '🥇 Para World Champion',
    catAr: 'المنتخب الوطني — بارا',
    catEn: 'National Team — Para',
    nameAr: 'الجوهرة الهزاء',
    nameEn: 'Aljawhara Alhazza',
    detailAr: 'بارا — إعاقة بصرية',
    detailEn: 'Para Visual Impairment',
    linesAr: ['🥇 بطلة العالم IFMA للشباب 2025 (أبوظبي) — فئة بارا الإعاقة البصرية'],
    linesEn: ['🥇 IFMA Youth World Champion 2025 (Abu Dhabi) — Para Visual Impairment'],
  },
  {
    slug: 'ali-alnasser-photo',
    photo: ATHLETE_PLACEHOLDER,
    tagAr: '🥇 ذهبيتان عالميتان',
    tagEn: '🥇 2× Gold Medalist',
    catAr: 'المنتخب الوطني — بارا',
    catEn: 'National Team — Para',
    nameAr: 'علي الناصر',
    nameEn: 'Ali Alnasser',
    detailAr: 'بارا مواي تاي',
    detailEn: 'Para Muaythai',
    linesAr: ['🥇 ذهبية ألعاب القتال العالمية 2023 (الرياض)', '🥇 بطل العالم للبارا مواي تاي IFMA 2024'],
    linesEn: ['🥇 World Combat Games Gold 2023 (Riyadh)', '🥇 IFMA Para World Champion 2024'],
  },
];

const INTERNATIONAL = [
  {
    year: '2026',
    mod: 'gold',
    titleAr: 'أول مشاركة جامعية سعودية — البرازيل 2026',
    titleEn: 'FISU World University Combat Sports Championships — Brazil 2026',
    items: [
      { icon: '🏅', ar: 'أول مشاركة سعودية في المواي تاي تحت رعاية الاتحاد الدولي للرياضة الجامعية (FISU).', en: 'First Saudi Muaythai participation under FISU — University World Championships.' },
      { icon: '🥉', ar: '3 رياضيين سعوديين — 3 ميداليات برونزية — نسبة تأهل لمنصة التتويج 100%.', en: '3 athletes represented Saudi Arabia — 3 bronze medals — 100% podium conversion rate.' },
    ],
  },
  {
    year: '2025',
    mod: 'gold',
    titleAr: 'بطولة العالم للشباب — أبوظبي 2025',
    titleEn: 'IFMA Youth World Championships — Abu Dhabi 2025',
    items: [
      { icon: '🥇', ar: 'فاطمة كشميري: بطلة العالم للشباب IFMA 2025.', en: 'Fatimah Kashmiri: IFMA Youth World Champion 2025.' },
      { icon: '🥇', ar: 'الجوهرة الهزاء: بطلة العالم للشباب IFMA 2025 — فئة بارا الإعاقة البصرية.', en: 'Aljawhara Alhazza: IFMA Youth World Champion 2025 (Abu Dhabi) — Para Visual Impairment.' },
      { icon: '🥈', ar: 'لولوة الطيار: فضية بطولة العالم للشباب 2025.', en: 'Lulwa Al-Tayyar: Youth World Silver Medalist 2025.' },
      { icon: '🥉', ar: '8 ميداليات برونزية إضافية في البطولة.', en: '8 additional Bronze medals at the IFMA Youth Championship.' },
      { icon: '📊', ar: '11 ميدالية إجمالاً — أفضل أداء تاريخي للمنتخب الشبابي السعودي.', en: '11 medals total — historic performance by the Saudi Youth National Team.' },
      { icon: '🥉', ar: 'ألعاب CISM العالمية العسكرية — يوليو 2025: 3 ميداليات برونزية.', en: 'CISM World Military Games — July 2025: 3 Bronze medals.' },
    ],
  },
  {
    year: '2024',
    mod: 'gold',
    titleAr: 'بطولة العالم للكبار — أول ذهبية ذكور سعودية',
    titleEn: 'IFMA Senior World Championship — First Saudi Male Gold',
    items: [
      { icon: '🥇', ar: 'البراء العمودي: أول رياضي سعودي ذكر يُحرز ذهبية بطولة العالم للكبار.', en: 'Albaraa Alamoudi: first Saudi male IFMA Senior World Champion.' },
      { icon: '🥇', ar: 'علي الناصر: ذهبية في فئة البارا مواي تاي.', en: 'Ali Alnasser: gold in Para Muaythai.' },
      { icon: '🏅', ar: 'تمثيل في الفعالية الاستعراضية بالقرية الأولمبية — باريس 2024.', en: 'Olympic Village exhibition participation — Paris 2024.' },
      { icon: '📊', ar: 'الحصيلة الدولية: 2 ذهبية، 1 فضية، 11 برونزية.', en: 'International total: 2 gold, 1 silver, 11 bronze medals.' },
    ],
  },
  {
    year: '2023',
    mod: 'gold',
    titleAr: 'ذهب عالمي وألعاب القتال العالمية في الرياض',
    titleEn: 'World Gold & World Combat Games in Riyadh',
    items: [
      { icon: '🥇', ar: 'هتان السف: أول رياضية سعودية تُحرز ذهبية بطولة العالم للكبار تحت إشراف IFMA.', en: 'Hattan Alsaif: first Saudi female IFMA Senior World Champion.' },
      { icon: '🥇', ar: 'ألعاب القتال العالمية — الرياض: 3 ذهبيات (هتان السف، عناد باعويضان، علي الناصر).', en: 'World Combat Games — Riyadh: 3 gold medals (Hattan Alsaif, Inad Baowaydhan, Ali Alnasser).' },
      { icon: '⭐', ar: 'تعيين سمو الأمير فهد نائباً لرئيس IFMA — أول سعودي في قيادة الاتحاد الدولي.', en: 'HRH Prince Fahad appointed Vice President of IFMA — first Saudi in IFMA leadership.' },
    ],
  },
  {
    year: '2022',
    mod: 'silver',
    titleAr: 'أول مشاركة عربية وكأس الملك',
    titleEn: "Arab Championship Debut & King's Cup",
    items: [
      { icon: '🌍', ar: 'أول مشاركة في البطولة العربية للملاكمة التايلندية.', en: 'Arab Muaythai Championship debut.' },
      { icon: '🥈', ar: 'بطولة العالم للشباب — كوالالمبور: 9 برونزيات و3 فضيات.', en: 'Youth World Championship — Kuala Lumpur: 9 bronze and 3 silver medals.' },
      { icon: '🏆', ar: 'كأس الملك — بانكوك: لقب دولي مرموق.', en: "King's Cup — Bangkok: prestigious international title." },
    ],
  },
  {
    year: '2021',
    mod: 'silver',
    titleAr: 'بطولة العالم IFMA — بانكوك 2021',
    titleEn: 'IFMA World Championship — Bangkok 2021',
    items: [
      // CNT-04 — this used to read "first individual international medal",
      // which the 2019 Chungju bronzes below disprove. It is the first IFMA
      // *World Championship* medal for the men's squad.
      { icon: '🥈', ar: 'عزام العمري: فضية بطولة العالم — أول ميدالية للمنتخب الرجالي في بطولة العالم IFMA.', en: "Azzam Al Omary: World Championship silver — the men's squad's first IFMA World Championship medal." },
      { icon: '🥉', ar: 'ميداليتان برونزيتان إضافيتان للمنتخب الوطني.', en: '2 additional bronze medals for the national team.' },
    ],
  },
  {
    year: '2020',
    mod: 'institutional',
    titleAr: 'المنافسة الافتراضية لـ IFMA وتحدي Max Fit',
    titleEn: 'IFMA Virtual Competition & Max Fit Challenge',
    items: [
      { icon: '🏅', ar: 'مشاركة فاعلة في المنافسة الافتراضية الدولية وإبراز قدرات الرياضيين السعوديين.', en: "Active participation in the international virtual competition, showcasing Saudi athletes' capabilities." },
    ],
  },
  {
    // CNT-04 — the founding year was missing from the timeline entirely.
    year: '2019',
    mod: 'bronze',
    titleAr: 'أول ميدالية على الساحة الدولية — تشونغجو، كوريا الجنوبية',
    titleEn: 'First Medal on the International Stage — Chungju, South Korea',
    items: [
      { icon: '🥉', ar: 'عبدالله القحطاني، سلطان مؤمن، يوسف الحربي: 3 ميداليات برونزية في بطولة العالم لفنون القتال (Chungju World Martial Arts Masterships).', en: 'Abdullah Alkahtani, Sultan Momen, Yousif Alharby: 3 bronze medals at the Chungju World Martial Arts Masterships.' },
      { icon: '🏅', ar: 'أول ميداليات دولية للاتحاد السعودي للملاكمة التايلندية، تحققت في عام تأسيسه.', en: "SMF's first international medals, won in its founding year." },
    ],
  },
];

const SAUDI_GAMES = [
  {
    editionAr: 'النسخة الأولى — 2022',
    editionEn: '1st Edition — 2022',
    medalistsAr: ['هتان السف — 51 كجم', 'خالد الدواليبي — 57 كجم', 'عبدالله القحطاني — 67 كجم', 'عمر الصوم — 77 كجم'],
    medalistsEn: ['Hattan Alsaif — 51kg', 'Khalid Aldawalibi — 57kg', 'Abdullah Alqahtani — 67kg', 'Omar Alsoum — 77kg'],
  },
  {
    editionAr: 'النسخة الثانية — 2023',
    editionEn: '2nd Edition — 2023',
    medalistsAr: ['هتان السف — 54 كجم', 'أحمد روسلي — 57 كجم', 'عثمان إسادوي — 63.5 كجم', 'سفيان مرزق — 75 كجم'],
    medalistsEn: ['Hattan Alsaif — 54kg', 'Ahmed Rosly — 57kg', 'Othmane Essadouie — 63.5kg', 'Soufian Merzaq — 75kg'],
  },
  {
    editionAr: 'النسخة الثالثة — 2024',
    editionEn: '3rd Edition — 2024',
    medalistsAr: ['هتان السف — 54 كجم', 'البراء العمودي — 57 كجم', 'راعد المصطفى — 75 كجم'],
    medalistsEn: ['Hattan Alsaif — 54kg', 'Albaraa Alamoudi — 57kg', 'Raed Almostafa — 75kg'],
  },
];

const DEVELOPMENT = [
  { icon: '👩', ar: 'استضافة أول بطولة نسائية حصرية للملاكمة التايلندية (2021).', en: 'Hosted the first-ever women-only Muaythai championship (2021).' },
  { icon: '🤝', ar: 'تنظيم أول بطولة مختلطة الجنسين (2021).', en: 'Organized the first mixed-gender championship (2021).' },
  { icon: '📋', ar: 'ورش عمل معترف بها دولياً للمسؤولين التقنيين بالشراكة مع IFMA.', en: 'Conducted internationally recognized Technical Officials Workshops with IFMA.' },
  { icon: '🏕️', ar: 'إنشاء معسكرات تدريبية إقليمية لدعم برامج تطوير الناشئين.', en: 'Established regional training camps supporting youth development programs.' },
  { icon: '♿', ar: 'إطلاق برنامج البارا مواي تاي وتوسيع مشاركة ذوي الإعاقة (2023).', en: 'Launched Para Muaythai program and expanded inclusive athlete participation (2023).' },
  { icon: '🌟', ar: 'تطوير مسارات المنتخب الشبابي وتوسيع قاعدة الرياضيين الشباب (2024).', en: 'Developed Youth National Team pathways and expanded athlete pipelines (2024).' },
  { icon: '🏆', ar: 'إنجاز تاريخي للمنتخب الشبابي في بطولة العالم — أبوظبي 2025 (11 ميدالية).', en: 'Historic Youth National Team performance at IFMA Youth Worlds — Abu Dhabi 2025 (11 medals).' },
  { icon: '🎓', ar: 'أول مشاركة في الرياضة الجامعية الدولية تحت رعاية FISU — البرازيل 2026.', en: 'First Saudi participation in university Muaythai under FISU — Brazil 2026.' },
];

const INSTITUTIONAL = [
  { year: '2019', ar: 'تأسيس الاتحاد رسمياً تحت مظلة اللجنة الأولمبية والبارالمبية السعودية.', en: 'SMF officially established under the Saudi Olympic & Paralympic Committee (SOPC).' },
  { year: '2020', ar: 'الاعتراف الرسمي والانضمام إلى أسرة IFMA الدولية.', en: 'Achieved official recognition from IFMA, joining the global Muaythai family.' },
  { year: '2023', ar: 'سمو الأمير فهد بن منصور يُعيَّن نائباً لرئيس IFMA — أول سعودي في قيادة الاتحاد الدولي.', en: 'HRH Prince Fahad bin Mansour appointed Vice President of IFMA — first Saudi in IFMA leadership.' },
  { year: '2023', ar: 'المملكة العربية السعودية تستضيف منافسات المواي تاي ضمن ألعاب القتال العالمية — الرياض 2023.', en: 'Saudi Arabia hosted Muaythai competition at the World Combat Games — Riyadh 2023.' },
  { year: '2024', ar: 'رياضيون سعوديون يُحرزون ألقاب بطولة العالم في فئتَي الكبار والبارا — إنجاز تاريخي.', en: 'Saudi athletes secured historic World Championship titles in Senior and Para divisions.' },
  { year: '2025', ar: 'المنتخب الشبابي يُحقق ألقاباً عالمية متعددة في بطولة العالم للشباب IFMA — أبوظبي 2025.', en: 'Youth National Team achieved multiple World Championship titles at IFMA Youth Worlds — Abu Dhabi 2025.' },
  { year: '2025', ar: 'أول مشاركة سعودية في ألعاب CISM العالمية العسكرية — 3 ميداليات برونزية.', en: 'First Saudi participation in CISM World Military Games — 3 Bronze medals.' },
  { year: '2026', ar: 'أول مشاركة سعودية في الرياضة الجامعية الدولية (FISU) — بطولة العالم للقتالية — البرازيل 2026.', en: 'First Saudi Muaythai participation under FISU at the World University Combat Sports Championships — Brazil 2026.' },
];

function AthleteCard({ a, ar }) {
  return (
    <article className="athlete-card smf-reveal">
      <div className="athlete-card__photo">
        <span className="athlete-card__medal-tag">{ar ? a.tagAr : a.tagEn}</span>
        <Avatar
          variant="gold"
          name={
            a.photo === ATHLETE_PLACEHOLDER
              ? ar ? `${a.nameAr} — الصورة قيد الإعداد` : `${a.nameEn} — photo pending`
              : ar ? a.nameAr : a.nameEn
          }
          src={a.photo}
        />
      </div>
      <div className="athlete-card__body">
        <p className="athlete-card__category">{ar ? a.catAr : a.catEn}</p>
        <h3 className="athlete-card__name">{ar ? a.nameAr : a.nameEn}</h3>
        <p className="athlete-card__detail">{ar ? a.detailAr : a.detailEn}</p>
        <p className="athlete-card__achievement">
          {(ar ? a.linesAr : a.linesEn).map((line, i) => (
            <span key={line}>
              {i > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      </div>
    </article>
  );
}

export default function Achievements() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const [stats, setStats] = useState({ gold: 7, silver: 17, bronze: 48, total: 72, championships: 15 });

  useEffect(() => {
    fetchResultsStats().then((d) => { if (d) setStats(d); });
  }, []);

  const medals = [
    { mod: 'gold', icon: '🥇', count: stats.gold, labelAr: 'ذهبية', labelEn: 'Gold' },
    { mod: 'silver', icon: '🥈', count: stats.silver, labelAr: 'فضية', labelEn: 'Silver' },
    { mod: 'bronze', icon: '🥉', count: stats.bronze, labelAr: 'برونزية', labelEn: 'Bronze' },
  ];

  return (
    <>
      <section className="page-hero">
        <div className="page-hero__bg" />
        <div className="page-hero__overlay" aria-hidden="true" />
        <div className="page-hero__accent" aria-hidden="true" />
        <div className="container page-hero__content">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <a href="/">{ar ? 'الرئيسية' : 'Home'}</a>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <a href="/organization/overview">{ar ? 'الاتحاد' : 'The Organization'}</a>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'الإنجازات' : 'Achievements'}</span>
          </nav>
          <span className="page-hero__tag">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="8" r="6" />
              <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
            </svg>
            {ar ? 'الإنجازات الدولية والوطنية' : 'International & National Achievements'}
          </span>
          <h1>{ar ? 'إنجازات الاتحاد السعودي للملاكمة التايلندية' : 'Federation Achievements'}</h1>
          <p className="page-hero__sub">
            {ar
              ? 'سجلٌ يوثق البطولات والميداليات والمحطات المؤسسية التي شكّلت مسيرة الاتحاد السعودي للمواي تاي ورسّخت حضوره على المستويين المحلي والدولي'
              : "A record of championships, medals, and institutional milestones that have defined SMF's growing presence locally and internationally."}
          </p>
          <div className="page-hero__stats">
            <div className="page-hero__stat">
              <span className="page-hero__stat-value">{stats.gold}</span>
              <span className="page-hero__stat-label">{ar ? 'ميدالية ذهبية دولية' : 'International Golds'}</span>
            </div>
            <div className="page-hero__stat">
              <span className="page-hero__stat-value">{stats.total}</span>
              <span className="page-hero__stat-label">{ar ? 'ميدالية دولية إجمالية' : 'International Medals'}</span>
            </div>
            <div className="page-hero__stat">
              <span className="page-hero__stat-value">{stats.championships ?? 15}</span>
              <span className="page-hero__stat-label">{ar ? 'بطولة دولية' : 'Championships'}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="medal-hero">
        <div className="container">
          <div className="medal-hero__inner">
            <div>
              <span className="medal-hero__label">{ar ? 'الحصيلة الدولية 2020–2026' : 'International Medal Count 2020–2026'}</span>
              <h2 className="medal-hero__title">{ar ? 'الميداليات السعودية على الساحة العالمية' : 'Saudi Medals on the World Stage'}</h2>
              <p className="medal-hero__sub">
                {ar
                  ? 'منذ أولى مشاركاتها الدولية، أثبتت المواي تاي السعودية حضورها القوي في أكبر بطولات العالم.'
                  : "Since its first international appearances, Saudi Muaythai has established a powerful presence at the world's biggest championships."}
              </p>
            </div>
            <div className="medal-row">
              {medals.map((m) => (
                <div className={`medal-item medal-item--${m.mod}`} key={m.mod}>
                  <span className="medal-item__icon">{m.icon}</span>
                  <span className="medal-item__count kpi-counter">{m.count}</span>
                  <span className="medal-item__label">{ar ? m.labelAr : m.labelEn}</span>
                  <span className="medal-item__period">2020–2026</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--amber">{ar ? 'أبطالنا' : 'Our Champions'}</span>
            <h2>{ar ? 'أبطال المنتخب الوطني' : 'National Team Champions'}</h2>
            <p>
              {ar
                ? 'رياضيون سعوديون رفعوا علم المملكة في أبرز البطولات الدولية.'
                : "Saudi athletes who have flown the Kingdom's flag at the world's biggest championships."}
            </p>
          </div>

          <div className="athlete-spotlight__row-header">
            <span className="section-label section-label--amber">{ar ? 'أبطال العالم المميزون' : 'Featured World Champions'}</span>
          </div>
          <div className="athlete-spotlight__grid">
            {FEATURED.map((a) => <AthleteCard key={a.slug} a={a} ar={ar} />)}
          </div>

          <div className="athlete-spotlight__row-header">
            <span className="section-label section-label--green">{ar ? 'أبطال الشباب والبارا' : 'Youth & Para World Champions'}</span>
          </div>
          <div className="athlete-spotlight__grid">
            {YOUTH_PARA.map((a) => <AthleteCard key={a.slug} a={a} ar={ar} />)}
          </div>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'دولي' : 'International'}</span>
            <h2>{ar ? 'الإنجازات الدولية' : 'International Achievements'}</h2>
          </div>

          {INTERNATIONAL.map((b) => (
            <div className={`achievement-year-block achievement-year-block--${b.mod}`} key={b.year + b.titleEn}>
              <span className="achievement-year-block__year-badge">{b.year}</span>
              <h3>{ar ? b.titleAr : b.titleEn}</h3>
              <div className="achievement-items">
                {b.items.map((it) => (
                  <div className="achievement-item" key={it.en}>
                    <span className="achievement-item__icon">{it.icon}</span>
                    <span>{ar ? it.ar : it.en}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--amber">{ar ? 'وطني' : 'National'}</span>
            <h2>{ar ? 'المواي تاي في الألعاب السعودية' : 'Muaythai at the Saudi Games'}</h2>
            <p>{ar ? 'الحاصدين على الذهب في المواي تاي في الألعاب السعودية الثلاث.' : 'Muaythai gold medalists across three editions of the Saudi Games.'}</p>
          </div>

          <div className="saudi-games-grid">
            {SAUDI_GAMES.map((g) => (
              <div className="saudi-games-card" key={g.editionEn}>
                <div className="saudi-games-card__header">
                  <span className="saudi-games-card__header-icon">🏆</span>
                  <div>
                    <div className="saudi-games-card__edition">{ar ? g.editionAr : g.editionEn}</div>
                  </div>
                </div>
                <div className="saudi-games-card__body">
                  {(ar ? g.medalistsAr : g.medalistsEn).map((m) => (
                    <div className="saudi-games-card__medalist" key={m}>
                      <span className="saudi-games-card__medalist-icon">🥇</span>
                      {m}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="achievement-highlight-box">
            <div className="achievement-highlight-box__header">
              <span className="achievement-highlight-box__icon">🏟️</span>
              <h3>{ar ? 'بطولة المملكة — النسخة الخامسة 2024' : 'Kingdom Championship — 5th Edition 2024'}</h3>
            </div>
            <p>
              {ar ? (
                'شهدت النسخة الخامسة من بطولة المملكة للملاكمة التايلندية (2024) مشاركةً قياسية تجاوزت 480 رياضياً من مختلف مناطق المملكة والدول الخليجية المجاورة، مما يؤكد مكانة المواي تاي رياضةً جماهيرية رائدة في المملكة.'
              ) : (
                <>
                  The 5th Kingdom Championship (2024) recorded unprecedented participation of over{' '}
                  <strong>480 athletes</strong>{' '}
                  from across Saudi Arabia and neighbouring Gulf countries, confirming Muaythai&apos;s status as a leading competitive sport in the Kingdom.
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="milestones-grid">
            <div>
              <div className="section-header">
                <span className="section-label section-label--green">{ar ? 'تطوير' : 'Development'}</span>
                <h2>{ar ? 'الإنجازات التطويرية' : 'Developmental Achievements'}</h2>
              </div>
              <div className="achievement-year-block achievement-year-block--institutional">
                <span className="achievement-year-block__year-badge">2019–2026</span>
                <div className="achievement-items">
                  {DEVELOPMENT.map((d) => (
                    <div className="achievement-item" key={d.en}>
                      <span className="achievement-item__icon">{d.icon}</span>
                      <span>{ar ? d.ar : d.en}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="section-header">
                <span className="section-label section-label--green">{ar ? 'مؤسسي' : 'Institutional'}</span>
                <h2>{ar ? 'المعالم المؤسسية' : 'Institutional Milestones'}</h2>
              </div>
              <ol className="timeline">
                {INSTITUTIONAL.map((m) => (
                  <li className="timeline__item" key={m.en}>
                    <div className="timeline__year">{m.year}</div>
                    <div className="timeline__dot" aria-hidden="true" />
                    <div className="timeline__content">
                      <p>{ar ? m.ar : m.en}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
