import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import { submitWhistleblower } from '../api/services';
import { usePageContent, useText } from '../content/useContent';

const ico = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

/* One icon per assurance card, by position; extra cards reuse them in turn. */
const TRUST_ICONS = [
  <svg key="lock" {...ico}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
  <svg key="person" {...ico}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  <svg key="shield" {...ico}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg>,
  <svg key="check" {...ico}><polyline points="20 6 9 17 4 12" /></svg>,
];

export default function Whistleblower() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('whistleblower');
  const tx = useText();

  const [form, setForm] = useState({
    concernType: '',
    description: '',
    name: '',
    phone: '',
    email: '',
  });
  const [status, setStatus] = useState({ loading: false, error: '', reference: '' });
  const [copied, setCopied] = useState(false);
  const successRef = useRef(null);

  /*
   * BUG-13 — the confirmation used to be one unstyled line above a long form,
   * so a reporter who had just scrolled to the bottom to press Submit never saw
   * it and could not tell whether the report had gone anywhere. It is now a
   * modal dialog, and the panel it leaves behind replaces the form, so the
   * reference number cannot be missed or scrolled past.
   */
  useEffect(() => {
    const dialog = successRef.current;
    if (!dialog || !status.reference) return;
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
  }, [status.reference]);

  function closeSuccess() {
    successRef.current?.close();
  }

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(status.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access is blocked in some browsers; the number is on screen
      // either way, so this is not worth an error message.
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setStatus({ loading: true, error: '', reference: '' });

    // The API stores a description plus a single optional-contact string, so the
    // concern type and the individual contact fields are folded into those two.
    const type = (c?.form.concernTypes ?? []).find((t) => t.value === form.concernType);
    const typeLabel = type ? tx(type.label) : '';
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

  if (!c) return fallback;

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'الإبلاغ عن مخالفة' : 'Report a Concern'}</span>
          </nav>
          <h1>{tx(c.header.title)}</h1>
          {tx(c.header.subtitle) && <p>{tx(c.header.subtitle)}</p>}
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="trust-grid">
            {c.trust.map((t, i) => (
              <div className="trust-card" key={`${i}-${t.title?.en ?? ''}`}>
                <div className="trust-card__icon">{TRUST_ICONS[i % TRUST_ICONS.length]}</div>
                <h2>{tx(t.title)}</h2>
                <p>{tx(t.body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.process.label)}</span>
            <h2>{tx(c.process.heading)}</h2>
          </div>

          <div className="wb-process">
            {c.process.items.map((p, i) => (
              <div key={`${p.number}-${i}`} style={{ display: 'contents' }}>
                {i > 0 && <div className="wb-process__connector" />}
                <div className="wb-process__step">
                  <div className="wb-process__num">{p.number}</div>
                  <div className="wb-process__body">
                    <h3>{tx(p.title)}</h3>
                    <p>{tx(p.body)}</p>
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
              <h3>{tx(c.confidentiality.title)}</h3>
              <p>{tx(c.confidentiality.text)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="wb-form-wrapper">
            <div className="wb-form-wrapper__header">
              <h2>{tx(c.form.heading)}</h2>
              {tx(c.form.text) && <p>{tx(c.form.text)}</p>}
            </div>

            <div className="wb-form-card">
              {status.error && (
                <div className="wb-form__error" role="alert">{status.error}</div>
              )}

              {status.reference ? (
                <div className="wb-success" role="status">
                  <span className="wb-success__mark" aria-hidden="true">✓</span>
                  <h3 className="wb-success__title">{tx(c.form.successTitle)}</h3>
                  <p className="wb-success__ref">
                    {tx(c.form.successPrefix)} <strong>{status.reference}</strong>
                  </p>
                  <p className="wb-success__note">{tx(c.form.successNote)}</p>
                  <div className="wb-success__actions">
                    <button type="button" className="btn btn--outline" onClick={copyReference}>
                      {copied
                        ? ar ? 'تم النسخ' : 'Copied'
                        : ar ? 'نسخ الرقم المرجعي' : 'Copy reference'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--green"
                      onClick={() => setStatus({ loading: false, error: '', reference: '' })}
                    >
                      {ar ? 'إرسال بلاغ آخر' : 'Submit another report'}
                    </button>
                  </div>
                </div>
              ) : (
              <form className="wb-form" onSubmit={onSubmit}>
                <div className="wb-form__field">
                  <label htmlFor="wb-concern-type">
                    {tx(c.form.concernTypeLabel)}
                    <span className="wb-form__required">*</span>
                  </label>
                  <select
                    id="wb-concern-type"
                    name="concern_type"
                    required
                    value={form.concernType}
                    onChange={set('concernType')}
                  >
                    <option value="">{tx(c.form.concernTypePlaceholder)}</option>
                    {c.form.concernTypes.map((t, i) => (
                      <option key={`${t.value}-${i}`} value={t.value}>{tx(t.label)}</option>
                    ))}
                  </select>
                </div>

                <div className="wb-form__field">
                  <label htmlFor="wb-description">
                    {tx(c.form.descriptionLabel)}
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
                  {tx(c.form.descriptionHint) && (
                    <span className="wb-form__hint">{tx(c.form.descriptionHint)}</span>
                  )}
                </div>

                <div className="wb-form__divider">
                  <span>{tx(c.form.contactDivider)}</span>
                </div>
                {tx(c.form.contactNote) && (
                  <p className="wb-form__divider-note">{tx(c.form.contactNote)}</p>
                )}

                <div className="wb-form__row">
                  <div className="wb-form__field">
                    <label htmlFor="wb-name">{tx(c.form.nameLabel)}</label>
                    <input id="wb-name" name="reporter_name" type="text" value={form.name} onChange={set('name')} />
                  </div>
                  <div className="wb-form__field">
                    <label htmlFor="wb-phone">{tx(c.form.phoneLabel)}</label>
                    <input id="wb-phone" name="reporter_phone" type="tel" value={form.phone} onChange={set('phone')} />
                  </div>
                </div>

                <div className="wb-form__field">
                  <label htmlFor="wb-email">{tx(c.form.emailLabel)}</label>
                  <input id="wb-email" name="reporter_email" type="email" value={form.email} onChange={set('email')} />
                  {tx(c.form.emailHint) && (
                    <span className="wb-form__hint">{tx(c.form.emailHint)}</span>
                  )}
                </div>

                <button type="submit" className="btn btn--green wb-form__submit" disabled={status.loading}>
                  {status.loading ? (ar ? 'جاري الإرسال…' : 'Submitting…') : tx(c.form.submitLabel)}
                </button>
              </form>
              )}
            </div>

            {/* BUG-13 — the popup the client asked for. It is a native <dialog>,
                so the browser traps focus, Escape closes it, and the page behind
                is inert while it is open. The panel above stays afterwards. */}
            <dialog className="wb-dialog" ref={successRef} onClose={() => setCopied(false)}>
              <div className="wb-dialog__body">
                <span className="wb-dialog__mark" aria-hidden="true">✓</span>
                <h2 className="wb-dialog__title">{tx(c.form.successTitle)}</h2>
                <p className="wb-dialog__ref">
                  {tx(c.form.successPrefix)} <strong>{status.reference}</strong>
                </p>
                <p className="wb-dialog__note">{tx(c.form.successNote)}</p>
                <div className="wb-dialog__actions">
                  <button type="button" className="btn btn--outline" onClick={copyReference}>
                    {copied
                      ? ar ? 'تم النسخ' : 'Copied'
                      : ar ? 'نسخ الرقم المرجعي' : 'Copy reference'}
                  </button>
                  <button type="button" className="btn btn--green" onClick={closeSuccess} autoFocus>
                    {tx(c.form.successCloseLabel)}
                  </button>
                </div>
              </div>
            </dialog>
          </div>
        </div>
      </section>
    </>
  );
}
