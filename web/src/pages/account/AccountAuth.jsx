import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { activate, checkInvite, getToken, login, messageOf } from '../../api/member';

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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) navigate('/account', { replace: true });
  }, [navigate]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/account', { replace: true });
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر تسجيل الدخول.' : 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={ar ? 'دخول المنتسبين' : 'Member sign-in'}
           subtitle={ar
             ? 'للأندية والمدربين واللاعبين المسجلين لدى الاتحاد.'
             : 'For clubs, coaches and athletes registered with the federation.'}>
      <form className="acct-form" onSubmit={submit}>
        {error && <p className="acct-error" role="alert">{error}</p>}

        <label className="acct-field">
          <span>{ar ? 'البريد الإلكتروني' : 'Email address'}</span>
          <input type="email" dir="ltr" value={email} required
                 onChange={(event) => setEmail(event.target.value)} />
        </label>

        <label className="acct-field">
          <span>{ar ? 'كلمة المرور' : 'Password'}</span>
          <input type="password" value={password} required
                 onChange={(event) => setPassword(event.target.value)} />
        </label>

        <button type="submit" className="btn btn--green acct-submit" disabled={busy}>
          {busy ? (ar ? 'جارٍ الدخول…' : 'Signing in…') : (ar ? 'دخول' : 'Sign in')}
        </button>

        <p className="acct-note">
          {ar
            ? 'الحسابات تُنشأ بدعوة من الاتحاد أو من النادي. إن لم تصلك دعوة، راجع ناديك.'
            : 'Accounts are created by invitation from the federation or your club. If you have not had one, ask your club.'}
        </p>
      </form>
    </Shell>
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
