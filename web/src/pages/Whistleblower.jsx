import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import { submitWhistleblower } from '../api/services';

const ico = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const TRUST = [
  {
    icon: <svg {...ico}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
    titleAr: 'سري وآمن',
    titleEn: 'Confidential & Secure',
    bodyAr: 'جميع البلاغات تُعامَل بسرية تامة وأمان كامل.',
    bodyEn: 'All reports are handled with complete confidentiality and security.',
  },
  {
    icon: <svg {...ico}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    titleAr: 'يمكن تقديمه بشكل مجهول',
    titleEn: 'Anonymous Option',
    bodyAr: 'بيانات الاتصال اختيارية تماماً.',
    bodyEn: 'Contact details are entirely optional.',
  },
  {
    icon: <svg {...ico}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>,
    titleAr: 'مراجعة رسمية',
    titleEn: 'Official Review',
    bodyAr: 'يُراجَع كل بلاغ من قِبل الجهة المختصة في الاتحاد.',
    bodyEn: 'Every report is reviewed by the appropriate federation authority.',
  },
  {
    icon: <svg {...ico}><polyline points="20 6 9 17 4 12" /></svg>,
    titleAr: 'حماية المُبلِّغ',
    titleEn: 'Whistleblower Protection',
    bodyAr: 'يلتزم الاتحاد بحماية كل من يُبلّغ عن مخالفة بحسن نية.',
    bodyEn: 'SMF is committed to protecting anyone who reports a concern in good faith.',
  },
];

const PROCESS = [
  {
    num: '1',
    titleAr: 'تقديم البلاغ',
    titleEn: 'Submit Your Report',
    bodyAr: 'أكمل النموذج أدناه بتفاصيل المخالفة. البيانات الشخصية اختيارية — يمكنك الإبلاغ بشكل مجهول تماماً.',
    bodyEn: 'Complete the form below with details of the concern. Personal details are optional — you may report entirely anonymously.',
  },
  {
    num: '2',
    titleAr: 'الاستلام والتصنيف',
    titleEn: 'Receipt & Classification',
    bodyAr: 'يتلقى الفريق المختص في الاتحاد البلاغ ويصنّفه وفق طبيعة المخالفة في غضون 3 أيام عمل.',
    bodyEn: 'The designated SMF team receives and classifies the report by concern type within 3 business days.',
  },
  {
    num: '3',
    titleAr: 'التحقيق والمعالجة',
    titleEn: 'Investigation & Review',
    bodyAr: 'تُجرى مراجعة داخلية شاملة للبلاغ. في حال كان المبلّغ قد ذكر بياناته، قد يتم التواصل معه لمزيد من التفاصيل.',
    bodyEn: 'A thorough internal review is conducted. If you provided contact details, we may reach out for further information.',
  },
  {
    num: '4',
    titleAr: 'الإجراء والمتابعة',
    titleEn: 'Action & Follow-up',
    bodyAr: 'تتخذ الجهة المختصة الإجراء المناسب. إذا وفّرت بريدًا إلكترونيًا، ستتلقى إشعارًا بنتيجة المراجعة.',
    bodyEn: 'The appropriate authority takes action. If you provided an email, you will receive notification of the review outcome.',
  },
];

const CONCERN_TYPES = [
  { value: 'doping', ar: 'المنشطات', en: 'Doping' },
  { value: 'match_fixing', ar: 'تلاعب في النتائج', en: 'Match Fixing' },
  { value: 'misconduct', ar: 'سوء سلوك', en: 'Misconduct' },
  { value: 'financial', ar: 'مخالفات مالية', en: 'Financial Irregularity' },
  { value: 'harassment', ar: 'تحرش أو مضايقة', en: 'Harassment' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

export default function Whistleblower() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [form, setForm] = useState({
    concernType: '',
    description: '',
    name: '',
    phone: '',
    email: '',
  });
  const [status, setStatus] = useState({ loading: false, error: '', reference: '' });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setStatus({ loading: true, error: '', reference: '' });

    // The API stores a description plus a single optional-contact string, so the
    // concern type and the individual contact fields are folded into those two.
    const type = CONCERN_TYPES.find((t) => t.value === form.concernType);
    const typeLabel = type ? (ar ? type.ar : type.en) : '';
    const description = typeLabel ? `[${typeLabel}] ${form.description}` : form.description;
    const optionalContact = [form.name, form.phone, form.email].filter(Boolean).join(' · ') || null;

    try {
      const res = await submitWhistleblower({ description, optionalContact });
      setStatus({ loading: false, error: '', reference: res.referenceNumber });
      setForm({ concernType: '', description: '', name: '', phone: '', email: '' });
    } catch (err) {
      setStatus({
        loading: false,
        error: err?.response?.data?.message || (ar ? 'تعذر الإرسال' : 'Submit failed'),
        reference: '',
      });
    }
  }

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'الإبلاغ عن مخالفة' : 'Report a Concern'}</span>
          </nav>
          <h1>{ar ? 'الإبلاغ عن مخالفة' : 'Report a Concern'}</h1>
          <p>
            {ar
              ? 'يوفر الاتحاد السعودي للملاكمة التايلندية قناة آمنة وسرية للإبلاغ عن المخاوف.'
              : 'The Saudi Muaythai Federation (SMF) provides a safe and confidential channel for reporting concerns.'}
          </p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="trust-grid">
            {TRUST.map((t) => (
              <div className="trust-card" key={t.titleEn}>
                <div className="trust-card__icon">{t.icon}</div>
                <h2>{ar ? t.titleAr : t.titleEn}</h2>
                <p>{ar ? t.bodyAr : t.bodyEn}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'كيف يعمل النظام' : 'How It Works'}</span>
            <h2>{ar ? 'مسار معالجة البلاغات' : 'Report Processing Process'}</h2>
          </div>

          <div className="wb-process">
            {PROCESS.map((p, i) => (
              <div key={p.num} style={{ display: 'contents' }}>
                {i > 0 && <div className="wb-process__connector" />}
                <div className="wb-process__step">
                  <div className="wb-process__num">{p.num}</div>
                  <div className="wb-process__body">
                    <h3>{ar ? p.titleAr : p.titleEn}</h3>
                    <p>{ar ? p.bodyAr : p.bodyEn}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="wb-confidentiality">
            <div className="wb-confidentiality__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3>{ar ? 'بيان السرية والحماية' : 'Confidentiality & Protection Statement'}</h3>
              <p>
                {ar
                  ? 'يلتزم الاتحاد السعودي للملاكمة التايلندية بالحفاظ على سرية جميع البلاغات وهوية المُبلِّغين. لن يُفصح عن أي معلومات شخصية لأطراف ثالثة خارج نطاق الفريق المعالج للبلاغ. كل من يُبلّغ عن مخالفة بحسن نية يحظى بحماية كاملة من أي انتقام أو إجراء تأديبي. إساءة استخدام هذا النظام أو تقديم بلاغات كيدية يُعرّض صاحبها للمساءلة.'
                  : 'The Saudi Muaythai Federation is committed to maintaining the confidentiality of all reports and the identity of reporters. No personal information will be disclosed to any third party outside the designated review team. Anyone who reports a concern in good faith is fully protected against any form of retaliation or disciplinary action. Misuse of this system or submission of knowingly false reports may result in appropriate action.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="wb-form-wrapper">
            <div className="wb-form-wrapper__header">
              <h2>{ar ? 'نموذج البلاغ' : 'Report Form'}</h2>
              <p>
                {ar
                  ? 'يُرجى وصف المخالفة بأكبر قدر ممكن من التفاصيل. كلما كانت المعلومات أكثر دقة، كانت المعالجة أسرع وأكثر فاعلية.'
                  : 'Please describe the concern with as much detail as possible. The more specific the information, the faster and more effectively we can act.'}
              </p>
            </div>

            <div className="wb-form-card">
              {status.reference && (
                <div className="wb-form__success" role="status">
                  {ar ? 'تم استلام البلاغ. الرقم المرجعي:' : 'Report received. Reference:'} <strong>{status.reference}</strong>
                </div>
              )}
              {status.error && (
                <div className="wb-form__error" role="alert">{status.error}</div>
              )}

              <form className="wb-form" onSubmit={onSubmit}>
                <div className="wb-form__field">
                  <label htmlFor="wb-concern-type">
                    {ar ? 'نوع المخالفة' : 'Concern Type'}
                    <span className="wb-form__required">*</span>
                  </label>
                  <select
                    id="wb-concern-type"
                    name="concern_type"
                    required
                    value={form.concernType}
                    onChange={set('concernType')}
                  >
                    <option value="">{ar ? '— اختر نوع المخالفة —' : '— Select concern type —'}</option>
                    {CONCERN_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{ar ? t.ar : t.en}</option>
                    ))}
                  </select>
                </div>

                <div className="wb-form__field">
                  <label htmlFor="wb-description">
                    {ar ? 'وصف المخاوف' : 'Description of Concern'}
                    <span className="wb-form__required">*</span>
                  </label>
                  <textarea
                    id="wb-description"
                    name="description"
                    rows={6}
                    required
                    minLength={20}
                    value={form.description}
                    onChange={set('description')}
                  />
                  <span className="wb-form__hint">
                    {ar
                      ? 'الحد الأدنى 20 حرفاً. كلما كانت التفاصيل أكثر، كانت المعالجة أسرع.'
                      : 'Minimum 20 characters. More detail helps us act faster and more effectively.'}
                  </span>
                </div>

                <div className="wb-form__divider">
                  <span>{ar ? 'بيانات التواصل — اختياري' : 'Contact Details — Optional'}</span>
                </div>
                <p className="wb-form__divider-note">
                  {ar
                    ? 'هذه البيانات اختيارية بالكامل. يمكنك تقديم البلاغ بشكل مجهول دون ذكر أي من هذه المعلومات.'
                    : 'These fields are entirely optional. You can submit this report completely anonymously without providing any of this information.'}
                </p>

                <div className="wb-form__row">
                  <div className="wb-form__field">
                    <label htmlFor="wb-name">{ar ? 'الاسم (اختياري)' : 'Your Name (optional)'}</label>
                    <input id="wb-name" name="reporter_name" type="text" value={form.name} onChange={set('name')} />
                  </div>
                  <div className="wb-form__field">
                    <label htmlFor="wb-phone">{ar ? 'رقم الهاتف (اختياري)' : 'Your Phone (optional)'}</label>
                    <input id="wb-phone" name="reporter_phone" type="tel" value={form.phone} onChange={set('phone')} />
                  </div>
                </div>

                <div className="wb-form__field">
                  <label htmlFor="wb-email">{ar ? 'البريد الإلكتروني (اختياري)' : 'Your Email (optional)'}</label>
                  <input id="wb-email" name="reporter_email" type="email" value={form.email} onChange={set('email')} />
                  <span className="wb-form__hint">
                    {ar
                      ? 'إذا أضفت بريدك الإلكتروني، سنُخطرك بنتيجة المراجعة.'
                      : 'If you provide your email, we will notify you of the review outcome.'}
                  </span>
                </div>

                <button type="submit" className="btn btn--green wb-form__submit" disabled={status.loading}>
                  {status.loading ? (ar ? 'جاري الإرسال…' : 'Submitting…') : (ar ? 'إرسال البلاغ' : 'Submit Report')}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
