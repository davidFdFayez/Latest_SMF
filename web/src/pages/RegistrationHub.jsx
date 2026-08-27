import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';

const ico = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const STEP_ICONS = [
  <svg {...ico}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  <svg {...ico}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.1 1.22 2 2 0 012.1 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>,
  <svg {...ico}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
  <svg {...ico}><polyline points="20 6 9 17 4 12" /></svg>,
];

const NUMBERS = [
  { value: '1,300+', labelAr: 'رياضي مسجّل', labelEn: 'Registered Athletes' },
  { value: '4', labelAr: 'أنواع تسجيل', labelEn: 'Registration Types' },
  { value: '13', labelAr: 'منطقة نشطة', labelEn: 'Active Regions' },
  { value: '2019', labelAr: 'عام التأسيس', labelEn: 'Founded' },
];

const STEPS = [
  {
    num: '1',
    titleAr: 'أكمل النموذج',
    titleEn: 'Complete the Form',
    textAr: 'اختر نوع التسجيل المناسب وأدخل بياناتك بدقة.',
    textEn: 'Select your registration type and enter your details accurately.',
  },
  {
    num: '2',
    titleAr: 'استلم الرقم المرجعي',
    titleEn: 'Receive Reference Number',
    textAr: 'يصدر رقم مرجعي فور إرسال الطلب لمتابعة حالته.',
    textEn: 'A reference number is issued immediately upon submission to track your application.',
  },
  {
    num: '3',
    titleAr: 'مراجعة الاتحاد',
    titleEn: 'SMF Review',
    textAr: 'يراجع فريق الاتحاد طلبك والوثائق المرفقة.',
    textEn: 'The federation team reviews your application and supporting documents.',
  },
  {
    num: '4',
    titleAr: 'إشعار بالقرار',
    titleEn: 'Decision Notification',
    textAr: 'تصلك النتيجة رسمياً وتستطيع استلام وثائق التسجيل.',
    textEn: 'You receive the official outcome and can collect your registration documents.',
  },
];

const TYPES = [
  {
    to: '/registration/athlete',
    image: '/assets/images/reg-athlete.svg',
    prefix: 'SMF-A',
    titleAr: 'تسجيل لاعب',
    titleEn: 'Athlete Registration',
    descAr: 'سجّل بياناتك كرياضي لدى الاتحاد السعودي للملاكمة التايلندية.',
    descEn: 'Submit your official registration as a Muaythai athlete with the Saudi Muaythai Federation (SMF).',
  },
  {
    to: '/registration/club',
    image: '/assets/images/reg-club.svg',
    prefix: 'SMF-C',
    titleAr: 'تسجيل نادي',
    titleEn: 'Club Registration',
    descAr: 'سجّل ناديك أو مركزك التدريبي رسمياً لدى الاتحاد.',
    descEn: 'Register your Muaythai club or training centre officially with the federation.',
  },
  {
    to: '/registration/coach',
    image: '/assets/images/reg-coach.svg',
    prefix: 'SMF-T',
    titleAr: 'تسجيل مدرب',
    titleEn: 'Coach Registration',
    descAr: 'سجّل بياناتك للحصول على ترخيص التدريب من الاتحاد.',
    descEn: 'Submit your official application for a coaching licence from the federation.',
  },
  {
    to: '/registration/official',
    image: '/assets/images/reg-official.svg',
    prefix: 'SMF-O',
    titleAr: 'تسجيل حكم / مسؤول',
    titleEn: 'Official Registration',
    descAr: 'سجّل بياناتك كحكم أو مسؤول رسمي لدى الاتحاد.',
    descEn: 'Register as a referee, judge, or official with the Saudi Muaythai Federation (SMF).',
  },
];

export default function RegistrationHub() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  return (
    <>
      <section className="reg-hero">
        <div className="reg-hero__bg" />
        <div className="reg-hero__overlay" aria-hidden="true" />
        <div className="reg-hero__accent" aria-hidden="true" />
        <div className="container reg-hero__content">
          <div>
            <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
              <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
              <span className="breadcrumb__sep" aria-hidden="true">›</span>
              <span>{ar ? 'التسجيل' : 'Registration'}</span>
            </nav>
            <span className="reg-hero__tag">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              {ar ? 'الاتحاد السعودي للملاكمة التايلندية' : 'Saudi Muaythai Federation'}
            </span>
            <h1>{ar ? 'التسجيل الرسمي' : 'Official Registration'}</h1>
            <p>
              {ar
                ? 'اختر نوع التسجيل المناسب. يُخزّن كل طلب في قاعدة بيانات الاتحاد وتتلقى رقماً مرجعياً فور الإرسال.'
                : 'Choose your registration type below. All applications are stored in the SMF database and you will receive a reference number immediately upon submission.'}
            </p>
          </div>

          <div className="reg-hero__numbers">
            {NUMBERS.map((n) => (
              <div className="reg-hero__num" key={n.labelEn}>
                <div className="reg-hero__num-value">{n.value}</div>
                <div className="reg-hero__num-label">{ar ? n.labelAr : n.labelEn}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'كيف يعمل' : 'How it Works'}</span>
            <h2>{ar ? 'كيف تسير العملية' : 'How It Works'}</h2>
          </div>

          <div className="stepper-v2">
            {STEPS.map((s, i) => (
              <div className="step-v2" key={s.num}>
                <div className="step-v2__circle" aria-hidden="true">
                  {STEP_ICONS[i]}
                  <span className="step-v2__num">{s.num}</span>
                </div>
                <h3 className="step-v2__title">{ar ? s.titleAr : s.titleEn}</h3>
                <p className="step-v2__text">{ar ? s.textAr : s.textEn}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'التسجيل' : 'Registration'}</span>
            <h2>{ar ? 'اختر نوع التسجيل' : 'Choose Your Registration Type'}</h2>
          </div>

          <div
            className="registration-note"
            role="note"
            style={{ maxWidth: 640, marginInline: 'auto', marginBottom: 'var(--space-2xl)' }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
              <path fillRule="evenodd" clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
            </svg>
            <span>
              {ar
                ? 'هذا النموذج تسجيل رسمي لدى الاتحاد. سيُحفظ طلبك وستتلقى رقماً مرجعياً فور الإرسال.'
                : 'This is an official registration form. Your application will be stored and reviewed by the federation. You will receive a reference number immediately upon submission.'}
            </span>
          </div>

          <div className="reg-cards-v2">
            {TYPES.map((t) => (
              <article className="reg-card-v2" key={t.prefix}>
                <div
                  className="reg-card-v2__image reg-card-v2__image--art"
                  style={{ backgroundImage: `url('${t.image}')` }}
                  role="img"
                  aria-label={ar ? t.titleAr : t.titleEn}
                />
                <div className="reg-card-v2__body">
                  <p className="reg-card-v2__ref">
                    {ar ? 'رمز الطلب:' : 'Reference prefix:'} <strong>{t.prefix}</strong>
                  </p>
                  <h3 className="reg-card-v2__title">{ar ? t.titleAr : t.titleEn}</h3>
                  <p className="reg-card-v2__desc">{ar ? t.descAr : t.descEn}</p>
                  <Link to={t.to} className="btn btn--green">{ar ? 'سجّل الآن' : 'Register Now'}</Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
