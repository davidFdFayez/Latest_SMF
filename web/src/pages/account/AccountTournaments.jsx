import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchEligibility, fetchEligible, fetchTournaments, messageOf } from '../../api/member';
import { formatDate, formatDateRange, toLatinDigits } from '../../utils/format';
import { IconCalendar, IconLocation } from '../../components/icons/Icons';
import { IconPlayers, IconTrophy } from '../../components/icons/AccountIcons';
import { Empty, Pill, SectionTitle } from './clubParts';
import TournamentRegistration from './TournamentRegistration';

/**
 * The Tournaments section of every member account: the tournaments open for
 * registration, and — REQ-03 — registering in them. An athlete registers
 * themselves; a club or a coach registers one of the club's own athletes.
 * Which athletes those are, and whether each may enter, is the server's answer.
 */

/** The one refusal shown on the card itself: nothing this tournament runs fits the athlete. */
const NO_DIVISION = 'no_eligible_category';

const hasNoDivision = (barriers) => (barriers || []).some((barrier) => barrier.code === NO_DIVISION);

/**
 * Why there is nothing to register in, named by the athlete's own age-eligible
 * categories (REQ-02) — every one of them, since the ranges overlap — using
 * the category labels the server sends.
 */
function unavailableText(categories, ar) {
  const labels = (categories || []).map((category) => (ar ? category.ar : category.en));
  if (labels.length === 0) {
    return ar ? 'لا توجد فئة عمرية تناسب عمر اللاعب في هذه البطولة' : 'No age category in this tournament fits this athlete.';
  }
  if (!ar) {
    const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
    return `${list} ${labels.length === 1 ? 'is' : 'are'} not available in this tournament.`;
  }
  // "النخبة" carries its own article; "تحت 18 سنة" reads as "فئة تحت 18 سنة".
  const named = (label) => (label.startsWith('ال') ? label : `فئة ${label}`);
  if (labels.length === 1) return `${named(labels[0])} غير متاحة في هذه البطولة`;
  const joined = labels.slice(1).reduce((text, label) => `${text} و${label}`, labels[0]);
  return labels.length === 2
    ? `فئتا ${joined} غير متاحتين في هذه البطولة`
    : `الفئات ${joined} غير متاحة في هذه البطولة`;
}

/**
 * The registration button where it always stands, disabled and soft red, with
 * its reason directly beneath. An invisible copy of the reason above it keeps
 * the button centred exactly where the green one would be.
 */
function UnavailableAction({ id, ar, reason }) {
  return (
    <span className="reg-unavailable">
      <span className="reg-unavailable__ghost" aria-hidden="true">{reason}</span>
      <button type="button" className="btn club-add reg-unavailable__button" disabled aria-describedby={id}>
        {ar ? 'التسجيل غير متاح' : 'Registration unavailable'}
      </button>
      <span className="reg-unavailable__reason" id={id}>{reason}</span>
    </span>
  );
}

/**
 * The blue state of a registration already made: one button where the green
 * one stands, which opens that registration rather than starting another.
 */
function RegisteredAction({ ar, open, onClick, controls }) {
  return (
    <button type="button" className="btn club-add reg-registered" aria-expanded={open} aria-controls={controls}
            onClick={onClick}>
      {ar ? 'تم التسجيل' : 'Registered'}
    </button>
  );
}

export function TournamentsSection({ ar, lang, note, viewer = 'club' }) {
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  // The registration under way: the tournament, and for a club or coach the athlete.
  const [registering, setRegistering] = useState(null);
  // The athlete's own standing per open tournament (REQ-02), from the server.
  const [standing, setStanding] = useState({});
  const athleteView = viewer === 'athlete';
  // Arriving for one tournament (?tournament=<id>, from its public page): an
  // athlete already in it sees their registration; anyone else, its card —
  // for a club or a coach, opened at their athletes.
  const [params] = useSearchParams();
  const wanted = Number(params.get('tournament')) || null;
  const arrived = useRef(false);
  const [highlight, setHighlight] = useState(null);

  useEffect(() => {
    if (!wanted || !tournaments || arrived.current) return;
    const target = tournaments.find((tournament) => tournament.id === wanted);
    if (!target) return;
    arrived.current = true;
    const registered = (target.ourEntries || []).length > 0;
    if (!athleteView || registered) setExpanded(target.id);
    setHighlight(target.id);
    window.requestAnimationFrame(() => document.getElementById(`tournament-${target.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [wanted, tournaments, athleteView]);

  useEffect(() => {
    if (!athleteView || !tournaments) return undefined;
    let cancelled = false;
    tournaments
      .filter((tournament) => tournament.registrationOpen && !(tournament.ourEntries || []).length)
      .forEach((tournament) => {
        fetchEligibility(tournament.id)
          .then((result) => !cancelled && setStanding((all) => ({ ...all, [tournament.id]: result })))
          // Unknown is not "not eligible": the registration screen gives the server's answer.
          .catch(() => !cancelled && setStanding((all) => ({ ...all, [tournament.id]: 'unknown' })));
      });
    return () => { cancelled = true; };
  }, [athleteView, tournaments]);

  const load = useCallback(() => {
    // Only tournaments taking entries right now, as the server reckons it.
    return fetchTournaments({ open: true })
      .then((list) => { setTournaments(list); setError(''); })
      .catch((err) => setError(messageOf(err, lang, ar ? 'تعذر تحميل البطولات.' : 'Could not load tournaments.')));
  }, [lang, ar]);

  useEffect(() => { load(); }, [load]);

  if (registering) {
    return (
      <>
        <SectionTitle Icon={IconTrophy} title={ar ? 'البطولات' : 'Tournaments'} note={note} />
        <TournamentRegistration
          tournamentId={registering.tournamentId}
          athleteRegistrationId={registering.athleteRegistrationId}
          ar={ar}
          lang={lang}
          onClose={() => setRegistering(null)}
          onDone={() => { setRegistering(null); setExpanded(null); load(); }}
        />
      </>
    );
  }

  return (
    <>
      <SectionTitle Icon={IconTrophy} title={ar ? 'البطولات' : 'Tournaments'} note={note} />

      {/* Three states, never confused: a failed request is an error, and
          only an answer with nothing in it is "no tournaments". */}
      {error ? (
        <p className="club-dash__error" role="alert">{error}</p>
      ) : tournaments === null ? (
        <p className="club-dash__loading">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : tournaments.length === 0 ? (
        <Empty
          Icon={IconTrophy}
          title={ar ? 'لا توجد بطولات متاحة حالياً' : 'No tournaments are currently available'}
          text={athleteView
            ? (ar
              ? 'سيتم إشعارك عندما تكون مؤهلاً للمشاركة في بطولة.'
              : 'You will be notified when you are eligible to participate in a tournament.')
            : (ar
              ? 'سيتم إشعارك عندما يكون أحد لاعبيك مؤهلاً للمشاركة في بطولة.'
              : 'You will be notified when one of your athletes is eligible to participate in a tournament.')}
        />
      ) : (
        <ul className="club-tlist">
          {tournaments.map((tournament) => {
            const kinds = [
              ar ? tournament.typeAr : tournament.typeEn,
              ar ? tournament.competitionTypeAr : tournament.competitionTypeEn,
            ].filter(Boolean);
            const entered = tournament.ourEntries || [];
            const mine = athleteView ? entered[0] : null;
            const open = expanded === tournament.id;
            const own = standing[tournament.id];
            // Nothing in this tournament fits the athlete: the card says so.
            const noDivision = athleteView && !mine && own && own !== 'unknown' && hasNoDivision(own.barriers);
            const detailsId = `tournament-${tournament.id}-registration`;
            const toggle = () => setExpanded(open ? null : tournament.id);
            const name = ar ? tournament.nameAr : tournament.nameEn;

            /* One action per card, and it carries the state: green to register,
               blue once registered (opening that registration), soft red when
               nothing here fits the athlete. No badges repeating it. */
            return (
              <li id={`tournament-${tournament.id}`} key={tournament.id}
                  className={`club-tournament${open ? ' is-open' : ''}${highlight === tournament.id ? ' is-highlighted' : ''}`}>
                <div className="club-tournament__row">
                  <div className="club-tournament__main">
                    {mine ? (
                      // Already registered: the tournament leads to that registration.
                      <button type="button" className="club-tournament__name club-tournament__name--button"
                              aria-expanded={open} aria-controls={detailsId} onClick={toggle}>
                        {name}
                      </button>
                    ) : (
                      <Link className="club-tournament__name" to={`/activities/event/tournament-${tournament.id}`}>{name}</Link>
                    )}
                    {kinds.length > 0 && <span className="club-tournament__kinds">{kinds.join(' · ')}</span>}
                    <span className="club-tournament__facts">
                      <span><IconCalendar aria-hidden="true" />{formatDateRange(tournament.startDate, tournament.endDate, lang)}</span>
                      <span><IconLocation aria-hidden="true" />{ar ? tournament.locationAr : tournament.locationEn}</span>
                    </span>
                  </div>

                  <div className="club-tournament__side">
                    {athleteView ? (
                      mine ? (
                        <RegisteredAction ar={ar} open={open} controls={detailsId} onClick={toggle} />
                      ) : tournament.registrationOpen && (
                        noDivision ? (
                          <UnavailableAction
                            id={`reg-reason-${tournament.id}`}
                            ar={ar}
                            reason={unavailableText(own.ageEligibleCategories, ar)}
                          />
                        ) : (
                          <button type="button" className="btn btn--green club-add"
                                  // Held until the athlete's standing is known.
                                  disabled={own === undefined}
                                  onClick={() => setRegistering({ tournamentId: tournament.id })}>
                            {ar ? 'التسجيل في البطولة' : 'Register in tournament'}
                          </button>
                        )
                      )
                    ) : tournament.registrationOpen && (
                      <button type="button" className={`btn ${open ? 'btn--outline' : 'btn--green'} club-add`}
                              aria-expanded={open} onClick={toggle}>
                        {open ? (ar ? 'إغلاق' : 'Close') : (ar ? 'تسجيل لاعب' : 'Register an athlete')}
                      </button>
                    )}
                  </div>
                </div>

                {open && athleteView && mine && <EntryDetails id={detailsId} entry={mine} ar={ar} lang={lang} />}
                {open && !athleteView && (
                  <AthleteChooser
                    tournamentId={tournament.id}
                    entries={entered}
                    ar={ar}
                    lang={lang}
                    onChoose={(athleteRegistrationId) => setRegistering({ tournamentId: tournament.id, athleteRegistrationId })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** A registration in a tournament, as it was registered — read from the saved entry. */
function EntryDetails({ id, entry, ar, lang }) {
  const by = { athlete: ar ? 'اللاعب' : 'The athlete', club: ar ? 'النادي' : 'The club', coach: ar ? 'المدرب' : 'The coach' };
  const rows = [
    [ar ? 'الحالة' : 'Status', ar ? entry.statusAr : entry.statusEn],
    [ar ? 'الفئة' : 'Category', ar ? entry.categoryAr : entry.categoryEn],
    [ar ? 'القسم' : 'Division', ar ? entry.divisionLabelAr : entry.divisionLabelEn],
    [ar ? 'النادي / المركز التدريبي' : 'Club / training centre', entry.clubName],
    [ar ? 'اسم المدرب' : 'Coach name', entry.coachName],
    [ar ? 'رقم جوال المدرب' : 'Coach mobile', entry.coachPhone, 'ltr'],
    [ar ? 'الوزن الحالي' : 'Current weight', entry.declaredWeightKg != null ? `${toLatinDigits(entry.declaredWeightKg)} ${ar ? 'كجم' : 'kg'}` : ''],
    [ar ? 'الطول' : 'Height', entry.heightCm != null ? `${toLatinDigits(entry.heightCm)} ${ar ? 'سم' : 'cm'}` : ''],
    [ar ? 'سُجّل بواسطة' : 'Registered by', by[entry.enteredBy] || ''],
    [ar ? 'تاريخ التسجيل' : 'Registered on', entry.createdAt ? formatDate(entry.createdAt, lang) : ''],
  ];
  return (
    <dl className="reg-review reg-review--entry" id={id}>
      {rows.map(([label, value, dir]) => (
        <div key={label}><dt>{label}</dt><dd dir={dir && value ? dir : undefined}>{value || '—'}</dd></div>
      ))}
    </dl>
  );
}

/**
 * A club's or coach's athletes for one tournament, each with where they stand:
 * registered, open to register, or why not — never silently left out.
 */
function AthleteChooser({ tournamentId, entries, ar, lang, onChoose }) {
  const [athletes, setAthletes] = useState(null);
  const [error, setError] = useState('');
  // The registered athlete whose saved registration is open, if any.
  const [shown, setShown] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchEligible(tournamentId)
      .then((list) => !cancelled && setAthletes(list))
      .catch((err) => !cancelled && setError(messageOf(err, lang, ar ? 'تعذر تحميل اللاعبين.' : 'Could not load the athletes.')));
    return () => { cancelled = true; };
  }, [tournamentId, lang, ar]);

  if (error) return <div className="club-picker"><p className="club-dash__error" role="alert">{error}</p></div>;
  if (athletes === null) return <div className="club-picker"><p className="club-dash__loading">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p></div>;
  if (athletes.length === 0) {
    return (
      <div className="club-picker">
        <Empty Icon={IconPlayers} text={ar ? 'لا يوجد لاعبون مرتبطون بالنادي لتسجيلهم.' : 'There are no linked athletes to register.'} />
      </div>
    );
  }

  return (
    <div className="club-picker">
      <p className="club-picker__lead">
        {ar ? 'اختر اللاعب الذي تريد تسجيله في هذه البطولة.' : 'Choose the athlete to register in this tournament.'}
      </p>
      <ul className="reg-roster">
        {athletes.map((athlete) => {
          const name = (ar ? athlete.nameAr || athlete.nameEn : athlete.nameEn || athlete.nameAr) || '—';
          const reason = athlete.barriers.find((barrier) => barrier.code !== 'already_entered');
          // Nothing this tournament runs fits this athlete's own categories.
          const noDivision = !athlete.alreadyEntered && hasNoDivision(athlete.barriers);
          if (noDivision) {
            return (
              <li key={athlete.registrationId} className="is-off">
                <span className="reg-roster__who"><strong>{name}</strong></span>
                <UnavailableAction
                  id={`reg-reason-${tournamentId}-${athlete.registrationId}`}
                  ar={ar}
                  reason={unavailableText(athlete.ageEligibleCategories, ar)}
                />
              </li>
            );
          }
          if (athlete.alreadyEntered) {
            // Registered: blue, opening the registration the club already made.
            const entry = (entries || []).find((item) => item.athleteRegistrationId === athlete.registrationId);
            const open = shown === athlete.registrationId;
            const detailsId = `entry-${tournamentId}-${athlete.registrationId}`;
            return (
              // The same row as an athlete still to register — name, then the
              // action where "تسجيل" stands — with the saved registration
              // wrapping onto its own line beneath when opened.
              <li key={athlete.registrationId} className={`reg-roster__item${open ? ' is-open' : ''}`}>
                <span className="reg-roster__who"><strong>{name}</strong></span>
                <RegisteredAction ar={ar} open={open} controls={detailsId}
                                  onClick={() => setShown(open ? null : athlete.registrationId)} />
                {open && entry && <EntryDetails id={detailsId} entry={entry} ar={ar} lang={lang} />}
              </li>
            );
          }
          return (
            <li key={athlete.registrationId} className={athlete.canEnter ? '' : 'is-off'}>
              <span className="reg-roster__who">
                <strong>{name}</strong>
                {!athlete.canEnter && reason ? (
                  <span>{ar ? reason.ar : reason.en}</span>
                ) : (
                  <span>{athlete.options.map((option) => (ar ? option.categoryAr : option.categoryEn)).join(' · ')}</span>
                )}
              </span>
              {athlete.canEnter ? (
                <button type="button" className="btn btn--green club-add" onClick={() => onChoose(athlete.registrationId)}>
                  {ar ? 'التسجيل في البطولة' : 'Register in tournament'}
                </button>
              ) : (
                <Pill tone="muted">{ar ? 'غير مؤهل' : 'Not eligible'}</Pill>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
