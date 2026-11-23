import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import {
  fetchAthleteRecord, fetchInvitations, fetchMe, fetchProfile, getToken, messageOf, signOut,
} from '../../api/member';
import {
  IconGlove, IconMail, IconMedicalFile, IconStats, IconTrophy,
} from '../../components/icons/AccountIcons';
import { IconPerson } from '../../components/icons/Icons';
import AccountShell from './AccountShell';
import {
  AthleteStatistics, MedicalFilePanel, RankingPanel, ResultsPanel, SportsStanding,
} from './AthleteSections';
import { MemberRequestsSection, ProfileDetailsSection } from './ClubSections';
import { TournamentsSection } from './AccountTournaments';
import { SectionTitle } from './clubParts';

/**
 * The athlete's own area of the website, in the same shell as the club's and
 * the coach's.
 *
 * Each of their answers has one home: the sports side (weight, height, where
 * and with whom they train) in My Sports Profile, beside what the system
 * itself records — their club link, this year's category, their results;
 * everything personal in Athlete Details. A club becomes theirs only when
 * they accept its invitation, here under Requests & Invitations.
 */

const SECTIONS = [
  { key: 'statistics', ar: 'الإحصائيات', en: 'Statistics', Icon: IconStats },
  { key: 'sports', ar: 'ملفي الرياضي', en: 'My Sports Profile', Icon: IconGlove },
  { key: 'tournaments', ar: 'البطولات', en: 'Tournaments', Icon: IconTrophy },
  { key: 'medical', ar: 'الملف الطبي', en: 'Medical File', Icon: IconMedicalFile },
  { key: 'requests', ar: 'الطلبات والدعوات', en: 'Requests & Invitations', Icon: IconMail },
  { key: 'details', ar: 'بيانات اللاعب', en: 'Athlete Details', Icon: IconPerson },
];

export default function AthleteAccount() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [record, setRecord] = useState(null);
  const [profile, setProfile] = useState(null);
  const [invitations, setInvitations] = useState(null);
  const [error, setError] = useState('');
  // The open section lives in the address, so a notice can lead straight to it.
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.some((entry) => entry.key === params.get('section')) ? params.get('section') : 'statistics';
  const setSection = (key) => setParams(key === 'statistics' ? {} : { section: key });

  const reload = useCallback(() => {
    fetchProfile().then(setProfile).catch(() => {});
    fetchInvitations().then(setInvitations).catch(() => setInvitations([]));
    fetchAthleteRecord().then(setRecord).catch(() => {});
  }, []);

  /* After an answer the club link may have changed: read the account again. */
  const refreshAccount = useCallback(() => {
    fetchMe().then((data) => { setMe(data); reload(); }).catch(() => {});
  }, [reload]);

  useEffect(() => {
    if (!getToken()) {
      navigate('/account/login?next=/account/athlete', { replace: true });
      return;
    }

    let cancelled = false;
    fetchMe()
      .then((data) => {
        if (cancelled) return;
        // Only an athlete has this page; everyone else goes to their own.
        if (data.kind !== 'athlete') {
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
          navigate('/account/login?next=/account/athlete', { replace: true });
          return;
        }
        setError(messageOf(err, lang, ar ? 'تعذر تحميل حساب اللاعب.' : 'Could not load the athlete account.'));
      });

    return () => { cancelled = true; };
  }, [navigate, lang, ar, reload]);

  const athleteName = me
    ? (ar ? me.membership?.nameAr || me.membership?.nameEn : me.membership?.nameEn || me.membership?.nameAr) || me.email
    : (ar ? 'حساب اللاعب' : 'Athlete Account');

  // Only an accepted club link: an invitation not yet answered is not their club.
  const club = me?.club;
  const clubName = club ? (ar ? club.nameAr || club.nameEn : club.nameEn || club.nameAr) : '';

  return (
    <AccountShell
      title={athleteName}
      // The athlete is the page; the club they joined is context beneath the name.
      subtitle={club ? clubName : undefined}
      breadcrumb={ar ? 'حساب اللاعب' : 'Athlete Account'}
      navLabel={ar ? 'أقسام حساب اللاعب' : 'Athlete account sections'}
      sections={SECTIONS}
      section={section}
      onSection={setSection}
      ar={ar}
    >
      {error ? (
        <p className="club-dash__error" role="alert">{error}</p>
      ) : section === 'statistics' ? (
        <AthleteStatistics record={record} ar={ar} />
      ) : section === 'sports' ? (
        <ProfileDetailsSection
          type="athlete"
          layoutKey="athleteSports"
          profile={profile}
          ar={ar}
          lang={lang}
          onChanged={reload}
          before={<SportsStanding club={club} record={record} ar={ar} />}
        >
          <div className="club-profile athlete-record">
            <ResultsPanel record={record} ar={ar} lang={lang} />
            <RankingPanel ar={ar} />
          </div>
        </ProfileDetailsSection>
      ) : section === 'tournaments' ? (
        <TournamentsSection ar={ar} lang={lang} viewer="athlete" />
      ) : section === 'medical' ? (
        <>
          <SectionTitle Icon={IconMedicalFile} title={ar ? 'الملف الطبي' : 'Medical File'} />
          <MedicalFilePanel ar={ar} lang={lang} titled={false} />
        </>
      ) : section === 'requests' ? (
        <MemberRequestsSection invitations={invitations} ar={ar} lang={lang} onAnswered={refreshAccount} />
      ) : (
        <ProfileDetailsSection type="athlete" profile={profile} ar={ar} lang={lang} onChanged={reload} />
      )}
    </AccountShell>
  );
}
