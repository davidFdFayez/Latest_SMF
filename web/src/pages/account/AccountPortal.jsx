import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { formatDate } from '../../utils/format';
import {
  enter,
  fetchEligible,
  fetchMe,
  fetchMedical,
  fetchRoster,
  fetchTournaments,
  getToken,
  invite,
  messageOf,
  proposeChange,
  saveMedical,
  signOut,
} from '../../api/member';

/**
 * The portal — Phase 3 REQ-05, REQ-06 and REQ-07.
 *
 * One page, three audiences. A club sees its roster and can invite; a coach
 * sees the same roster and cannot; an athlete sees themselves and their
 * medical file. The sections a given account has no business with are not
 * rendered at all, and the API refuses them regardless.
 */

/** The fields an account holder may ask to have changed, in both languages. */
const EDITABLE = [
  { key: 'city', ar: 'المدينة', en: 'City' },
  { key: 'phone', ar: 'رقم الجوال', en: 'Mobile number' },
  { key: 'email', ar: 'البريد الإلكتروني', en: 'Email address' },
  { key: 'clubName', ar: 'النادي', en: 'Club' },
  { key: 'coachName', ar: 'اسم المدرب', en: 'Coach name' },
];

/** Membership statuses, as a member should read them. */
const MEMBERSHIP_STATUS = {
  approved: { ar: 'معتمدة', en: 'Approved' },
  expired: { ar: 'منتهية', en: 'Expired' },
  suspended: { ar: 'موقوفة', en: 'Suspended' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled' },
  under_review: { ar: 'قيد المراجعة', en: 'Under review' },
  new: { ar: 'جديدة', en: 'New' },
};

const TABS = {
  club: ['overview', 'roster', 'tournaments'],
  coach: ['overview', 'roster', 'tournaments'],
  athlete: ['overview', 'medical', 'tournaments'],
};

export default function AccountPortal() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      navigate('/account/login', { replace: true });
      return;
    }

    let cancelled = false;
    fetchMe()
      .then((data) => !cancelled && setMe(data))
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 401) {
          signOut();
          navigate('/account/login', { replace: true });
          return;
        }
        setError(messageOf(err, lang, ar ? 'تعذر تحميل الحساب.' : 'Could not load your account.'));
      })
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, [navigate, lang, ar]);

  if (loading) {
    return <section className="acct-page"><p className="acct-loading">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p></section>;
  }

  if (!me) {
    return <section className="acct-page"><p className="acct-error">{error}</p></section>;
  }

  const tabs = TABS[me.kind] || ['overview'];
  const label = {
    overview: ar ? 'ملفي' : 'My record',
    roster: ar ? 'اللاعبون والمدربون' : 'Athletes & coaches',
    medical: ar ? 'الملف الطبي' : 'Medical file',
    tournaments: ar ? 'البطولات' : 'Tournaments',
  };

  return (
    <section className="portal">
      <header className="portal__head">
        <div>
          <p className="portal__kind">{ar ? me.kindAr : me.kindEn}</p>
          <h1 className="portal__name">
            {(ar ? me.membership.nameAr : me.membership.nameEn) || me.email}
          </h1>
          {me.club && (
            <p className="portal__club">
              {ar ? 'النادي: ' : 'Club: '}
              {(ar ? me.club.nameAr : me.club.nameEn) || me.club.membershipNumber}
            </p>
          )}
        </div>
        <button type="button" className="btn btn--outline"
                onClick={() => { signOut(); navigate('/account/login', { replace: true }); }}>
          {ar ? 'خروج' : 'Sign out'}
        </button>
      </header>

      {error && <p className="acct-error">{error}</p>}

      <nav className="portal__tabs" aria-label={ar ? 'أقسام الحساب' : 'Account sections'}>
        {tabs.map((key) => (
          <button key={key} type="button"
                  className={`portal__tab${tab === key ? ' is-active' : ''}`}
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}>
            {label[key]}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview me={me} ar={ar} lang={lang} />}
      {tab === 'roster' && <Roster ar={ar} lang={lang} />}
      {tab === 'medical' && <Medical ar={ar} lang={lang} />}
      {tab === 'tournaments' && <Tournaments me={me} ar={ar} lang={lang} />}
    </section>
  );
}

/* ── my record, and asking for a change ─────────────────────────────────── */

function Overview({ me, ar, lang }) {
  const [changes, setChanges] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const membership = me.membership;

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    const payload = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => String(value).trim().length > 0),
    );

    if (Object.keys(payload).length === 0) return;

    try {
      const result = await proposeChange(payload);
      setNotice(ar ? result.messageAr : result.messageEn);
      setChanges({});
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر إرسال التعديل.' : 'Could not send the change.'));
    }
  }

  return (
    <div className="portal__panel">
      <dl className="portal__facts">
        <Fact label={ar ? 'رقم العضوية' : 'Membership number'} value={membership.membershipNumber} />
        <Fact label={ar ? 'الرقم المرجعي' : 'Reference'} value={membership.referenceNumber} />
        <Fact
          label={ar ? 'الحالة' : 'Status'}
          value={
            MEMBERSHIP_STATUS[membership.status]
              ? (ar ? MEMBERSHIP_STATUS[membership.status].ar : MEMBERSHIP_STATUS[membership.status].en)
              : membership.status
          }
        />
        <Fact label={ar ? 'سارية حتى' : 'Valid until'}
              value={membership.expiresAt ? formatDate(membership.expiresAt, lang) : '—'} />
        <Fact label={ar ? 'الأيام المتبقية' : 'Days remaining'}
              value={membership.isExpired ? '0' : String(membership.daysRemaining ?? '—')} />
      </dl>

      <h2 className="portal__h2">{ar ? 'طلب تعديل البيانات' : 'Ask for a change'}</h2>
      <p className="portal__note">
        {ar
          ? 'أي تعديل بعد إنشاء الحساب لا يُعتمد إلا بعد موافقة الاتحاد. بيانات الهوية وتاريخ الميلاد لا تُعدّل من هنا.'
          : 'Anything you change here waits for the federation to approve it. Identity details and date of birth cannot be changed from an account.'}
      </p>

      {notice && <p className="acct-ok">{notice}</p>}
      {error && <p className="acct-error">{error}</p>}

      <form className="portal__form" onSubmit={submit}>
        {EDITABLE.map((field) => (
          <label className="acct-field" key={field.key}>
            <span>{ar ? field.ar : field.en}</span>
            <input
              type="text"
              dir={field.key === 'email' || field.key === 'phone' ? 'ltr' : undefined}
              value={changes[field.key] || ''}
              onChange={(event) => setChanges({ ...changes, [field.key]: event.target.value })}
            />
          </label>
        ))}
        <button type="submit" className="btn btn--green">
          {ar ? 'إرسال للمراجعة' : 'Send for review'}
        </button>
      </form>
    </div>
  );
}

/* ── the club's and coach's roster ──────────────────────────────────────── */

function Roster({ ar, lang }) {
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState('athlete');
  const [registrationId, setRegistrationId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    fetchRoster()
      .then(setData)
      .catch((err) => setError(messageOf(err, lang, ar ? 'تعذر التحميل.' : 'Could not load.')));
  }, [ar, lang]);

  useEffect(load, [load]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const result = await invite({
        email: email.trim(),
        kind,
        registrationId: Number(registrationId),
      });
      setNotice(result.alreadyExisted
        ? (ar ? 'تمت الإضافة مباشرة — الحساب موجود ومفعّل.' : 'Added directly — that account already exists.')
        : (ar ? 'تم إرسال الدعوة.' : 'Invitation sent.'));
      setEmail('');
      setRegistrationId('');
      load();
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذرت الإضافة.' : 'Could not add them.'));
    }
  }

  if (!data) return <div className="portal__panel">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>;

  return (
    <div className="portal__panel">
      {error && <p className="acct-error">{error}</p>}
      {notice && <p className="acct-ok">{notice}</p>}

      <h2 className="portal__h2">{ar ? 'اللاعبون' : 'Athletes'} ({data.athletes.length})</h2>
      <People list={data.athletes} ar={ar} />

      <h2 className="portal__h2">{ar ? 'المدربون' : 'Coaches'} ({data.coaches.length})</h2>
      <People list={data.coaches} ar={ar} />

      {data.canInvite ? (
        <>
          <h2 className="portal__h2">{ar ? 'إضافة لاعب أو مدرب' : 'Add an athlete or a coach'}</h2>
          <p className="portal__note">
            {ar
              ? 'بالبريد الإلكتروني. إن كان له حساب مفعّل تتم الإضافة مباشرة، وإلا تصله دعوة ويظهر كطلب معلّق.'
              : 'By email address. If they already have an active account they are added straight away; otherwise an invitation goes out and they show as pending.'}
          </p>
          <form className="portal__form" onSubmit={submit}>
            <label className="acct-field">
              <span>{ar ? 'البريد الإلكتروني' : 'Email address'}</span>
              <input type="email" dir="ltr" value={email} required
                     onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="acct-field">
              <span>{ar ? 'النوع' : 'Kind'}</span>
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="athlete">{ar ? 'لاعب' : 'Athlete'}</option>
                <option value="coach">{ar ? 'مدرب' : 'Coach'}</option>
              </select>
            </label>
            <label className="acct-field">
              <span>{ar ? 'رقم سجل العضوية' : 'Membership record number'}</span>
              <input type="number" dir="ltr" value={registrationId} required
                     onChange={(event) => setRegistrationId(event.target.value)} />
              <span className="acct-hint">
                {ar
                  ? 'رقم السجل لدى الاتحاد، ويظهر في بطاقة العضوية.'
                  : 'The federation record number, shown on their membership card.'}
              </span>
            </label>
            <button type="submit" className="btn btn--green">{ar ? 'إضافة' : 'Add'}</button>
          </form>
        </>
      ) : (
        <p className="portal__note">
          {ar
            ? 'إضافة اللاعبين والمدربين من صلاحية النادي.'
            : 'Adding athletes and coaches is the club’s to do.'}
        </p>
      )}
    </div>
  );
}

function People({ list, ar }) {
  if (list.length === 0) {
    return <p className="portal__note">{ar ? 'لا أحد بعد.' : 'Nobody yet.'}</p>;
  }

  return (
    <ul className="portal__people">
      {list.map((person) => (
        <li key={person.id} className="portal__person">
          <span className="portal__person-name">
            {(ar ? person.nameAr : person.nameEn) || person.displayName || person.email}
          </span>
          <span className="portal__person-meta">{person.membershipNumber || person.email}</span>
          {person.isPending && (
            <span className="portal__pending">{ar ? 'دعوة معلّقة' : 'Invitation pending'}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── the athlete's medical file (REQ-04) ────────────────────────────────── */

function Medical({ ar, lang }) {
  const [file, setFile] = useState(null);
  const [answers, setAnswers] = useState({});
  const [medications, setMedications] = useState('');
  const [declarations, setDeclarations] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMedical()
      .then((data) => {
        setFile(data);
        setAnswers(Object.fromEntries(
          data.questions.filter((q) => q.answer !== null).map((q) => [q.key, q.answer]),
        ));
        setMedications(data.medications || '');
        setDeclarations(Object.fromEntries(data.declarations.map((d) => [d.key, d.accepted])));
      })
      .catch((err) => setError(messageOf(err, lang, ar ? 'تعذر التحميل.' : 'Could not load.')));
  }, [ar, lang]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const updated = await saveMedical({
        healthAnswers: answers,
        medications: medications || null,
        declarations,
      });
      setFile(updated);
      setNotice(ar ? 'تم الحفظ.' : 'Saved.');
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر الحفظ.' : 'Could not save.'));
    }
  }

  if (!file) return <div className="portal__panel">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>;

  return (
    <div className="portal__panel">
      {/* Rule 6, in the federation's own words. */}
      <p className="portal__notice">{ar ? file.noticeAr : file.noticeEn}</p>

      {file.missing.length > 0 && (
        <p className="portal__missing">
          <strong>{ar ? 'ناقص: ' : 'Still missing: '}</strong>
          {file.missing.map((m) => (ar ? m.ar : m.en)).join('، ')}
        </p>
      )}

      {file.hasPendingChange && (
        <p className="portal__pending-note">
          {ar
            ? 'هناك تحديث على المستندات بانتظار اعتماد الاتحاد.'
            : 'A document update is waiting for the federation to approve it.'}
        </p>
      )}

      {notice && <p className="acct-ok">{notice}</p>}
      {error && <p className="acct-error">{error}</p>}

      <form className="portal__form portal__form--wide" onSubmit={submit}>
        <h2 className="portal__h2">{ar ? 'الأسئلة الصحية' : 'Health questions'}</h2>
        {file.questions.map((question) => (
          <div className="portal__question" key={question.key}>
            <p>{ar ? question.Ar || question.ar : question.En || question.en}</p>
            <div className="portal__yesno">
              {[true, false].map((value) => (
                <label key={String(value)}>
                  <input type="radio" name={question.key}
                         checked={answers[question.key] === value}
                         onChange={() => setAnswers({ ...answers, [question.key]: value })} />
                  <span>{value ? (ar ? 'نعم' : 'Yes') : (ar ? 'لا' : 'No')}</span>
                </label>
              ))}
            </div>
            {question.asksForDetail && answers[question.key] === true && (
              <input type="text" className="portal__detail"
                     placeholder={ar ? 'اسم الدواء / تفاصيله' : 'Name of the medicine'}
                     value={medications}
                     onChange={(event) => setMedications(event.target.value)} />
            )}
          </div>
        ))}

        {file.declarationsApply && (
          <>
            <h2 className="portal__h2">{ar ? 'الإقرارات والموافقات' : 'Declarations and consents'}</h2>
            {file.declarations.map((declaration) => (
              <label className="portal__declaration" key={declaration.key}>
                <input type="checkbox"
                       checked={Boolean(declarations[declaration.key])}
                       onChange={(event) =>
                         setDeclarations({ ...declarations, [declaration.key]: event.target.checked })} />
                <span>{ar ? declaration.Ar || declaration.ar : declaration.En || declaration.en}</span>
              </label>
            ))}
          </>
        )}

        <button type="submit" className="btn btn--green">{ar ? 'حفظ' : 'Save'}</button>
      </form>
    </div>
  );
}

/* ── tournaments ────────────────────────────────────────────────────────── */

function Tournaments({ me, ar, lang }) {
  const [list, setList] = useState(null);
  const [openFor, setOpenFor] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    fetchTournaments()
      .then(setList)
      .catch((err) => setError(messageOf(err, lang, ar ? 'تعذر التحميل.' : 'Could not load.')));
  }, [ar, lang]);

  useEffect(load, [load]);

  async function open(tournament) {
    setError('');
    setNotice('');
    setOpenFor(tournament);
    try {
      setCandidates(await fetchEligible(tournament.id));
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر التحميل.' : 'Could not load.'));
    }
  }

  async function submit(athlete, divisionId) {
    setError('');
    setNotice('');
    try {
      await enter(openFor.id, { athleteRegistrationId: athlete.registrationId, divisionId });
      setNotice(ar ? 'تم التسجيل.' : 'Entered.');
      setCandidates(await fetchEligible(openFor.id));
      load();
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر التسجيل.' : 'Could not enter.'));
    }
  }

  if (!list) return <div className="portal__panel">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>;

  return (
    <div className="portal__panel">
      {error && <p className="acct-error">{error}</p>}
      {notice && <p className="acct-ok">{notice}</p>}

      {list.length === 0 && (
        <p className="portal__note">{ar ? 'لا توجد بطولات منشورة.' : 'No tournaments are published.'}</p>
      )}

      {list.map((tournament) => (
        <article className="portal__tournament" key={tournament.id}>
          <div className="portal__tournament-head">
            <div>
              <h2 className="portal__h2">{ar ? tournament.nameAr : tournament.nameEn}</h2>
              <p className="portal__note">
                {formatDate(tournament.startDate, lang)} · {ar ? tournament.locationAr : tournament.locationEn}
                {' · '}
                {tournament.registrationOpen
                  ? (ar ? 'التسجيل مفتوح' : 'Entries open')
                  : (ar ? 'التسجيل مغلق' : 'Entries closed')}
              </p>
            </div>
            {tournament.registrationOpen && (
              <button type="button" className="btn btn--outline" onClick={() => open(tournament)}>
                {me.kind === 'athlete'
                  ? (ar ? 'تسجيل' : 'Enter')
                  : (ar ? 'تسجيل لاعبين' : 'Enter athletes')}
              </button>
            )}
          </div>

          {tournament.ourEntries.length > 0 && (
            <ul className="portal__entries">
              {tournament.ourEntries.map((entry) => (
                <li key={entry.id}>
                  {(ar ? entry.divisionLabelAr : entry.divisionLabelEn) || '—'}
                  {' — '}
                  <strong>{ar ? entry.statusAr : entry.statusEn}</strong>
                </li>
              ))}
            </ul>
          )}

          {openFor?.id === tournament.id && (
            <div className="portal__entering">
              {candidates.map((athlete) => (
                <div className="portal__candidate" key={athlete.registrationId}>
                  <span className="portal__person-name">
                    {(ar ? athlete.nameAr : athlete.nameEn) || athlete.membershipNumber}
                  </span>

                  {athlete.canEnter ? (
                    <select defaultValue=""
                            onChange={(event) => event.target.value && submit(athlete, Number(event.target.value))}>
                      <option value="">{ar ? 'اختر فئة الوزن…' : 'Choose a weight class…'}</option>
                      {athlete.options.map((option) => (
                        <optgroup key={option.category} label={ar ? option.categoryAr : option.categoryEn}>
                          {option.divisions.map((division) => (
                            <option key={division.divisionId} value={division.divisionId}>
                              {ar ? division.labelAr : division.labelEn}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  ) : (
                    // Say why, rather than quietly hiding them.
                    <span className="portal__barrier">
                      {athlete.barriers.map((b) => (ar ? b.ar : b.en)).join(' ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}
