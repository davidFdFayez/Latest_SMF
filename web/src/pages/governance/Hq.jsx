import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import Avatar from '../../components/Avatar';

function StarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
    </svg>
  );
}

const DEPARTMENTS = [
  { ar: 'الموارد البشرية والإدارة', en: 'HR & Administration' },
  { ar: 'الإعلام وتقنية المعلومات', en: 'Media & IT & Comms' },
  { ar: 'الأداء الرياضي والتطوير', en: 'Sport Performance & Development' },
  { ar: 'المالية والمشتريات', en: 'Finance & Procurement' },
  { ar: 'إدارة المشاريع', en: 'Projects' },
];

const BOARD = [
  { ar: 'م. ريان بن غازي خميس الأحمد', en: 'Eng. Ryan bin Ghazi Khamis Al-Ahmad' },
  { ar: 'العميد المتقاعد خالد بن محمد بن سعد الجهني', en: 'Brig. Gen. (Ret.) Khaled bin Mohammed bin Saad Al-Juhani' },
  { ar: 'م. ناصر بن عبدالعزيز بن ناصر المعيبد', en: 'Eng. Nasser bin Abdulaziz bin Nasser Al-Muaibed' },
  { ar: 'م. بسام بن عباس بن احمد اليماني', en: 'Eng. Bassam bin Abbas bin Ahmed Al-Yamani' },
  { ar: 'الأستاذ عمر احمد الغامدي', en: 'Mr. Omar Ahmed Alghamdi' },
];


const TECHNICAL = [
  { nameAr: 'قريباً', nameEn: 'Coming Soon', roleAr: 'المدير الفني', roleEn: 'Technical Director', vacant: true },
  { nameAr: 'فراس سعدة', nameEn: 'Feraas Saada', roleAr: 'المدرب الرئيسي للمنتخب الوطني', roleEn: 'National Team Head Coach' },
  { nameAr: 'ووراووت نامدوانج', nameEn: 'Worawut Namduang', roleAr: 'مدرب الاتحاد', roleEn: 'Federation Coach' },
  { nameAr: 'علي العمري', nameEn: 'Ali Alomari', roleAr: 'مدرب الاتحاد', roleEn: 'Federation Coach' },
  { nameAr: 'فووانات بوود', nameEn: 'Phuwanat Poode', roleAr: 'مساعد مدرب', roleEn: 'Coach Assistant' },
];

export default function Hq() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  return (
    <>
      <section className="page-hero">
        <div className="page-hero__bg" />
        <div className="page-hero__overlay" aria-hidden="true" />
        <div className="page-hero__accent" aria-hidden="true" />
        <div className="container page-hero__content">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/governance/recognition">{ar ? 'الحوكمة' : 'Governance'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'المقر الرئيسي' : 'Federation HQ'}</span>
          </nav>
          <span className="page-hero__tag">
            <StarIcon />
            {ar ? 'القيادة والحوكمة' : 'Leadership & Governance'}
          </span>
          <h1>{ar ? 'القيادة والكوادر الإدارية' : 'Leadership & Administrative Staff'}</h1>
          <p className="page-hero__sub">
            {ar
              ? 'يقود الاتحاد السعودي للملاكمة التايلندية نخبةٌ من القادة والمتخصصين المكرّسين لتحقيق رسالة الاتحاد ورفع مستوى المواي تاي في المملكة.'
              : 'SMF is led by a dedicated team of professionals committed to growing Muaythai across the Kingdom of Saudi Arabia.'}
          </p>
          <div className="page-hero__stats">
            <div className="page-hero__stat">
              <span className="page-hero__stat-value">2019</span>
              <span className="page-hero__stat-label">{ar ? 'عام التأسيس' : 'Founded'}</span>
            </div>
            <div className="page-hero__stat">
              <span className="page-hero__stat-value">20</span>
              <span className="page-hero__stat-label">{ar ? 'عضو في الفريق' : 'Team Members'}</span>
            </div>
            <div className="page-hero__stat">
              <span className="page-hero__stat-value">7</span>
              <span className="page-hero__stat-label">{ar ? 'لجان تخصصية' : 'Committees'}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="governance-diagram">
        <div className="container governance-diagram__inner">
          <span className="governance-diagram__label">{ar ? 'الهيكل التنظيمي' : 'Organizational Structure'}</span>
          <h2 className="governance-diagram__title">{ar ? 'هيكل الحوكمة المؤسسية' : 'Federation Governance Structure'}</h2>
          <p className="governance-diagram__sub">
            {ar
              ? 'يعتمد الاتحاد السعودي للملاكمة التايلندية هيكلاً حوكمياً واضحاً يضمن الشفافية والمساءلة.'
              : 'SMF operates a clear governance structure ensuring transparency and accountability at every level.'}
          </p>

          <div className="gov-structure">
            <div className="gov-tier">
              <div className="gov-box gov-box--president">
                {ar
                  ? 'رئيس الاتحاد — صاحب السمو الملكي الأمير فهد بن منصور آل سعود'
                  : 'Federation President — HRH Prince Fahad bin Mansour Al Saud'}
              </div>
            </div>
            <div className="gov-connector"><span className="gov-connector-v" /></div>
            <div className="gov-tier">
              <div className="gov-box gov-box--board gov-box--board-solo">
                {ar ? 'مجلس الإدارة (5 أعضاء)' : 'Board of Directors (5)'}
              </div>
            </div>
            <div className="gov-connector"><span className="gov-connector-v" /></div>
            <div className="gov-connector"><div className="gov-connector-h" /></div>
            <div className="gov-tier">
              <div className="gov-box gov-box--ceo">
                {ar ? 'الرئيس التنفيذي — م.عبدالعزيز بن إبراهيم آل بنان' : 'CEO — Eng. Abdulaziz bin Ibrahim Al Bannan'}
              </div>
              <div className="gov-box gov-box--committees-branch">
                {ar ? 'اللجان المتخصصة' : 'Specialist Committees'}
              </div>
            </div>
            <div className="gov-connector"><span className="gov-connector-v" /></div>
            <div className="gov-tier">
              {DEPARTMENTS.map((d) => (
                <div className="gov-box gov-box--committee" key={d.en}>{ar ? d.ar : d.en}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--amber">{ar ? 'الرئاسة' : 'Presidency'}</span>
            <h2>{ar ? 'رئيس الاتحاد' : 'Federation President'}</h2>
          </div>

          <div className="president-hero">
            <div className="president-hero__inner">
              <div className="president-hero__photo">
                <Avatar
                  size="xl"
                  variant="gold"
                  name={ar ? 'الأمير فهد بن منصور آل سعود' : 'Fahad Bin Mansour Al Saud'}
                />
              </div>
              <div>
                <span className="president-hero__badge">
                  <StarIcon />
                  {ar ? 'رئيس الاتحاد السعودي للملاكمة التايلندية' : 'Federation President'}
                </span>
                <p className="president-hero__name">
                  {ar
                    ? 'صاحب السمو الملكي الأمير فهد بن منصور بن سعد بن سعود بن عبدالعزيز آل سعود'
                    : 'HRH Prince Fahad Bin Mansour Bin Saad Bin Saud Bin Abdulaziz Al Saud'}
                </p>
                <p className="president-hero__role president-hero__role--primary">
                  {ar ? 'رئيس الاتحاد السعودي للملاكمة التايلندية' : 'President, Saudi Muaythai Federation'}
                </p>
                <p className="president-hero__role">
                  {ar
                    ? 'نائب رئيس الاتحاد الدولي IFMA'
                    : 'Vice President, IFMA (International Federation of Muaythai Associations)'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'الرئاسة التنفيذية' : 'Executive Office'}</span>
            <h2>{ar ? 'الرئيس التنفيذي' : 'Chief Executive Officer'}</h2>
          </div>

          <div className="exec-card">
            <div className="exec-card__photo">
              <Avatar size="lg" name={ar ? 'عبدالعزيز بن إبراهيم آل بنان' : 'Abdulaziz bin Ibrahim Al Bannan'} />
            </div>
            <div>
              <p className="exec-card__dept">{ar ? 'الرئاسة التنفيذية' : 'Executive Office'}</p>
              <p className="exec-card__name">{ar ? 'م.عبدالعزيز بن إبراهيم آل بنان' : 'Eng. Abdulaziz bin Ibrahim Al Bannan'}</p>
              <p className="exec-card__role">
                {ar ? 'الرئيس التنفيذي — الاتحاد السعودي للملاكمة التايلندية' : 'Chief Executive Officer — Saudi Muaythai Federation'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'الحوكمة' : 'Governance'}</span>
            <h2>{ar ? 'أعضاء مجلس الإدارة' : 'Board of Directors'}</h2>
            <p>
              {ar
                ? 'خمسة أعضاء يمثلون الهيئة الإشرافية العليا للاتحاد.'
                : "Five members forming the federation's supreme supervisory body."}
            </p>
          </div>

          <div className="board-grid">
            {BOARD.map((b) => (
              <div className="board-card" key={b.en}>
                <div className="board-card__photo">
                  <Avatar size="md" name={ar ? b.ar : b.en} />
                </div>
                <p className="board-card__role">{ar ? 'عضو مجلس الإدارة' : 'Board Member'}</p>
                <p className="board-card__name">{ar ? b.ar : b.en}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TXT-27 / TXT-40 — the "الكوادر الإدارية والتشغيلية" (Administrative &
          Operational Team) section was removed at the federation's request, in
          both languages. The departments still appear in the governance chart
          above; the named staff listing does not. */}
      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--amber">{ar ? 'الكادر الفني' : 'Technical Staff'}</span>
            <h2>{ar ? 'الكادر التدريبي والفني' : 'Coaching & Technical Team'}</h2>
            <p>
              {ar
                ? 'المدربون والكادر الفني المكلّفون بتطوير أداء منتخباتنا الوطنية.'
                : 'The coaches and technical staff responsible for developing our national teams.'}
            </p>
          </div>

          <div className="staff-grid staff-grid--two-col">
            {TECHNICAL.map((s) => (
              <div className={`staff-card${s.vacant ? ' staff-card--coming-soon staff-card--featured' : ''}`} key={s.roleEn + s.nameEn}>
                <div className="staff-card__photo">
                  <Avatar
                    size="sm"
                    variant={s.vacant ? 'charcoal' : 'green'}
                    name={s.vacant ? '' : (ar ? s.nameAr : s.nameEn)}
                  />
                </div>
                <div className="staff-card__info">
                  <p className={`staff-card__name${s.vacant ? ' staff-card__name--vacant' : ''}`}>{ar ? s.nameAr : s.nameEn}</p>
                  <p className="staff-card__role">{ar ? s.roleAr : s.roleEn}</p>
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
              ? 'للتواصل أو الاستفسار، يسعدنا استقبال رسائلكم عبر صفحة التواصل الرسمية.'
              : 'For enquiries, we welcome your messages through our official contact page.'}
          </p>
          <div className="values-cta__btns">
            <Link to="/contact" className="btn btn--gold">{ar ? 'تواصل معنا' : 'Contact'}</Link>
            <Link to="/governance/committees" className="btn btn--outline btn--outline-white">{ar ? 'اللجان المتخصصة' : 'Committees'}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
