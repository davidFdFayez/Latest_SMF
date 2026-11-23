import { Link, useSearchParams } from 'react-router-dom';
import { formatDateRange, formatTime12, intlLocale, toLatinDigits } from '../utils/format';
import { getToken, tokenKind } from '../api/member';
import PageHero from '../components/PageHero';
import { IconCalendar, IconLocation, IconTrophy } from '../components/icons/Icons';
import TournamentSectionNav from '../components/tournament/TournamentSectionNav';
import { TOURNAMENT_SECTIONS } from '../components/tournament/sections';
import TournamentOverview from '../components/tournament/TournamentOverview';
import TournamentKeyDates from '../components/tournament/TournamentKeyDates';
import TournamentDivisions from '../components/tournament/TournamentDivisions';
import TournamentTerms from '../components/tournament/TournamentTerms';
import TournamentPlaceholder from '../components/tournament/TournamentPlaceholder';
import TournamentDraw from '../components/tournament/TournamentDraw';
import TournamentMatchSchedule from '../components/tournament/TournamentMatchSchedule';

/**
 * The public details of a tournament published from the admin's Tournaments
 * — reached from its Activities card like any activity, but laid out for a
 * tournament: a banner, then three sections (Overview, Divisions & Weights,
 * Schedule) chosen with the tabs under it. The section is kept in the URL
 * (?section=…), so a link can open any one of them.
 *
 * `activity` is the tournament as an activity (title, description, dates,
 * location, in the page's language); `tournament` is what only a tournament
 * has. Ordinary events never get here — EventDetail keeps them.
 */
export default function TournamentDetail({ activity, tournament, ar, lang }) {
  const pick = (arabic, english) => (ar ? arabic : english) || '';
  const [params, setParams] = useSearchParams();
  const section = TOURNAMENT_SECTIONS.some((s) => s.key === params.get('section')) ? params.get('section') : 'overview';
  const choose = (key) => {
    const next = new URLSearchParams(params);
    if (key === 'overview') next.delete('section');
    else next.set('section', key);
    // The Draw tab's open division belongs to that tab only.
    if (key !== 'draw') next.delete('division');
    setParams(next, { replace: true });
  };

  // A signed-in member goes to this tournament in their own account: an
  // athlete already in it sees their registration there, not a second form.
  const tournamentNumber = String(activity.id).replace(/^tournament-/, '');
  const kind = tokenKind();
  const accountLink = ['athlete', 'club', 'coach'].includes(kind)
    ? `/account/${kind}?section=tournaments&tournament=${tournamentNumber}`
    : '/account';

  const sameDay = String(activity.startDate).slice(0, 10) === String(activity.endDate || '').slice(0, 10);
  const dates = dateSpan(activity.startDate, sameDay ? null : activity.endDate, lang);

  /* A division is one gender and one category, holding its weight classes.
     The API lists them Female then Male, youngest category first, lightest
     class first, so consecutive entries with the same gender and category
     form one division. The hero, the Information panel and the Divisions &
     Weights tab all count and show these same divisions. */
  const divisionGroups = [];
  for (const division of tournament.divisions || []) {
    const key = `${division.genderEn}|${division.categoryEn}`;
    let group = divisionGroups[divisionGroups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        gender: String(division.genderEn).toLowerCase() === 'female' ? 'female' : 'male',
        category: division.categoryEn,
        name: pick(division.categoryAr, division.categoryEn),
        weights: [],
      };
      divisionGroups.push(group);
    }
    // The unit is added by the tab in the page's language; the number keeps
    // its precision and its "+" for the open class.
    const weight = String(division.weightEn).replace(/\s*kg$/i, '');
    if (!group.weights.includes(weight)) group.weights.push(weight);
  }
  // Shown Masters first, then Elite, then the youth categories in the API's
  // youngest-to-oldest order (a stable sort keeps it within each band).
  const band = (category) => (/^masters/i.test(category) ? 0 : /^elite$/i.test(category) ? 1 : 2);
  const orderedDivisions = [...divisionGroups].sort((a, b) => band(a.category) - band(b.category));
  const divisionCount = divisionGroups.length ? countLabel(divisionGroups.length, ar) : '';

  // Tournament Information, in this order (the division count is in the hero,
  // so it is not repeated here). The tournament and competition
  // types are the admin's own options, named in both languages; a value
  // without a name in this language shows the other's, and one with no
  // name at all is left out.
  const named = (arabic, english) => (ar ? arabic || english : english || arabic) || '';
  const facts = [
    { key: 'type', label: pick('نوع البطولة', 'Tournament Type'), value: named(tournament.typeAr, tournament.typeEn) },
    { key: 'competition', label: pick('نوع المنافسة', 'Competition Type'), value: named(tournament.competitionTypeAr, tournament.competitionTypeEn) },
    { key: 'date', label: pick('التاريخ', 'Date'), value: dates },
    { key: 'location', label: pick('الموقع', 'Location'), value: activity.location },
    { key: 'time', label: pick('وقت البداية', 'Start Time'), value: formatTime12(tournament.firstBoutTime, lang) },
  ].filter((fact) => fact.value);

  // Only the dates the tournament has, always in this order: registration
  // opens when it is published, closes on its closing date, then the medical
  // examination and weigh-in when the federation has set it, then the
  // competition days. The order is fixed — not sorted by date — so the
  // medical step always follows registration closing. Each line is a date
  // with an optional time, which the arrows draw with a clock.
  const milestones = [
    tournament.registrationOpensAt && {
      key: 'registration-opens',
      label: pick('فتح التسجيل', 'Registration Opens'),
      at: tournament.registrationOpensAt,
      lines: [{ date: dayAndDate(tournament.registrationOpensAt, lang) }],
    },
    tournament.registrationClosesAt && {
      key: 'registration-closes',
      label: pick('إغلاق التسجيل', 'Registration Closes'),
      at: tournament.registrationClosesAt,
      lines: [{ date: dayAndDate(tournament.registrationClosesAt, lang), time: timeOf(tournament.registrationClosesAt, lang) }],
    },
    tournament.onSiteCheckInStartsAt && {
      key: 'medical',
      label: pick('الفحص الطبي والوزن', 'Medical Examination & Weigh-in'),
      at: tournament.onSiteCheckInStartsAt,
      lines: medicalLines(tournament.onSiteCheckInStartsAt, tournament.onSiteCheckInEndsAt, lang),
    },
    activity.startDate && {
      key: 'competition',
      label: pick('أيام المنافسات', 'Competition Days'),
      at: activity.startDate,
      lines: [{ date: dates }],
    },
  ].filter(Boolean);

  const heroMeta = [
    { key: 'dates', Icon: IconCalendar, value: dates },
    { key: 'location', Icon: IconLocation, value: activity.location },
    { key: 'divisions', Icon: IconTrophy, value: divisionCount },
  ].filter((item) => item.value);
  const banner = String(activity.imageUrl || '').trim();

  return (
    <>
      {/* The site's own green page header, full width. The tournament's
          banner, when it has one, is its background under the green overlay;
          without one the header is the plain green. */}
      <PageHero
        className="page-hero--tournament"
        title={activity.title}
        breadcrumb={[
          { label: pick('الأنشطة', 'Activities'), to: '/activities/calendar' },
          { label: activity.title },
        ]}
        image={banner || undefined}
        imageCrop={banner ? activity.imageCrop : undefined}
        plain={!banner}
      >
        {heroMeta.length > 0 && (
          <ul className="tpage-hero__meta">
            {heroMeta.map(({ key, Icon, value }) => (
              <li key={key}>
                <Icon className="tpage-hero__meta-icon" aria-hidden="true" />
                <span>{value}</span>
              </li>
            ))}
          </ul>
        )}
      </PageHero>

    <section className="section--white tpage">
      <div className="container">
        <TournamentSectionNav active={section} onChange={choose} ar={ar} />

        <div
          className="tpage-panel"
          role="tabpanel"
          id={`tpage-panel-${section}`}
          aria-labelledby={`tpage-tab-${section}`}
        >
          {section === 'overview' && (
            <>
              <TournamentOverview description={activity.description} facts={facts} ar={ar} />
              <TournamentKeyDates milestones={milestones} ar={ar} />
            </>
          )}

          {section === 'divisions' && <TournamentDivisions divisions={orderedDivisions} ar={ar} />}

          {section === 'terms' && (
            <TournamentTerms termsAr={tournament.termsAr} termsEn={tournament.termsEn} ar={ar} />
          )}

          {/* The Draw tab lists every division and shows a division's bracket once
              its draw is published. Match Schedule and Results come in later
              phases: for now a placeholder, never sample bouts or scores. The
              tournament's milestones are in Overview's Key Dates. */}
          {section === 'draw' && (
            <TournamentDraw tournamentId={tournamentNumber} divisions={tournament.divisions || []} ar={ar} />
          )}

          {section === 'schedule' && <TournamentMatchSchedule tournamentId={tournamentNumber} ar={ar} />}

          {section === 'results' && (
            <TournamentPlaceholder
              id="tsection-results-title"
              title={pick('النتائج', 'Results')}
              message={pick('سيتم عرض النتائج هنا عند توفرها.', 'Results will be shown here once they are available.')}
              Icon={IconTrophy}
            />
          )}
        </div>

        <div className="tdetail__actions">
          {/* Signing in comes first: a visitor who is not signed in goes to
              Login, which brings them back to this tournament afterwards.
              A signed-in member is taken to this tournament in their account. */}
          {tournament.registrationOpen ? (
            <Link
              to={getToken()
                ? accountLink
                : `/account/login?next=${encodeURIComponent(`/activities/event/${activity.id}`)}`}
              className="btn btn--green"
            >
              {pick('التسجيل في البطولة', 'Register for Tournament')}
            </Link>
          ) : (
            <button type="button" className="btn btn--green" disabled>
              {pick('التسجيل في البطولة', 'Register for Tournament')}
            </button>
          )}
        </div>
      </div>
    </section>
    </>
  );
}

/**
 * "11 – 18 ديسمبر 2026" / "11–18 December 2026": the month and year written
 * once when the two days share them, as the browser's own range formatting
 * does. Falls back to the site's usual "start – end".
 */
function dateSpan(start, end, lang) {
  if (!end) return formatDateRange(start, null, lang);
  try {
    const format = new Intl.DateTimeFormat(intlLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' });
    if (typeof format.formatRange !== 'function') throw new Error('no formatRange');
    return toLatinDigits(format.formatRange(new Date(start), new Date(end)));
  } catch {
    return formatDateRange(start, end, lang);
  }
}

/** "10 فئات" / "10 Divisions", with the Arabic number agreement. */
function countLabel(n, ar) {
  if (!ar) return `${n} ${n === 1 ? 'Division' : 'Divisions'}`;
  if (n === 1) return 'فئة واحدة';
  if (n === 2) return 'فئتان';
  return n <= 10 ? `${n} فئات` : `${n} فئة`;
}

/** "الأربعاء 08 يوليو 2026" / "Wednesday, 08 July 2026". */
function dayAndDate(value, lang) {
  try {
    return toLatinDigits(new Date(value).toLocaleDateString(intlLocale(lang), {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    }));
  } catch {
    return toLatinDigits(String(value).slice(0, 10));
  }
}

/**
 * The medical examination and weigh-in: its first day and starting time, then
 * — when it has an end — "إلى" / "to" with the end's day and time on a line
 * of its own. No dash between them, so nothing is left to flip in Arabic.
 */
function medicalLines(starts, ends, lang) {
  const lines = [{ date: dayAndDate(starts, lang), time: timeOf(starts, lang) }];
  if (ends) lines.push({ prefix: lang === 'ar' ? 'إلى' : 'to', date: dayAndDate(ends, lang), time: timeOf(ends, lang) });
  return lines;
}

/** The time of day on the 12-hour clock, when the value carries one (midnight means a date only). */
function timeOf(value, lang) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || (d.getHours() === 0 && d.getMinutes() === 0)) return '';
  return formatTime12(d, lang);
}
