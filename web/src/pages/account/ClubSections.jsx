import { useEffect, useMemo, useRef, useState } from 'react';
import {
  answerInvitation, cancelClubInvitation, cancelInvitation, invite, messageOf, proposeChange,
  refreshNotices, removeFromClub,
} from '../../api/member';
import { FIELDS, categoryLabel, weightRangeFor } from '../../data/registrationPortal';
import { formatDate, toLatinDigits } from '../../utils/format';
import { IconPerson, IconPhone } from '../../components/icons/Icons';
import {
  IconBuilding, IconCoach, IconGlove, IconInfo, IconMail, IconMedal, IconPlayers,
} from '../../components/icons/AccountIcons';
import { Avatar, Empty, Modal, Pill, SectionTitle } from './clubParts';
import { genderLabel, memberStatus, personName } from './clubFormat';

/* ── Players and Coaches: one visual roster, two kinds ──────────────────── */

const KIND_TEXT = {
  athlete: {
    title: { ar: 'اللاعبون', en: 'Players' },
    add: { ar: 'إضافة لاعب', en: 'Add player' },
    email: { ar: 'البريد الإلكتروني للاعب', en: "Player's email" },
    empty: { ar: 'لا يوجد لاعبون مرتبطون بالنادي بعد.', en: 'No players are linked to the club yet.' },
    Icon: IconPlayers,
  },
  coach: {
    title: { ar: 'المدربون', en: 'Coaches' },
    add: { ar: 'إضافة مدرب', en: 'Add coach' },
    email: { ar: 'البريد الإلكتروني للمدرب', en: "Coach's email" },
    empty: { ar: 'لا يوجد مدربون مرتبطون بالنادي بعد.', en: 'No coaches are linked to the club yet.' },
    Icon: IconCoach,
  },
};

/**
 * A visual roster. The club manages it — adding people by invitation; with
 * readOnly (a coach looking at their club's players) it is only shown.
 */
export function RosterSection({
  kind, people, ar, lang, onChanged, readOnly = false, note, emptyText, pendingInvites = [],
}) {
  const text = KIND_TEXT[kind];
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const t = (pair) => (ar ? pair.ar : pair.en);

  /* An invitation not yet taken up is withdrawn — a different thing from
     letting go of someone who is on the roster. */
  async function withdraw(cancel) {
    setNotice('');
    setError('');
    try {
      await cancel();
      setNotice(ar ? 'أُلغيت الدعوة.' : 'Invitation cancelled.');
      onChanged();
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر إلغاء الدعوة.' : 'Could not cancel the invitation.'));
    }
  }

  return (
    <>
      <SectionTitle
        Icon={text.Icon}
        title={t(text.title)}
        note={note}
        action={!readOnly && (
          <button type="button" className="btn btn--green club-add" onClick={() => { setNotice(''); setAdding(true); }}>
            + {t(text.add)}
          </button>
        )}
      />

      {notice && <p className="club-notice" role="status">{notice}</p>}
      {error && <p className="acct-error" role="alert">{error}</p>}

      {people === null ? (
        <p className="club-dash__loading">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : people.length === 0 && pendingInvites.length === 0 ? (
        <Empty Icon={text.Icon} text={emptyText || t(text.empty)} />
      ) : (
        <ul className="club-roster">
          {people.map((person) => {
            const status = memberStatus(person, ar);
            const meta = kind === 'athlete'
              ? [genderLabel(person.gender, ar), person.category ? categoryLabel(person.category, ar) : '']
              : [
                  person.coach?.coachingLevel,
                  person.coach?.yearsExperience
                    ? (ar ? `${toLatinDigits(person.coach.yearsExperience)} سنوات خبرة` : `${person.coach.yearsExperience} years' experience`)
                    : '',
                ];
            return (
              <li className="club-person" key={person.id}>
                <Avatar url={person.photoUrl} size="lg" />
                <div className="club-person__body">
                  <strong className="club-person__name">{personName(person, ar)}</strong>
                  <span className="club-person__meta">{meta.filter(Boolean).join(' · ') || '—'}</span>
                  {kind === 'coach' && person.coach?.categoriesCoached && (
                    <span className="club-person__meta">{person.coach.categoriesCoached}</span>
                  )}
                  <Pill tone={status.tone}>{status.label}</Pill>
                </div>
                {!readOnly && (
                  person.isPending && kind === 'athlete' ? (
                    <PersonMenu ar={ar} label={ar ? 'إلغاء الدعوة' : 'Cancel invitation'}
                                onPick={() => withdraw(() => cancelInvitation(person.id))} />
                  ) : (
                    <PersonMenu ar={ar} danger label={ar ? 'إزالة من النادي' : 'Remove from Club'}
                                onPick={() => { setNotice(''); setError(''); setRemoving(person); }} />
                  )
                )}
              </li>
            );
          })}
          {/* Invited and not yet answered: not one of the club's people yet. */}
          {pendingInvites.map((invitation) => (
            <li className="club-person is-invited" key={`invitation-${invitation.id}`}>
              <Avatar url={invitation.invitee?.photoUrl} size="lg" />
              <div className="club-person__body">
                <strong className="club-person__name">{personName(invitation.invitee || {}, ar)}</strong>
                <span className="club-person__meta">
                  {ar ? `دعوة مرسلة ${formatDate(invitation.createdAt, lang)}` : `Invited ${formatDate(invitation.createdAt, lang)}`}
                </span>
                <Pill tone="pending">
                  {kind === 'athlete'
                    ? (ar ? 'بانتظار قبول اللاعب' : 'Waiting for athlete acceptance')
                    : (ar ? 'بانتظار قبول المدرب' : 'Awaiting the coach')}
                </Pill>
              </div>
              {!readOnly && (
                <PersonMenu ar={ar} label={ar ? 'إلغاء الدعوة' : 'Cancel invitation'}
                            onPick={() => withdraw(() => cancelClubInvitation(invitation.id))} />
              )}
            </li>
          ))}
        </ul>
      )}

      {removing && !readOnly && (
        <RemoveDialog
          kind={kind}
          person={removing}
          ar={ar}
          lang={lang}
          onClose={() => setRemoving(null)}
          onDone={(message) => {
            setRemoving(null);
            setNotice(message);
            onChanged();
          }}
        />
      )}

      {adding && !readOnly && (
        <InviteDialog
          kind={kind}
          ar={ar}
          lang={lang}
          onClose={() => setAdding(false)}
          onDone={(message) => {
            setAdding(false);
            setNotice(message);
            onChanged();
          }}
        />
      )}
    </>
  );
}

/**
 * A card's own quiet menu (⋯): its one action is kept out of sight until
 * asked for, so a roster does not read as a row of red buttons.
 */
function PersonMenu({ ar, label, danger = false, onPick }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (wrap.current && !wrap.current.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="club-person__menu" ref={wrap}>
      <button
        type="button"
        className="club-person__more"
        aria-label={ar ? 'خيارات' : 'Options'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div className="club-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className={`club-menu__item${danger ? ' is-danger' : ''}`}
            onClick={() => { setOpen(false); onPick(); }}
          >
            {label}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Letting a player or coach go, asked once more. What ends is their link to
 * the club; their account and membership stay with the federation.
 */
function RemoveDialog({ kind, person, ar, lang, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = personName(person, ar);
  const coach = kind === 'coach';

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await removeFromClub(person.id);
      onDone(ar ? `أُزيل ${name} من النادي.` : `${name} was removed from the club.`);
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذرت الإزالة.' : 'Could not remove them from the club.'));
      setBusy(false);
    }
  }

  const title = coach
    ? (ar ? 'إزالة المدرب من النادي؟' : 'Remove coach from Club?')
    : (ar ? 'إزالة اللاعب من النادي؟' : 'Remove player from Club?');
  const body = coach
    ? (ar
      ? `سيتم إنهاء ارتباط ${name} بالنادي. لن يتم حذف حساب المدرب أو بياناته من الاتحاد.`
      : `${name}'s link with the Club will end. Their federation account and registration data will not be deleted.`)
    : (ar
      ? `سيتم إزالة ${name} من قائمة لاعبي النادي، ولن يتم حذف حساب اللاعب أو بياناته من الاتحاد.`
      : `${name} will be removed from the Club roster. Their federation account and registration data will not be deleted.`);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="club-form">
        {error && <p className="acct-error" role="alert">{error}</p>}
        <p className="club-modal__text">{body}</p>
        <div className="club-form__actions">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>
            {ar ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="button" className="btn club-danger" onClick={confirm} disabled={busy}>
            {busy ? (ar ? 'جارٍ…' : 'Working…') : (ar ? 'إزالة من النادي' : 'Remove from Club')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Adding someone by email. The invitation is recorded against their approved
 * membership and sent through the site's notification channel — which, until
 * email is connected, writes it to the outbox instead of a mailbox. The
 * person shows here as pending until they take it up.
 */
function InviteDialog({ kind, ar, lang, onClose, onDone }) {
  const text = KIND_TEXT[kind];
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await invite({ email: email.trim(), kind });
      if (result.invitationStatus === 'pending') {
        onDone(kind === 'athlete'
          ? (ar
            ? 'أُرسلت الدعوة للاعب، وسينضم إلى لاعبي النادي بعد أن يقبلها.'
            : 'Invitation sent. The athlete joins the club once they accept it.')
          : (ar
            ? 'أُرسلت الدعوة للمدرب، وسينضم إلى مدربي النادي بعد أن يقبلها.'
            : 'Invitation sent. The coach joins the club once they accept it.'));
        return;
      }
      onDone(result.alreadyExisted
        ? (ar ? 'أُضيف إلى النادي مباشرة لأن لديه حسابًا فعّالًا.' : 'Added to the club straight away — they already have an active account.')
        : (ar ? 'أُرسلت الدعوة، وستبقى قيد الانتظار حتى تُقبل.' : 'Invitation sent. It stays pending until it is accepted.'));
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر إرسال الدعوة.' : 'Could not send the invitation.'));
      setBusy(false);
    }
  }

  return (
    <Modal title={ar ? text.add.ar : text.add.en} onClose={onClose}>
      <form className="club-form" onSubmit={submit}>
        {error && <p className="acct-error" role="alert">{error}</p>}
        <label className="club-field">
          <span>{ar ? text.email.ar : text.email.en}</span>
          <input type="email" dir="ltr" required value={email} autoComplete="off"
                 onChange={(event) => setEmail(event.target.value)} />
        </label>
        <div className="club-form__actions">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>
            {ar ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="submit" className="btn btn--green" disabled={busy || !email.trim()}>
            {busy ? (ar ? 'جارٍ الإرسال…' : 'Sending…') : (ar ? 'إرسال دعوة' : 'Send invitation')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Requests & invitations: a status inbox ───────────────────────────── */

const REQUEST_FILTERS = [
  { key: 'all', ar: 'الكل', en: 'All' },
  { key: 'pending', ar: 'قيد الانتظار', en: 'Pending' },
  { key: 'accepted', ar: 'مقبولة', en: 'Accepted' },
];

/** How each state of a request reads, and the pill it wears. */
const REQUEST_STATUS = {
  pending: { tone: 'pending', ar: 'قيد الانتظار', en: 'Pending' },
  review: { tone: 'pending', ar: 'قيد المراجعة', en: 'Under review' },
  accepted: { tone: 'ok', ar: 'مقبولة', en: 'Accepted' },
  rejected: { tone: 'muted', ar: 'مرفوضة', en: 'Declined' },
  cancelled: { tone: 'muted', ar: 'ملغاة', en: 'Cancelled' },
};

const filterMatches = (filter, status) =>
  filter === 'all' || (filter === 'pending' ? status === 'pending' || status === 'review' : status === filter);

/**
 * The club's requests in one inbox: its invitations to athletes and coaches
 * with their real outcome, members linked before invitations existed, and a
 * change to the club's details awaiting review.
 */
export function RequestsSection({ roster, invitations, profile, ar, lang, onChanged }) {
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);

  const rows = useMemo(() => {
    const invites = (invitations || []).map((invitation) => ({
      key: `invitation-${invitation.id}`,
      id: invitation.id,
      source: 'invitation',
      kind: invitation.kind === 'athlete' ? 'athlete' : 'coach',
      name: invitation.invitee?.nameAr || invitation.invitee?.nameEn ? personName(invitation.invitee, ar) : '',
      email: invitation.invitee?.email,
      date: invitation.respondedAt || invitation.createdAt,
      status: invitation.status,
    }));

    // Members linked before invitations were kept — by the federation, or
    // under the earlier direct link — have no invitation row; they show as
    // they are: accepted, or still waiting on an emailed link.
    const invited = new Set(invites.map((row) => row.email));
    const linked = [
      ...(roster?.athletes || []).map((person) => ['athlete', person]),
      ...(roster?.coaches || []).map((person) => ['coach', person]),
    ]
      .filter(([, person]) => !invited.has(person.email))
      .map(([kind, person]) => ({
        key: `account-${person.id}`,
        id: person.id,
        source: 'account',
        kind,
        name: person.nameAr || person.nameEn ? personName(person, ar) : '',
        email: person.email,
        date: person.inviteSentAt || person.createdAt,
        status: person.isPending ? 'pending' : 'accepted',
      }));

    const list = [...invites, ...linked];
    if (profile?.pending) {
      list.push({
        key: 'club-details',
        kind: 'details',
        name: ar ? 'تعديل بيانات النادي' : 'Club details change',
        email: '',
        date: profile.pending.since,
        status: 'review',
      });
    }
    return list.sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
  }, [roster, invitations, profile, ar]);

  const shown = rows.filter((row) => filterMatches(filter, row.status));

  async function cancel(row) {
    setError('');
    setBusyKey(row.key);
    try {
      if (row.source === 'invitation') await cancelClubInvitation(row.id);
      else await cancelInvitation(row.id);
      refreshNotices();
      onChanged();
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر إلغاء الدعوة.' : 'Could not cancel the invitation.'));
    } finally {
      setBusyKey(null);
    }
  }

  const KIND = {
    athlete: ar ? 'لاعب' : 'Player',
    coach: ar ? 'مدرب' : 'Coach',
    details: ar ? 'بيانات النادي' : 'Club details',
  };

  return (
    <>
      <SectionTitle Icon={IconMail} title={ar ? 'الطلبات والدعوات' : 'Requests & Invitations'} />

      <div className="club-filters" role="tablist">
        {REQUEST_FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={filter === entry.key}
            className={`club-filter${filter === entry.key ? ' is-active' : ''}`}
            onClick={() => setFilter(entry.key)}
          >
            {ar ? entry.ar : entry.en}
            <span className="club-filter__count">
              {toLatinDigits(rows.filter((row) => filterMatches(entry.key, row.status)).length)}
            </span>
          </button>
        ))}
      </div>

      {error && <p className="acct-error" role="alert">{error}</p>}

      {roster === null ? (
        <p className="club-dash__loading">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : shown.length === 0 ? (
        <Empty Icon={IconMail} text={ar ? 'لا توجد طلبات أو دعوات هنا.' : 'There are no requests or invitations here.'} />
      ) : (
        <ul className="club-inbox">
          {shown.map((row) => {
            const status = REQUEST_STATUS[row.status] || REQUEST_STATUS.pending;
            return (
              <li className="club-inbox__row" key={row.key}>
                <span className={`club-inbox__kind club-inbox__kind--${row.kind}`}>
                  {row.kind === 'details' ? <IconBuilding /> : row.kind === 'coach' ? <IconCoach /> : <IconGlove />}
                </span>
                <span className="club-inbox__who">
                  <strong>{row.name || row.email}</strong>
                  {row.name && row.email && <span dir="ltr">{row.email}</span>}
                </span>
                <span className="club-inbox__type">{KIND[row.kind]}</span>
                <span className="club-inbox__date">{row.date ? formatDate(row.date, lang) : '—'}</span>
                <Pill tone={status.tone}>{ar ? status.ar : status.en}</Pill>
                <span className="club-inbox__action">
                  {row.status === 'pending' && row.kind !== 'details' && (
                    <button type="button" className="club-link-btn" disabled={busyKey === row.key} onClick={() => cancel(row)}>
                      {ar ? 'إلغاء الدعوة' : 'Cancel'}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * A coach's or an athlete's own requests: the clubs that have invited them.
 * Answering is done here; the notification bell only brings them here.
 */
export function MemberRequestsSection({ invitations, ar, lang, onAnswered }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function answer(invitation, choice) {
    if (busyId) return;
    setBusyId(invitation.id);
    setError('');
    setNotice('');
    try {
      await answerInvitation(invitation.id, choice);
      const club = ar ? invitation.club?.nameAr : invitation.club?.nameEn;
      const athlete = invitation.kind === 'athlete';
      setNotice(choice === 'accept'
        ? athlete
          ? (ar ? `انضممت إلى ${club}.` : `You joined ${club}.`)
          : (ar ? `انضممت إلى ${club}. يظهر لاعبو النادي الآن في حسابك.` : `You joined ${club}. The club's players now appear in your account.`)
        : (ar ? `اعتذرت عن دعوة ${club}.` : `You declined ${club}'s invitation.`));
      refreshNotices();
      onAnswered();
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر إرسال الرد.' : 'Could not send your answer.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <SectionTitle Icon={IconMail} title={ar ? 'الطلبات والدعوات' : 'Requests & Invitations'} />

      {notice && <p className="club-notice" role="status">{notice}</p>}
      {error && <p className="acct-error" role="alert">{error}</p>}

      {invitations === null ? (
        <p className="club-dash__loading">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : invitations.length === 0 ? (
        <Empty Icon={IconMail} text={ar ? 'لا توجد طلبات أو دعوات حالياً' : 'There are no requests or invitations at the moment'} />
      ) : (
        <ul className="club-inbox">
          {invitations.map((invitation) => {
            const status = REQUEST_STATUS[invitation.status] || REQUEST_STATUS.pending;
            const clubName = (ar ? invitation.club?.nameAr : invitation.club?.nameEn) || '—';
            const busy = busyId === invitation.id;
            return (
              <li className="club-inbox__row club-inbox__row--answer" key={invitation.id}>
                <Avatar url={invitation.club?.logoUrl} size="sm" />
                <span className="club-inbox__who">
                  <strong>{clubName}</strong>
                  <span>
                    {invitation.kind === 'athlete'
                      ? (ar ? 'دعوة للانضمام إلى النادي كلاعب' : 'Invitation to join the club as a player')
                      : (ar ? 'دعوة للانضمام إلى النادي كمدرب' : 'Invitation to join the club as a coach')}
                  </span>
                </span>
                <span className="club-inbox__date">{formatDate(invitation.createdAt, lang)}</span>
                <Pill tone={status.tone}>{ar ? status.ar : status.en}</Pill>
                <span className="club-inbox__action club-inbox__answer">
                  {invitation.status === 'pending' && (
                    <>
                      <button type="button" className="btn btn--green club-answer" disabled={Boolean(busyId)}
                              onClick={() => answer(invitation, 'accept')}>
                        {busy ? (ar ? 'جارٍ…' : 'Working…') : (ar ? 'قبول' : 'Accept')}
                      </button>
                      <button type="button" className="btn btn--outline club-answer" disabled={Boolean(busyId)}
                              onClick={() => answer(invitation, 'reject')}>
                        {ar ? 'رفض' : 'Reject'}
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ── Club details: the registration, read first, edited second ─────────── */

/*
 * How a member's registration reads as a profile. The fields are the
 * registration form's own (FIELDS[type]); only their grouping on screen is
 * decided here. The form's single "details" step holds two kinds of answer —
 * for a club, who it is and how it runs; for a coach, their coaching record
 * and the rest — so it is shown as two panels.
 */
const CLUB_IDENTITY_FIELDS = [
  'nameAr', 'nameEn', 'entityType', 'ownerName', 'ownerId', 'ownerPhone', 'ownerEmail',
  'headCoachName', 'headCoachPhone', 'headCoachEmail', 'headCoachCertificates',
];

/** A coach's experience and qualifications, out of the form's details step. */
const COACHING_FIELDS = [
  'yearsExperience', 'coachingLevel', 'categoriesCoached', 'attendedFederationCourses',
  'externalCertificates', 'previousClubs',
];

/*
 * An athlete's answers have two homes. Their sports side — weight, height,
 * where and with whom they train — is their Sports Profile; everything else
 * is Athlete Details. Each field lives in one of them only. The Para Muaythai
 * answers stay on the registration for the federation and are shown in
 * neither.
 */
const ATHLETE_BODY_FIELDS = ['currentWeight', 'height'];
const ATHLETE_COACH_FIELDS = ['clubName', 'coachName', 'coachPhone'];
const ATHLETE_SPORTS_FIELDS = [...ATHLETE_BODY_FIELDS, ...ATHLETE_COACH_FIELDS];
const ATHLETE_HIDDEN_FIELDS = ['paraAthlete', 'paraClassification'];

/** Some of the athlete's sports answers, in the order given. */
const athleteFields = (names) => names
  .map((name) => FIELDS.athlete.details.find((field) => field.name === name))
  .filter(Boolean)
  .map((field) => (field.name === 'clubName'
    // What they wrote when registering — not the club the system links them to.
    ? { ...field, label: { ar: 'النادي أو المركز المذكور في طلب التسجيل', en: 'Club or centre provided in the registration' } }
    : field));

/** Each membership type's profile: its title, and its panels in order. */
const PROFILE_LAYOUTS = {
  club: {
    title: { ar: 'بيانات النادي', en: 'Club Details' },
    Icon: IconBuilding,
    identityNote: {
      ar: 'بيانات مقدم الطلب الشخصية لا تُعدّل من الحساب؛ راجع الاتحاد لتغييرها.',
      en: "The applicant's personal details are not changed from the account; contact the federation for those.",
    },
    panels: [
      { key: 'basic', Icon: IconPerson, editable: false, title: { ar: 'البيانات الأساسية', en: 'Basic information' }, fields: FIELDS.club.identity },
      { key: 'contact', Icon: IconPhone, editable: true, title: { ar: 'التواصل', en: 'Contact' }, fields: FIELDS.club.contact },
      {
        key: 'club', Icon: IconBuilding, editable: true, logo: true,
        title: { ar: 'معلومات النادي', en: 'Club information' },
        fields: FIELDS.club.details.filter((field) => CLUB_IDENTITY_FIELDS.includes(field.name)),
      },
      {
        key: 'more', Icon: IconInfo, editable: true,
        title: { ar: 'معلومات إضافية', en: 'Additional information' },
        fields: FIELDS.club.details.filter((field) => !CLUB_IDENTITY_FIELDS.includes(field.name)),
      },
    ],
  },
  coach: {
    title: { ar: 'بيانات المدرب', en: 'Coach Details' },
    Icon: IconCoach,
    identityNote: {
      ar: 'بياناتك الشخصية لا تُعدّل من الحساب؛ راجع الاتحاد لتغييرها.',
      en: 'Your personal details are not changed from the account; contact the federation for those.',
    },
    panels: [
      { key: 'basic', Icon: IconPerson, editable: false, title: { ar: 'البيانات الأساسية', en: 'Basic information' }, fields: FIELDS.coach.identity },
      { key: 'contact', Icon: IconPhone, editable: true, title: { ar: 'التواصل', en: 'Contact' }, fields: FIELDS.coach.contact },
      {
        key: 'coaching', Icon: IconMedal, editable: true,
        title: { ar: 'معلومات التدريب والمؤهلات', en: 'Coaching & qualifications' },
        fields: FIELDS.coach.details.filter((field) => COACHING_FIELDS.includes(field.name)),
      },
      {
        key: 'more', Icon: IconInfo, editable: true,
        title: { ar: 'معلومات إضافية', en: 'Additional information' },
        fields: FIELDS.coach.details.filter((field) => !COACHING_FIELDS.includes(field.name)),
      },
    ],
  },
  athlete: {
    title: { ar: 'بيانات اللاعب', en: 'Athlete Details' },
    Icon: IconPerson,
    identityNote: {
      ar: 'بياناتك الشخصية لا تُعدّل من الحساب؛ راجع الاتحاد لتغييرها.',
      en: 'Your personal details are not changed from the account; contact the federation for those.',
    },
    panels: [
      { key: 'basic', Icon: IconPerson, editable: false, title: { ar: 'البيانات الأساسية', en: 'Basic information' }, fields: FIELDS.athlete.identity },
      { key: 'contact', Icon: IconPhone, editable: true, title: { ar: 'التواصل', en: 'Contact' }, fields: FIELDS.athlete.contact },
      {
        key: 'more', Icon: IconInfo, editable: true,
        title: { ar: 'معلومات إضافية', en: 'Additional information' },
        fields: FIELDS.athlete.details.filter((field) => !ATHLETE_SPORTS_FIELDS.includes(field.name)
          && !ATHLETE_HIDDEN_FIELDS.includes(field.name)),
      },
    ],
  },
  athleteSports: {
    title: { ar: 'ملفي الرياضي', en: 'My Sports Profile' },
    Icon: IconGlove,
    membership: false,
    panels: [
      {
        key: 'sports', Icon: IconGlove, editable: true,
        title: { ar: 'المعلومات الرياضية الحالية', en: 'Current sports information' },
        fields: athleteFields(ATHLETE_BODY_FIELDS),
        note: {
          ar: 'الوزن هنا هو وزنك الحالي في ملفك، وليس وزنًا رسميًا؛ الوزن الرسمي يُسجَّل عند الوزن في كل بطولة.',
          en: 'This is your current profile weight, not an official one; the official weight is recorded at each tournament weigh-in.',
        },
      },
      {
        key: 'coach', Icon: IconCoach, editable: true,
        title: { ar: 'معلومات المدرب', en: 'Coach Information' },
        fields: athleteFields(ATHLETE_COACH_FIELDS),
      },
    ],
  },
};

/** Answers that need room: addresses, links, lists and certificates. */
const ROOMY_FIELDS = [
  'shortAddress', 'nationalAddress', 'googleMapsUrl', 'clubWebsite', 'headCoachCertificates',
  'categoriesAccepted', 'trainingSchedule',
  'externalCertificates', 'previousClubs', 'categoriesCoached', 'socialMedia', 'cvUrl', 'clubName',
];

/** How many grid columns an answer takes: one, two, or the whole row. */
function spanClass(field, value) {
  if (field.span === 12) return ' is-full';
  if (ROOMY_FIELDS.includes(field.name) || String(value ?? '').length > 42) return ' is-wide';
  return '';
}

function optionText(field, value, ar) {
  const option = (field.options || []).find((entry) => entry.value === value);
  if (option) return ar ? option.ar : option.en;
  return value;
}

function visible(field, values) {
  return !field.when || field.when(values);
}

/** The membership's validity, as a quiet status beside the heading. */
function MembershipStatus({ profile, ar, lang }) {
  if (!profile?.expiresAt) return null;
  const expired = profile.status === 'expired' || new Date(profile.expiresAt) < new Date();
  const date = formatDate(profile.expiresAt, lang);
  return (
    <span className={`club-validity${expired ? ' is-expired' : ''}`}>
      <span className="club-validity__dot" aria-hidden="true" />
      {expired
        ? (ar ? `انتهت العضوية في ${date}` : `Membership expired on ${date}`)
        : (ar ? `العضوية سارية حتى ${date}` : `Membership valid until ${date}`)}
    </span>
  );
}

/** A read-only answer: a label over a quiet information cell. */
function InfoCell({ field, value, ar }) {
  return (
    <div className={`club-cell${spanClass(field, value)}`}>
      <dt className="club-cell__label">{ar ? field.label.ar : field.label.en}</dt>
      <dd className="club-cell__value" dir={field.dir === 'ltr' && value ? 'ltr' : undefined}>
        {value ? optionText(field, value, ar) : <span className="club-cell__empty">—</span>}
      </dd>
    </div>
  );
}

export function ClubDetailsSection(props) {
  return <ProfileDetailsSection type="club" {...props} />;
}

/**
 * A member's own registration as a profile — read first, edited second. An
 * edit is a proposal for the federation to approve; until then the approved
 * answers stay the official ones.
 */
export function ProfileDetailsSection({ type, layoutKey = type, profile, ar, lang, onChanged, before, children }) {
  const layout = PROFILE_LAYOUTS[layoutKey];
  // The fields this page shows and those it may propose a change to; a
  // member whose answers are split across two pages edits each on its own.
  const layoutFields = layout.panels.flatMap((panel) => panel.fields);
  const editableFields = layout.panels.filter((panel) => panel.editable).flatMap((panel) => panel.fields);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const values = profile?.fields || {};
  const pending = Object.fromEntries(Object.entries(profile?.pending?.changes || {})
    .filter(([name]) => layoutFields.some((field) => field.name === name)));

  function startEditing() {
    setDraft({ ...values });
    setError('');
    setNotice('');
    setEditing(true);
  }

  async function submit(event) {
    event.preventDefault();
    const changes = Object.fromEntries(
      editableFields
        .filter((field) => visible(field, draft))
        .map((field) => [field.name, String(draft[field.name] ?? '').trim()])
        .filter(([name, value]) => value !== String(values[name] ?? '').trim()),
    );

    if (Object.keys(changes).length === 0) {
      setEditing(false);
      return;
    }

    // REG-11 — the same current-weight rule as registering (the API checks it again).
    if ('currentWeight' in changes) {
      const weight = Number(changes.currentWeight);
      const { min, max } = weightRangeFor({ dateOfBirth: values.dateOfBirth });
      if (changes.currentWeight === '' || !Number.isFinite(weight) || weight < min || weight > max) {
        setError(ar
          ? `يرجى إدخال وزن بين ${min} و${max} كجم لهذه الفئة العمرية.`
          : `Please enter a weight between ${min} and ${max} kg for this age band.`);
        return;
      }
    }

    setBusy(true);
    setError('');
    try {
      await proposeChange(changes);
      setEditing(false);
      setNotice(ar
        ? 'أُرسلت التعديلات للمراجعة. ستبقى البيانات الحالية معتمدة حتى يوافق الاتحاد.'
        : 'Your changes were sent for review. The current details stay official until the federation approves them.');
      onChanged();
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر إرسال التعديلات.' : 'Could not send the changes.'));
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    return (
      <>
        <SectionTitle Icon={layout.Icon} title={ar ? layout.title.ar : layout.title.en} />
        <p className="club-dash__loading">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      </>
    );
  }

  const shown = editing ? draft : values;

  const panels = layout.panels.map((panel) => (
    <section className="club-panelset" key={panel.key}>
      <h3 className="club-panelset__title">
        <panel.Icon className="club-panelset__icon" />
        {ar ? panel.title.ar : panel.title.en}
        {panel.logo && profile.logoUrl && <Avatar url={profile.logoUrl} size="sm" />}
      </h3>
      {editing && panel.editable ? (
        <div className="club-cells">
          {panel.fields.filter((field) => visible(field, shown)).map((field) => (
            <EditField key={field.name} field={field} value={draft[field.name] ?? ''} ar={ar}
                       onChange={(value) => setDraft((current) => ({ ...current, [field.name]: value }))} />
          ))}
        </div>
      ) : (
        <dl className="club-cells">
          {panel.fields.filter((field) => visible(field, shown)).map((field) => (
            <InfoCell key={field.name} field={field} value={values[field.name]} ar={ar} />
          ))}
        </dl>
      )}
      {editing && !panel.editable && (
        <p className="club-profile__hint">
          {ar ? layout.identityNote.ar : layout.identityNote.en}
        </p>
      )}
      {panel.note && <p className="club-profile__hint">{ar ? panel.note.ar : panel.note.en}</p>}
    </section>
  ));

  return (
    <>
      <SectionTitle
        Icon={layout.Icon}
        title={ar ? layout.title.ar : layout.title.en}
        note={layout.membership === false ? null : <MembershipStatus profile={profile} ar={ar} lang={lang} />}
        action={!editing && (
          <button type="button" className="btn btn--outline club-add club-edit" onClick={startEditing}>
            {ar ? 'تعديل البيانات' : 'Edit details'}
          </button>
        )}
      />

      {notice && <p className="club-notice" role="status">{notice}</p>}

      {Object.keys(pending).length > 0 && (
        <div className="club-review">
          <Pill tone="pending">{ar ? 'قيد المراجعة' : 'Under review'}</Pill>
          <p>
            {ar
              ? 'أرسلتم تعديلات لم يعتمدها الاتحاد بعد. البيانات المعروضة أدناه هي المعتمدة حاليًا.'
              : 'You have sent changes the federation has not approved yet. The details below are the ones currently approved.'}
          </p>
          <ul>
            {Object.entries(pending).map(([name, value]) => {
              const field = layoutFields.find((entry) => entry.name === name);
              return (
                <li key={name}>
                  <span>{field ? (ar ? field.label.ar : field.label.en) : name}</span>
                  <strong>{field ? optionText(field, value, ar) : value}</strong>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editing ? (
        <form className="club-form club-profile" onSubmit={submit}>
          {error && <p className="acct-error" role="alert">{error}</p>}
          {before}
          {panels}
          <div className="club-form__actions">
            <button type="button" className="btn btn--outline" onClick={() => setEditing(false)} disabled={busy}>
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="submit" className="btn btn--green" disabled={busy}>
              {busy ? (ar ? 'جارٍ الإرسال…' : 'Sending…') : (ar ? 'إرسال للمراجعة' : 'Submit for review')}
            </button>
          </div>
        </form>
      ) : (
        <div className="club-profile">{before}{panels}</div>
      )}
      {children}
    </>
  );
}

/** One editable answer, with the control the registration form used. */
function EditField({ field, value, ar, onChange }) {
  const label = ar ? field.label.ar : field.label.en;
  const common = { value, dir: field.dir, onChange: (event) => onChange(event.target.value) };

  let control;
  if (field.options) {
    control = (
      <select {...common}>
        <option value="">—</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>{ar ? option.ar : option.en}</option>
        ))}
      </select>
    );
  } else if (field.control === 'textarea') {
    control = <textarea rows={3} {...common} />;
  } else {
    const type = { email: 'email', number: 'number', phone: 'tel' }[field.control] || 'text';
    // A number input steps in whole units by default, and the browser then refuses a
    // weight of 15.4 or 15.75 on submit; the weight takes decimals, its range is checked in submit().
    control = <input type={type} step={field.name === 'currentWeight' ? 'any' : undefined} {...common} />;
  }

  return (
    <label className={`club-field${spanClass(field, value)}`}>
      <span>{label}</span>
      {control}
    </label>
  );
}
