import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/Login'
import DashboardPage from './pages/Dashboard'
import FlightsPage from './pages/Flights'
import AirportsPage from './pages/Airports'
import AirlinesPage from './pages/Airlines'
import UsersPage from './pages/Users'
import BookingsPage from './pages/Bookings'
import CouponsPage from './pages/Coupons'
import ChatPage from './pages/Chat'
import RefundsPage from './pages/Refunds'
import SystemPage from './pages/System'
import FlightSchedulesPage from './pages/FlightSchedules'

function PrivateRoute({ children }) {
  const { token, user } = useAuth()

  if (!token) return <Navigate to="/login" replace />
  if (user && user.role !== 'admin') return <Navigate to="/login" replace />

  return children
}

function PublicRoute({ children }) {
  const { token, user } = useAuth()

  if (token && user?.role === 'admin') return <Navigate to="/" replace />

  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="flights" element={<FlightsPage />} />
            <Route path="schedules" element={<FlightSchedulesPage />} />
            <Route path="airports" element={<AirportsPage />} />
            <Route path="airlines" element={<AirlinesPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="bookings" element={<BookingsPage />} />
            <Route path="coupons" element={<CouponsPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="refunds" element={<RefundsPage />} />
            <Route path="system" element={<SystemPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
