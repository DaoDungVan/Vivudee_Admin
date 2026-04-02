import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LogoNav from '../assets/imgs/LogoNav.svg'

const navItems = [
  { to: '/', icon: '📊', label: 'Dashboard' },
  { to: '/flights', icon: '✈️', label: 'Chuyến Bay' },
  { to: '/airports', icon: '🏢', label: 'Sân Bay' },
  { to: '/airlines', icon: '🛫', label: 'Hãng Bay' },
  { to: '/users', icon: '👥', label: 'Người Dùng' },
  { to: '/bookings', icon: '🎫', label: 'Đặt Vé' },
  { to: '/coupons', icon: '🏷️', label: 'Coupon' },
]

export default function Layout() {
  const { user, signout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const handleLogout = () => { signout(); navigate('/login') }

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024) setMobileNavOpen(false)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('sidebar-open', mobileNavOpen)
    return () => document.body.classList.remove('sidebar-open')
  }, [mobileNavOpen])

  return (
    <div className="app-layout">
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileNavOpen}
        onClick={() => setMobileNavOpen(open => !open)}
      >
        {mobileNavOpen ? '✕' : '☰'}
      </button>

      {mobileNavOpen && <button type="button" className="sidebar-backdrop" aria-label="Close menu overlay" onClick={() => setMobileNavOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar${mobileNavOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <img src={LogoNav} alt="VivuDee"/>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">Navigation</div>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={() => setMobileNavOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="sidebar-footer">
          <div style={{ marginBottom: '10px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            {user?.full_name || user?.email || 'Admin'}
          </div>
          <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={handleLogout}>
            🚪 Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  )
}
