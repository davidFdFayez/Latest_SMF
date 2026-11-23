import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import {
  fetchClubStatistics, fetchInvitations, fetchMe, fetchProfile, fetchRoster, getToken, messageOf, signOut,
} from '../../api/member';
import { IconCoach, IconMail, IconPlayers, IconStats, IconTrophy } from '../../components/icons/AccountIcons';
import AccountShell from './AccountShell';
import { Statistics } from './AccountStatistics';
import { MemberRequestsSection, ProfileDetailsSection, RosterSection } from './ClubSections';
import { TournamentsSection } from './AccountTournaments';
import { Empty } from './clubParts';

/**
 * The coach's own area of the website, in the same shell as the club's.
 *
 * A coach does not keep a roster of their own: the club does. What a coach
 * sees of players is their club's roster — derived on the server from the
 * club the coach's account is linked to — so a player the club adds appears
 * here without anyone assigning them. Everything here is read-only except
 * the coach's own details, which go to the federation for approval, and
 * their answers to clubs' invitations — the only way a coach joins a club.
 */

const SECTIONS = [
  { key: 'statistics', ar: 'الإحصائيات', en: 'Statistics', Icon: IconStats },
  { key: 'players', ar: 'اللاعبون', en: 'Players', Icon: IconPlayers },
  { key: 'tournaments', ar: 'البطولات', en: 'Tournaments', Icon: IconTrophy },
  { key: 'requests', ar: 'الطلبات والدعوات', en: 'Requests & Invitations', Icon: IconMail },
  { key: 'details', ar: 'بيانات المدرب', en: 'Coach Details', Icon: IconCoach },
];

export default function CoachAccount() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [stats, setStats] = useState(null);
  const [roster, setRoster] = useState(null);
  const [profile, setProfile] = useState(null);
  const [invitations, setInvitations] = useState(null);
  const [error, setError] = useState('');
  // The open section lives in the address, so a notice can lead straight to it.
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.some((entry) => entry.key === params.get('section')) ? params.get('section') : 'statistics';
  const setSection = (key) => setParams(key === 'statistics' ? {} : { section: key });

  const reload = useCallback((withClub) => {
    fetchProfile().then(setProfile).catch(() => {});
    fetchInvitations().then(setInvitations).catch(() => setInvitations([]));
    // Without a club there is no roster to read, and nothing to report on.
    if (!withClub) {
      setRoster({ athletes: [], coaches: [] });
      setStats(null);
      return;
    }
    fetchRoster().then(setRoster).catch(() => setRoster({ athletes: [], coaches: [] }));
    fetchClubStatistics().then(setStats).catch(() => {});
  }, []);

  /* After an answer the club link may have changed: read the account again. */
  const refreshAccount = useCallback(() => {
    fetchMe()
      .then((data) => { setMe(data); reload(Boolean(data.club)); })
      .catch(() => {});
  }, [reload]);

  useEffect(() => {
    if (!getToken()) {
      navigate('/account/login?next=/account/coach', { replace: true });
      return;
    }

    let cancelled = false;
    fetchMe()
      .then((data) => {
        if (cancelled) return;
        // Only a coach has this page; everyone else goes to their own.
        if (data.kind !== 'coach') {
          navigate('/account', { replace: true });
          return;
        }
        setMe(data);
        reload(Boolean(data.club));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 401) {
          signOut();
          navigate('/account/login?next=/account/coach', { replace: true });
          return;
        }
        setError(messageOf(err, lang, ar ? 'تعذر تحميل حساب المدرب.' : 'Could not load the coach account.'));
      });

    return () => { cancelled = true; };
  }, [navigate, lang, ar, reload]);

  const coachName = me
    ? (ar ? me.membership?.nameAr || me.membership?.nameEn : me.membership?.nameEn || me.membership?.nameAr) || me.email
    : (ar ? 'حساب المدرب' : 'Coach Account');

  const club = me?.club;
  const clubName = club ? (ar ? club.nameAr || club.nameEn : club.nameEn || club.nameAr) : '';

  // The club the coach is with, shown beside a heading — context, not a section.
  const clubNote = club ? (
    <span className="acct-club">
      <span className="acct-club__name">{clubName}</span>
    </span>
  ) : null;

  const noClub = ar
    ? 'لست مرتبطًا بنادٍ حاليًا. عند قبولك دعوة من نادٍ يظهر هنا لاعبو النادي وإحصائياته.'
    : 'You are not linked to a club at the moment. Once you accept a club\'s invitation, its players and statistics appear here.';

  return (
    <AccountShell
      title={coachName}
      // The coach is the page; the club they joined is context beneath the name.
      subtitle={club ? clubName : undefined}
      breadcrumb={ar ? 'حساب المدرب' : 'Coach Account'}
      navLabel={ar ? 'أقسام حساب المدرب' : 'Coach account sections'}
      sections={SECTIONS}
      section={section}
      onSection={setSection}
      ar={ar}
    >
      {error ? (
        <p className="club-dash__error" role="alert">{error}</p>
      ) : section === 'statistics' ? (
        <Statistics
          stats={stats}
          ar={ar}
          viewer="coach"
          note={clubNote}
          empty={me && !club ? <Empty Icon={IconStats} text={noClub} /> : null}
        />
      ) : section === 'players' ? (
        <RosterSection
          kind="athlete"
          people={roster ? roster.athletes : null}
          ar={ar}
          lang={lang}
          readOnly
          note={clubNote}
          emptyText={me && !club ? noClub : undefined}
        />
      ) : section === 'tournaments' ? (
        <TournamentsSection ar={ar} lang={lang} viewer="coach" note={clubNote} />
      ) : section === 'requests' ? (
        <MemberRequestsSection invitations={invitations} ar={ar} lang={lang} onAnswered={refreshAccount} />
      ) : (
        <ProfileDetailsSection type="coach" profile={profile} ar={ar} lang={lang} onChanged={() => reload(Boolean(club))} />
      )}
    </AccountShell>
  );
}
