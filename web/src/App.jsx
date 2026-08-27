import { Navigate, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Overview from './pages/organization/Overview';
import History from './pages/organization/History';
import Values from './pages/organization/Values';
import Strategy from './pages/organization/Strategy';
import Initiatives from './pages/organization/Initiatives';
import Goals from './pages/organization/Goals';
import Achievements from './pages/organization/Achievements';
import ResultsArchive from './pages/organization/ResultsArchive';
import News from './pages/News';
import NewsDetail from './pages/NewsDetail';
import Calendar from './pages/Calendar';
import EventDetail from './pages/EventDetail';
import Registration from './pages/Registration';
import RegistrationHub from './pages/RegistrationHub';
import Clubs from './pages/Clubs';
import Whistleblower from './pages/Whistleblower';
import Contact from './pages/Contact';
import Placeholder from './pages/Placeholder';
import Recognition from './pages/governance/Recognition';
import Hq from './pages/governance/Hq';
import Committees from './pages/governance/Committees';
import HealthDoping from './pages/governance/HealthDoping';
import Reports from './pages/governance/Reports';
import Policies from './pages/governance/Policies';
import AboutHistory from './pages/about/History';
import AboutPillars from './pages/about/Pillars';
import AboutDisciplines from './pages/about/Disciplines';
import AboutRules from './pages/about/Rules';
import AboutEquipment from './pages/about/Equipment';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="organization/overview" element={<Overview />} />
        <Route path="organization/history" element={<History />} />
        <Route path="organization/values" element={<Values />} />
        <Route path="organization/strategy" element={<Strategy />} />
        <Route path="organization/initiatives" element={<Initiatives />} />
        <Route path="organization/goals" element={<Goals />} />
        <Route path="organization/achievements" element={<Achievements />} />
        <Route path="organization/results-archive" element={<ResultsArchive />} />

        <Route path="governance/recognition" element={<Recognition />} />
        <Route path="governance/hq" element={<Hq />} />
        <Route path="governance/committees" element={<Committees />} />
        <Route path="governance/health-doping" element={<HealthDoping />} />
        <Route path="governance/reports" element={<Reports />} />
        <Route path="governance/policies" element={<Policies />} />
        {/* QA-01 — legacy permalinks, kept deliberately.
            These are not unfinished pages: each is an alias for a page that is
            already in the main navigation, so a link published elsewhere (or
            bookmarked from the previous site) still lands somewhere real
            instead of on a 404. They are grouped and labelled here so the next
            audit does not read them as orphaned routes. */}
        <Route path="governance/board" element={<Navigate to="/governance/hq" replace />} />
        <Route path="governance/staff" element={<Navigate to="/governance/hq" replace />} />
        <Route path="governance/docs" element={<Navigate to="/governance/policies" replace />} />

        <Route path="about-muaythai/history" element={<AboutHistory />} />
        <Route path="about-muaythai/pillars" element={<AboutPillars />} />
        <Route path="about-muaythai/disciplines" element={<AboutDisciplines />} />
        <Route path="about-muaythai/rules" element={<AboutRules />} />
        <Route path="about-muaythai/equipment" element={<AboutEquipment />} />
        <Route path="about-muaythai/what-is-muaythai" element={<Navigate to="/about-muaythai/history" replace />} />

        <Route path="news" element={<News />} />
        <Route path="news/:id" element={<NewsDetail />} />
        <Route path="activities/calendar" element={<Calendar />} />
        <Route path="activities/event/:id" element={<EventDetail />} />
        <Route path="registration/:type" element={<Registration />} />
        <Route path="registration" element={<RegistrationHub />} />
        <Route path="clubs" element={<Clubs />} />
        {/* QA-01 — the "Try Muaythai" call to action in the header and the
            footer now points here rather than straight at /clubs, so the route
            is reachable from the navigation instead of only by typing it. */}
        <Route path="try-muaythai" element={<Navigate to="/clubs" replace />} />
        <Route path="whistleblower" element={<Whistleblower />} />
        <Route path="contact" element={<Contact />} />
        <Route path="*" element={<Placeholder section="notfound" />} />
      </Route>
    </Routes>
  );
}
