import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import { submitContact } from '../api/services';
import { WHATSAPP_COMMUNITY, WHATSAPP_DIRECT } from '../data/socialLinks';

const ico = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const IconMail = () => <svg {...ico}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>;
const IconPhone = () => <svg {...ico}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.1 1.22 2 2 0 012.1 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>;
const IconPin = () => <svg {...ico}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IconClock = () => <svg {...ico}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
const IconGlobe = () => <svg {...ico}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>;
const IconWa = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const EMAIL = 'info@saudimuaythai.sa';
const PHONE_DISPLAY = '+966 55 267 7377';
const PHONE_TEL = '+966552677377';
const WA = WHATSAPP_DIRECT;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Contact() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState({ loading: false, error: '', ok: false });
  const [errors, setErrors] = useState({});

  function update(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    // UX-01 — the success banner used to survive every later interaction, so
    // an empty form could sit under "Message sent successfully". Editing the
    // form clears the previous outcome.
    setStatus((s) => (s.ok || s.error ? { ...s, ok: false, error: '' } : s));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  /** UX-01 — the same required fields the API enforces (see ContactEndpoints). */
  function validate() {
    const found = {};
    if (form.name.trim().length < 2) found.name = ar ? 'الاسم مطلوب.' : 'Your name is required.';
    if (!EMAIL_PATTERN.test(form.email.trim()))
      found.email = ar ? 'يرجى إدخال بريد إلكتروني صحيح.' : 'Please enter a valid email address.';
    if (form.message.trim().length < 5)
      found.message = ar ? 'الرسالة مطلوبة.' : 'A message is required.';
    return found;
  }

  async function onSubmit(e) {
    e.preventDefault();

    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setStatus({ loading: false, error: '', ok: false });
      return;
    }

    setErrors({});
    setStatus({ loading: true, error: '', ok: false });
    try {
      await submitContact(form);
      // Only now — after the API has accepted it — is the message actually sent.
      setStatus({ loading: false, error: '', ok: true });
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      const data = err?.response?.data;
      if (data?.errors && typeof data.errors === 'object') {
        setErrors(
          Object.fromEntries(
            Object.entries(data.errors).map(([field, message]) => [
              field,
              typeof message === 'string' ? message : (ar ? message?.ar : message?.en) || '',
            ]),
          ),
        );
      }
      setStatus({
        loading: false,
        error:
          (ar ? data?.messageAr : data?.messageEn) ||
          data?.message ||
          (ar ? 'تعذر الإرسال' : 'Submit failed'),
        ok: false,
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
            <span>{ar ? 'تواصل معنا' : 'Contact'}</span>
          </nav>
          <h1>{ar ? 'تواصل معنا' : 'Contact Us'}</h1>
          <p>
            {ar
              ? 'يسعدنا تواصلكم مع الاتحاد السعودي للملاكمة التايلندية. فريقنا جاهز للإجابة عن استفساراتكم.'
              : 'We welcome your enquiries. Our team is ready to respond to your questions and feedback.'}
          </p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="contact-grid">
            <div>
              <h2>{ar ? 'بيانات التواصل' : 'Contact Information'}</h2>

              <div className="contact-info-card">
                <div className="contact-info-item">
                  <div className="contact-info-item__icon" aria-hidden="true"><IconMail /></div>
                  <div>
                    <div className="contact-info-item__label">{ar ? 'البريد الإلكتروني' : 'Email'}</div>
                    <div className="contact-info-item__value">
                      <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
                    </div>
                  </div>
                </div>

                <div className="contact-info-item">
                  <div className="contact-info-item__icon" aria-hidden="true"><IconPhone /></div>
                  <div>
                    <div className="contact-info-item__label">{ar ? 'هاتف' : 'Phone'}</div>
                    <div className="contact-info-item__value">
                      <a href={`tel:${PHONE_TEL}`} dir="ltr">{PHONE_DISPLAY}</a>
                    </div>
                  </div>
                </div>

                <div className="contact-info-item">
                  <div className="contact-info-item__icon contact-info-item__icon--whatsapp" aria-hidden="true"><IconWa /></div>
                  <div>
                    <div className="contact-info-item__label">WhatsApp</div>
                    <div className="contact-info-item__value">
                      <a href={WA} target="_blank" rel="noopener noreferrer" dir="ltr">{PHONE_DISPLAY}</a>
                    </div>
                  </div>
                </div>

                <div className="contact-info-item">
                  <div className="contact-info-item__icon contact-info-item__icon--whatsapp" aria-hidden="true"><IconWa /></div>
                  <div>
                    <div className="contact-info-item__label">{ar ? 'مجتمع واتساب' : 'WhatsApp Community'}</div>
                    <div className="contact-info-item__value">
                      {/* CNT-05 — the community is live; this was a placeholder. */}
                      <a href={WHATSAPP_COMMUNITY} target="_blank" rel="noopener noreferrer">
                        {ar ? 'انضم إلى مجتمع الاتحاد' : 'Join the SMF community'}
                      </a>
                    </div>
                  </div>
                </div>

                <div className="contact-info-item">
                  <div className="contact-info-item__icon" aria-hidden="true"><IconPin /></div>
                  <div>
                    <div className="contact-info-item__label">{ar ? 'العنوان' : 'Location'}</div>
                    <div className="contact-info-item__value">
                      {ar
                        ? 'الرياض، حي الرفيعة، شارع الديوان، مجمع الأمير فيصل بن فهد الأولمبي'
                        : 'Riyadh, Al Rafiah District, Al Diwan St., Prince Faisal bin Fahd Olympic Complex'}
                    </div>
                  </div>
                </div>

                <div className="contact-info-item">
                  <div className="contact-info-item__icon" aria-hidden="true"><IconClock /></div>
                  <div>
                    <div className="contact-info-item__label">{ar ? 'ساعات العمل' : 'Working Hours'}</div>
                    <div className="contact-info-item__value">
                      {ar ? 'من الساعة 10 ص وحتى الساعة 6 م' : '10:00 AM – 6:00 PM'}
                    </div>
                  </div>
                </div>

                <div className="contact-info-item">
                  <div className="contact-info-item__icon" aria-hidden="true"><IconGlobe /></div>
                  <div>
                    <div className="contact-info-item__label">{ar ? 'الموقع الإلكتروني' : 'Website'}</div>
                    <div className="contact-info-item__value">www.saudimuaythai.sa</div>
                  </div>
                </div>
              </div>

              <div>
                <p>
                  {ar
                    ? 'لمعرفة آخر الأخبار والفعاليات والإنجازات، تابعونا على منصات التواصل الاجتماعي عبر حسابات الاتحاد الرسمية.'
                    : 'Follow us on our official social media channels to stay updated on the latest news, events, and achievements.'}
                </p>
              </div>
            </div>

            <div>
              <h2>{ar ? 'أرسل رسالتك' : 'Send a Message'}</h2>

              {status.ok && (
                <div className="contact-form__success" role="status">
                  {ar ? 'تم إرسال رسالتك بنجاح' : 'Message sent successfully'}
                </div>
              )}
              {status.error && (
                <div className="contact-form__error" role="alert">{status.error}</div>
              )}

              <form className="contact-form" noValidate onSubmit={onSubmit}>
                <div className="contact-form__field">
                  <label htmlFor="contact-name">
                    {ar ? 'الاسم' : 'Your Name'} <span>*</span>
                  </label>
                  <input
                    id="contact-name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={update}
                    aria-invalid={errors.name ? 'true' : undefined}
                    aria-describedby={errors.name ? 'contact-name-error' : undefined}
                  />
                  {errors.name && <span className="contact-form__field-error" id="contact-name-error" role="alert">{errors.name}</span>}
                </div>

                <div className="contact-form__field">
                  <label htmlFor="contact-email">
                    {ar ? 'البريد الإلكتروني' : 'Your Email'} <span>*</span>
                  </label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={update}
                    aria-invalid={errors.email ? 'true' : undefined}
                    aria-describedby={errors.email ? 'contact-email-error' : undefined}
                  />
                  {errors.email && <span className="contact-form__field-error" id="contact-email-error" role="alert">{errors.email}</span>}
                </div>

                <div className="contact-form__field">
                  <label htmlFor="contact-subject">{ar ? 'الموضوع' : 'Subject'}</label>
                  <input id="contact-subject" name="subject" type="text" value={form.subject} onChange={update} />
                  {errors.subject && <span className="contact-form__field-error" role="alert">{errors.subject}</span>}
                </div>

                <div className="contact-form__field">
                  <label htmlFor="contact-message">
                    {ar ? 'رسالتك' : 'Your Message'} <span>*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    rows={6}
                    value={form.message}
                    onChange={update}
                    aria-invalid={errors.message ? 'true' : undefined}
                    aria-describedby={errors.message ? 'contact-message-error' : undefined}
                  />
                  {errors.message && <span className="contact-form__field-error" id="contact-message-error" role="alert">{errors.message}</span>}
                </div>

                <button type="submit" className="btn btn--green" disabled={status.loading}>
                  {status.loading ? (ar ? 'جاري الإرسال…' : 'Sending…') : (ar ? 'إرسال الرسالة' : 'Send Message')}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <Link to="/whistleblower" className="btn btn--outline">{ar ? 'الإبلاغ عن مخالفة' : 'Report a Concern'}</Link>
        </div>
      </section>
    </>
  );
}
