import { Navigate, Route, Routes } from 'react-router-dom'
import { MobileShell } from '../components/MobileShell'
import { AdminPage } from '../pages/AdminPage'
import { CalendarPage } from '../pages/CalendarPage'
import { ForumPage } from '../pages/ForumPage'
import { HistoryPage } from '../pages/HistoryPage'
import { HomePage } from '../pages/HomePage'
import { LibraryPage } from '../pages/LibraryPage'
import { LoginPage } from '../pages/LoginPage'
import { NominationsPage } from '../pages/NominationsPage'
import { ProfilePage } from '../pages/ProfilePage'
import { ReaderPage } from '../pages/ReaderPage'
import { ThemePage } from '../pages/ThemePage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/app" element={<MobileShell />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="reader" element={<ReaderPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="forum" element={<ForumPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="nominations" element={<NominationsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="theme" element={<ThemePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
