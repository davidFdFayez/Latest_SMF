import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewsList from './pages/NewsList'
import NewsEdit from './pages/NewsEdit'
import EventsList from './pages/EventsList'
import EventEdit from './pages/EventEdit'
import ResultsList from './pages/ResultsList'
import ResultEdit from './pages/ResultEdit'
import PagesList from './pages/PagesList'
import PageEdit from './pages/PageEdit'
import RegistrationsList from './pages/RegistrationsList'
import ContactList from './pages/ContactList'
import WhistleblowerList from './pages/WhistleblowerList'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />

              <Route path="news" element={<NewsList />} />
              <Route path="news/new" element={<NewsEdit />} />
              <Route path="news/:id" element={<NewsEdit />} />

              <Route path="events" element={<EventsList />} />
              <Route path="events/new" element={<EventEdit />} />
              <Route path="events/:id" element={<EventEdit />} />

              <Route path="results" element={<ResultsList />} />
              <Route path="results/new" element={<ResultEdit />} />
              <Route path="results/:id" element={<ResultEdit />} />

              <Route path="pages" element={<PagesList />} />
              <Route path="pages/:slug" element={<PageEdit />} />

              <Route path="registrations" element={<RegistrationsList />} />
              <Route path="contact" element={<ContactList />} />
              <Route path="whistleblower" element={<WhistleblowerList />} />
              <Route path="settings" element={<Settings />} />

              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
