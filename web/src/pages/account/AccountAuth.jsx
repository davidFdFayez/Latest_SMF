import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import PageHero from '../../components/PageHero';
import { activate, checkInvite, getToken, login, messageOf, safeReturnPath } from '../../api/member';

/**
 * Signing in, and taking up an invitation — Phase 3 REQ-05 rule 2.
 *
 * One file for both because they are the same page with one difference: an
 * invitation already knows who you are and asks you to choose a password,
 * while signing in asks for both.
 */

export function AccountLogin() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Where the visitor was when sign-in was asked of them — a tournament's
  // details page, say — so they land back there rather than losing it.
  const next = safeReturnPath(params.get('next'));
  const expired = params.get('expired') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) navigate(next, { replace: true });
  }, [navigate, next]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر تسجيل الدخول.' : 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* The same hero and white content area as the registration pages. */}
      <PageHero
        title={ar ? 'تسجيل الدخول' : 'Login'}
        breadcrumb={[{ label: ar ? 'تسجيل الدخول' : 'Login' }]}
      />

      <section className="section section--white">
        <div className="container container--narrow">
          {/* The registration form's own card — border, radius, shadow and
              padding — at a width suited to two fields. */}
          <div className="regw acct-login">
            <div className="regw__body">
            <h2 className="acct-login__title">{ar ? 'تسجيل الدخول' : 'Login'}</h2>
            <form className="acct-form" onSubmit={submit}>
              {expired && !error && (
                <p className="acct-note acct-note--info" role="status">
                  {ar ? 'انتهت جلستك. سجّل الدخول مرة أخرى للمتابعة.' : 'Your session has ended. Log in again to continue.'}
                </p>
              )}
              {error && <p className="acct-error" role="alert">{error}</p>}

              <label className="acct-field">
                <span>{ar ? 'البريد الإلكتروني' : 'Email'}</span>
                <input type="email" dir="ltr" value={email} required autoComplete="email"
                       onChange={(event) => setEmail(event.target.value)} />
              </label>

              <label className="acct-field">
                <span>{ar ? 'كلمة المرور' : 'Password'}</span>
                <input type="password" value={password} required autoComplete="current-password"
                       onChange={(event) => setPassword(event.target.value)} />
              </label>

              <button type="submit" className="btn btn--green acct-submit" disabled={busy}>
                {busy ? (ar ? 'جارٍ تسجيل الدخول…' : 'Logging in…') : (ar ? 'تسجيل الدخول' : 'Login')}
              </button>

              {/* The existing registration area, with its athlete, club, coach and
                  referee choices — not a second way to register. */}
              <p className="acct-note">
                {ar ? 'ليس لديك حساب؟ ' : "Don't have an account? "}
                <Link to="/registration">{ar ? 'سجل الآن' : 'Register now'}</Link>
              </p>
            </form>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function AccountActivate() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [state, setState] = useState({ loading: true, valid: false, email: '' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkInvite(token)
      .then((data) => !cancelled && setState({ loading: false, valid: data.valid, email: data.email }))
      .catch(() => !cancelled && setState({ loading: false, valid: false, email: '' }));
    return () => { cancelled = true; };
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (password !== confirm) {
      setError(ar ? 'كلمتا المرور غير متطابقتين.' : 'The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await activate(token, password);
      navigate('/account', { replace: true });
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر تفعيل الحساب.' : 'Could not activate the account.'));
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) {
    return <Shell title={ar ? 'جارٍ التحقق…' : 'Checking…'}><div /></Shell>;
  }

  if (!state.valid) {
    return (
      <Shell title={ar ? 'رابط غير صالح' : 'That link is not valid'}
             subtitle={ar
               ? 'قد يكون الرابط منتهيًا أو تم استخدامه. اطلب دعوة جديدة من ناديك أو من الاتحاد.'
               : 'It may have expired or already been used. Ask your club or the federation for a new one.'}>
        <Link to="/account/login" className="btn btn--outline">
          {ar ? 'الذهاب لتسجيل الدخول' : 'Go to sign-in'}
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title={ar ? 'تفعيل الحساب' : 'Activate your account'}
           subtitle={`${ar ? 'الحساب' : 'Account'}: ${state.email}`}>
      <form className="acct-form" onSubmit={submit}>
        {error && <p className="acct-error" role="alert">{error}</p>}

        <label className="acct-field">
          <span>{ar ? 'كلمة المرور' : 'Password'}</span>
          <input type="password" value={password} minLength={8} required
                 onChange={(event) => setPassword(event.target.value)} />
          <span className="acct-hint">
            {ar
              ? '٨ أحرف على الأقل، وتحتوي على حرف ورقم.'
              : 'At least 8 characters, including a letter and a digit.'}
          </span>
        </label>

        <label className="acct-field">
          <span>{ar ? 'تأكيد كلمة المرور' : 'Confirm password'}</span>
          <input type="password" value={confirm} minLength={8} required
                 onChange={(event) => setConfirm(event.target.value)} />
        </label>

        <button type="submit" className="btn btn--green acct-submit" disabled={busy}>
          {busy ? (ar ? 'جارٍ التفعيل…' : 'Activating…') : (ar ? 'تفعيل الحساب' : 'Activate')}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ title, subtitle, children }) {
  return (
    <section className="acct-page">
      <div className="acct-card">
        <img className="acct-crest" src="/assets/images/logo.png" alt="" />
        <h1 className="acct-title">{title}</h1>
        {subtitle && <p className="acct-sub">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
