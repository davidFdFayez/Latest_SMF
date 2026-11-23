import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import {
  fetchClubStatistics, fetchInvitations, fetchMe, fetchProfile, fetchRoster, getToken, messageOf, signOut,
} from '../../api/member';
import {
  IconBuilding, IconCoach, IconMail, IconPlayers, IconStats, IconTrophy,
} from '../../components/icons/AccountIcons';
import AccountShell from './AccountShell';
import { Statistics } from './AccountStatistics';
import { ClubDetailsSection, RequestsSection, RosterSection } from './ClubSections';
import { TournamentsSection } from './AccountTournaments';

/**
 * The club's own area of the website: a page of the public site (header,
 * hero, footer) holding the club's dashboard. The navigation stays put while
 * the section beside it changes, all within this one page.
 */

const SECTIONS = [
  { key: 'statistics', ar: 'الإحصائيات', en: 'Statistics', Icon: IconStats },
  { key: 'players', ar: 'اللاعبين', en: 'Players', Icon: IconPlayers },
  { key: 'coaches', ar: 'المدربين', en: 'Coaches', Icon: IconCoach },
  { key: 'tournaments', ar: 'البطولات', en: 'Tournaments', Icon: IconTrophy },
  { key: 'requests', ar: 'الطلبات والدعوات', en: 'Requests & Invitations', Icon: IconMail },
  { key: 'club', ar: 'بيانات النادي', en: 'Club Details', Icon: IconBuilding },
];

export default function ClubAccount() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [stats, setStats] = useState(null);
  // The roster and the club's own record feed several sections, so they are
  // read once here and refreshed after anything that changes them.
  const [roster, setRoster] = useState(null);
  const [profile, setProfile] = useState(null);
  const [invitations, setInvitations] = useState(null);
  // The open section lives in the address, so a notice can lead straight to it.
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.some((entry) => entry.key === params.get('section')) ? params.get('section') : 'statistics';
  const setSection = (key) => setParams(key === 'statistics' ? {} : { section: key });
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    fetchRoster().then(setRoster).catch(() => setRoster({ athletes: [], coaches: [] }));
    fetchProfile().then(setProfile).catch(() => {});
    fetchClubStatistics().then(setStats).catch(() => {});
    fetchInvitations().then(setInvitations).catch(() => setInvitations([]));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      navigate('/account/login?next=/account/club', { replace: true });
      return;
    }

    let cancelled = false;
    fetchMe()
      .then((data) => {
        if (cancelled) return;
        // Only a club has this dashboard; everyone else keeps their portal.
        if (data.kind !== 'club') {
          navigate('/account', { replace: true });
          return;
        }
        setMe(data);
        reload();
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 401) {
          signOut();
          navigate('/account/login?next=/account/club', { replace: true });
          return;
        }
        setError(messageOf(err, lang, ar ? 'تعذر تحميل حساب النادي.' : 'Could not load the club account.'));
      });

    return () => { cancelled = true; };
  }, [navigate, lang, ar, reload]);

  const clubName = me
    ? (ar ? me.membership?.nameAr || me.membership?.nameEn : me.membership?.nameEn || me.membership?.nameAr) || me.email
    : (ar ? 'حساب النادي' : 'Club Account');

  return (
    <AccountShell
      title={clubName}
      breadcrumb={ar ? 'حساب النادي' : 'Club Account'}
      navLabel={ar ? 'أقسام حساب النادي' : 'Club account sections'}
      sections={SECTIONS}
      section={section}
      onSection={setSection}
      ar={ar}
    >
      {error ? (
        <p className="club-dash__error" role="alert">{error}</p>
      ) : section === 'statistics' ? (
        <Statistics stats={stats} ar={ar} />
      ) : section === 'players' || section === 'coaches' ? (
        <RosterSection
          key={section}
          kind={section === 'players' ? 'athlete' : 'coach'}
          people={roster ? (section === 'players' ? roster.athletes : roster.coaches) : null}
          // Invited and not yet answered: shown apart, never as the club's own.
          pendingInvites={(invitations || []).filter((entry) => entry.status === 'pending'
            && entry.kind === (section === 'players' ? 'athlete' : 'coach'))}
          ar={ar}
          lang={lang}
          onChanged={reload}
        />
      ) : section === 'tournaments' ? (
        <TournamentsSection ar={ar} lang={lang} viewer="club" />
      ) : section === 'requests' ? (
        <RequestsSection roster={roster} invitations={invitations} profile={profile} ar={ar} lang={lang} onChanged={reload} />
      ) : (
        <ClubDetailsSection profile={profile} ar={ar} lang={lang} onChanged={reload} />
      )}
    </AccountShell>
  );
}
