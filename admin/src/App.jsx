import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import RequirePermission from './components/RequirePermission'
import Layout from './components/Layout'

import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import NewsList from './pages/NewsList'
import NewsEdit from './pages/NewsEdit'
import EventsList from './pages/EventsList'
import EventEdit from './pages/EventEdit'
import ResultsList from './pages/ResultsList'
import ResultEdit from './pages/ResultEdit'
import ContentList from './pages/ContentList'
import ContentEdit from './pages/ContentEdit'
import RegistrationsList from './pages/RegistrationsList'
import MembersList from './pages/MembersList'
import MemberProfile from './pages/MemberProfile'
import TournamentsList from './pages/TournamentsList'
import TournamentEdit from './pages/TournamentEdit'
import TournamentEntries from './pages/TournamentEntries'
import TournamentDraw from './pages/TournamentDraw'
import TournamentSchedule from './pages/TournamentSchedule'
import MemberAccountsList from './pages/MemberAccountsList'
import RegistrationReview from './pages/RegistrationReview'
import ContactList from './pages/ContactList'
import WhistleblowerList from './pages/WhistleblowerList'
import UsersList from './pages/UsersList'
import UserEdit from './pages/UserEdit'
import RolesList from './pages/RolesList'
import RoleEdit from './pages/RoleEdit'
import AuditLog from './pages/AuditLog'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />

              <Route element={<RequirePermission permission="news" />}>
                <Route path="news" element={<NewsList />} />
                <Route path="news/new" element={<NewsEdit />} />
                <Route path="news/:id" element={<NewsEdit />} />
              </Route>

              {/* Medal results are tournament data, so both sit behind "events". */}
              <Route element={<RequirePermission permission="events" />}>
                <Route path="events" element={<EventsList />} />
                <Route path="events/new" element={<EventEdit />} />
                <Route path="events/:id" element={<EventEdit />} />

                <Route path="results" element={<ResultsList />} />
                <Route path="results/new" element={<ResultEdit />} />
                <Route path="results/:id" element={<ResultEdit />} />
              </Route>

              <Route element={<RequirePermission permission={['content.publish', 'settings']} />}>
                <Route path="content" element={<ContentList />} />
                <Route path="content/:key" element={<ContentEdit />} />
              </Route>
              {/* The old JSON page editor and key/value settings screen were
                  replaced by Website Content; keep their addresses working. */}
              <Route path="pages/*" element={<Navigate to="/content" replace />} />
              <Route path="settings" element={<Navigate to="/content" replace />} />

              <Route element={<RequirePermission membershipAction="view" />}>
                <Route path="registrations" element={<RegistrationsList />} />
                <Route path="registrations/:id" element={<RegistrationReview />} />
                {/* ISSUE-03 — the beneficiary, not the application they filled in. */}
                <Route path="members" element={<MembersList />} />
                <Route path="members/:id" element={<MemberProfile />} />
              </Route>

              {/* Phase 3 — running a tournament. Each stage checks its own
                  permission at the API; the section opens for anyone who holds
                  any of them. */}
              <Route
                element={
                  <RequirePermission
                    permission={[
                      'tournament.manage',
                      'tournament.entries',
                      'tournament.technical',
                      'tournament.draw',
                      'tournament.schedule',
                    ]}
                  />
                }
              >
                <Route path="tournaments" element={<TournamentsList />} />
                <Route path="tournaments/new" element={<TournamentEdit />} />
                <Route path="tournaments/:id" element={<TournamentEdit />} />
                <Route path="tournaments/:id/entries" element={<TournamentEntries />} />
                <Route path="tournaments/:id/draw" element={<TournamentDraw />} />
                <Route path="tournaments/:id/schedule" element={<TournamentSchedule />} />
              </Route>

              <Route element={<RequirePermission permission={['users', 'tournament.entries']} />}>
                <Route path="member-accounts" element={<MemberAccountsList />} />
              </Route>
              <Route element={<RequirePermission permission="support" />}>
                <Route path="contact" element={<ContactList />} />
              </Route>
              <Route element={<RequirePermission permission="whistleblower" />}>
                <Route path="whistleblower" element={<WhistleblowerList />} />
              </Route>

              <Route element={<RequirePermission permission="users" />}>
                <Route path="users" element={<UsersList />} />
                <Route path="users/new" element={<UserEdit />} />
                <Route path="users/:id" element={<UserEdit />} />
              </Route>
              <Route element={<RequirePermission permission={['users', 'permissions']} />}>
                <Route path="audit" element={<AuditLog />} />
              </Route>
              <Route element={<RequirePermission permission="permissions" />}>
                <Route path="roles" element={<RolesList />} />
                <Route path="roles/new" element={<RoleEdit />} />
                <Route path="roles/:id" element={<RoleEdit />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
