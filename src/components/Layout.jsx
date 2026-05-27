import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LogoNav from '../assets/imgs/LogoNav.svg'
import {
  LuLayoutDashboard, LuPlane, LuBuilding2, LuPlaneTakeoff, LuUsers,
  LuTicket, LuTag, LuMessageSquare, LuUndo2, LuSettings, LuX, LuMenu, LuLogOut,
  LuTriangleAlert, LuCalendarDays,
} from 'react-icons/lu'

const getLocalTZ = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const isVietnamTZ = () => {
  const tz = getLocalTZ()
  return tz === 'Asia/Ho_Chi_Minh' || tz === 'Asia/Saigon'
}

const navItems = [
  { to: '/',         icon: <LuLayoutDashboard size={18}/>, label: 'Tổng quan' },
  { to: '/flights',   icon: <LuPlane size={18}/>,           label: 'Chuyến Bay' },
  { to: '/schedules', icon: <LuCalendarDays size={18}/>,    label: 'Lịch Bay' },
  { to: '/airports', icon: <LuBuilding2 size={18}/>,       label: 'Sân Bay' },
  { to: '/airlines', icon: <LuPlaneTakeoff size={18}/>,    label: 'Hãng Bay' },
  { to: '/users',    icon: <LuUsers size={18}/>,           label: 'Người Dùng' },
  { to: '/bookings', icon: <LuTicket size={18}/>,          label: 'Đặt Vé' },
  { to: '/coupons',  icon: <LuTag size={18}/>,             label: 'Coupon' },
  { to: '/chat',     icon: <LuMessageSquare size={18}/>,   label: 'Hỗ Trợ Chat' },
  { to: '/refunds',  icon: <LuUndo2 size={18}/>,           label: 'Hoàn Tiền' },
  { to: '/system',   icon: <LuSettings size={18}/>,        label: 'Hệ Thống' },
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
        aria-label={mobileNavOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
        aria-expanded={mobileNavOpen}
        onClick={() => setMobileNavOpen(open => !open)}
      >
        {mobileNavOpen ? <LuX size={20}/> : <LuMenu size={20}/>}
      </button>

      {mobileNavOpen && <button type="button" className="sidebar-backdrop" aria-label="Đóng lớp phủ menu" onClick={() => setMobileNavOpen(false)} />}

      <aside className={`sidebar${mobileNavOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <img src={LogoNav} alt="VivuDee"/>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">Điều hướng</div>
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
          <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleLogout}>
            <LuLogOut size={15}/> Đăng xuất
          </button>
        </div>
      </aside>

      <div className="main-content">
        {!isVietnamTZ() && (
          <div style={{
            background: '#fef3c7', borderBottom: '1px solid #f59e0b',
            padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: '#92400e',
          }}>
            <LuTriangleAlert size={14} style={{ flexShrink: 0, color: '#d97706' }}/>
            <span>
              <b>Múi giờ khác Việt Nam</b> — Trình duyệt đang dùng <b>{getLocalTZ()}</b>.
              Tất cả thời gian trong hệ thống theo <b>giờ Việt Nam (ICT, UTC+7)</b>.
              Khi nhập giờ khởi hành / giờ đến, hãy nhập theo giờ Việt Nam.
            </span>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  )
}
