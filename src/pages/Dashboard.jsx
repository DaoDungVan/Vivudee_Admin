import { useState, useEffect } from 'react'
import { getStatistics, getFlights, getUsers, getBookings } from '../api'
import { useAuth } from '../context/AuthContext'
import {
  LuLayoutDashboard, LuTicket, LuCircleDollarSign, LuUndo2, LuUsers,
  LuChartBar, LuLightbulb, LuTrophy, LuCalendarDays, LuPlane, LuArrowRight,
} from 'react-icons/lu'

const fmtCurrency = (n) => {
  if (n == null || n === '' || isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n))
}

const fmt = (n) => {
  if (n == null) return '—'
  const num = Number(n)
  if (isNaN(num)) return '—'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return String(num)
}

function StatCard({ icon, value, label, color, bg }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

const STATUS_COLOR = {
  confirmed: 'var(--success)',
  pending:   'var(--warning)',
  cancelled: 'var(--danger)',
  expired:   'var(--text-muted)',
  default:   'var(--accent)',
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats]       = useState(null)
  const [counts, setCounts]     = useState({ flights: 0, users: 0, bookings: 0 })
  const [loading, setLoading]   = useState(true)
  const [dateRange, setDateRange] = useState({ from_date: '', to_date: '' })

  const load = (silent = false) => {
    if (!silent) setLoading(true)

    const statParams = {}
    if (dateRange.from_date && dateRange.to_date) {
      statParams.from_date = dateRange.from_date
      statParams.to_date   = dateRange.to_date
    }

    Promise.all([
      getStatistics(statParams),
      getFlights({ page: 1, limit: 1, show_hidden: true }),
      getUsers({ page: 1, limit: 1 }),
      getBookings({ page: 1, limit: 1 }),
    ])
      .then(([statRes, flightRes, userRes, bookingRes]) => {
        setStats(statRes.data?.data || statRes.data || {})
        setCounts({
          flights:  flightRes.data?.pagination?.total  ?? 0,
          users:    userRes.data?.pagination?.total    ?? 0,
          bookings: bookingRes.data?.pagination?.total ?? 0,
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 5_000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line


  const overview        = stats?.overview || {}
  const bookingSummary  = stats?.booking_summary  || []
  const dailyRevenue    = stats?.daily_revenue    || []
  const popularFlights  = stats?.popular_flights  || []

  const totalBookings  = Number(overview.total_bookings)  || 0
  const totalRevenue   = Number(overview.total_revenue)   || 0
  const totalRefunded  = Number(overview.total_refunded)  || 0
  const netRevenue     = totalRevenue - totalRefunded

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LuLayoutDashboard size={20}/> Bảng điều khiển</div>
          <div className="page-subtitle">Tổng quan hệ thống Vivudee</div>
        </div>
        <div className="header-right" style={{ gap: 10 }}>
          <input
            type="date"
            className="filter-select"
            value={dateRange.from_date}
            onChange={e => setDateRange(p => ({ ...p, from_date: e.target.value }))}
            style={{ fontSize: 13 }}
          />
          <LuArrowRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
          <input
            type="date"
            className="filter-select"
            value={dateRange.to_date}
            onChange={e => setDateRange(p => ({ ...p, to_date: e.target.value }))}
            style={{ fontSize: 13 }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Tự động cập nhật 5s
          </span>
          <button className="btn btn-primary btn-sm" onClick={load}>Lọc</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setDateRange({ from_date: '', to_date: '' }); setTimeout(load, 0) }}>Xoá lọc</button>
          <div className="admin-badge">
            <div className="admin-avatar">{(user?.full_name || 'A')[0].toUpperCase()}</div>
            {user?.full_name || 'Admin'}
          </div>
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div className="loading-wrap">
            <div className="spinner" />
            <span style={{ color: 'var(--text-muted)' }}>Đang tải thống kê...</span>
          </div>
        ) : (
          <>
            <div className="stat-grid">
              <StatCard icon={<LuTicket size={22} color="var(--accent-light)"/>}          value={fmt(totalBookings)}        label="Tổng đặt vé"              color="var(--accent-light)" bg="var(--info-bg)" />
              <StatCard icon={<LuCircleDollarSign size={22} color="var(--success)"/>}     value={fmtCurrency(netRevenue)}   label="Doanh thu thực (sau hoàn)" color="var(--success)"      bg="var(--success-bg)" />
              <StatCard icon={<LuUndo2 size={22} color="var(--danger)"/>}                 value={fmtCurrency(totalRefunded)} label="Đã hoàn tiền"             color="var(--danger)"       bg="var(--danger-bg)" />
              <StatCard icon={<LuUsers size={22} color="var(--info)"/>}                   value={fmt(counts.users)}         label="Tổng người dùng"          color="var(--info)"         bg="var(--info-bg)" />
            </div>

            <div className="responsive-two-col" style={{ marginBottom: 20 }}>

              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><LuChartBar size={16}/> Đặt vé theo trạng thái</div>
                {bookingSummary.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon"><LuChartBar size={36}/></div><div className="empty-text">Không có dữ liệu</div></div>
                ) : bookingSummary.map(row => {
                  const pct = totalBookings > 0 ? (Number(row.count) / totalBookings) * 100 : 0
                  const color = STATUS_COLOR[row.status] || STATUS_COLOR.default
                  return (
                    <div key={row.status} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                        <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{row.status}</span>
                        <span style={{ fontWeight: 600 }}>{row.count} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct.toFixed(1)}%)</span></span>
                      </div>
                      <div style={{ height: 7, background: 'var(--bg-input)', borderRadius: 99 }}>
                        <div style={{ height: '100%', borderRadius: 99, background: color, width: `${Math.min(pct, 100)}%`, transition: 'width 0.5s ease' }} />
                      </div>
                      {row.revenue && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          Doanh thu: {fmtCurrency(row.revenue)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><LuLightbulb size={16}/> Chi tiết tổng quan</div>
                {[
                  ['Tổng đặt vé hợp lệ',       fmt(overview.total_bookings)],
                  ['Đã xác nhận',               fmt(overview.confirmed)],
                  ['Đang chờ',                  fmt(overview.pending)],
                  ['Đã huỷ',                    fmt(overview.cancelled)],
                  ['Hết hạn',                   fmt(overview.expired)],
                  ['Tổng hành khách',            fmt(overview.total_passengers)],
                  ['Tổng doanh thu (gộp)',       fmtCurrency(overview.total_revenue)],
                  ['Đã hoàn tiền',               fmtCurrency(overview.total_refunded)],
                  ['Doanh thu thực (sau hoàn)',  fmtCurrency(netRevenue)],
                  ['Tổng booking hệ thống',      fmt(counts.bookings)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="responsive-two-col">

              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><LuTrophy size={16}/> Chuyến bay phổ biến nhất</div>
                {popularFlights.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon"><LuPlane size={36}/></div><div className="empty-text">Không có dữ liệu</div></div>
                ) : popularFlights.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '10px', background: 'var(--bg-input)', borderRadius: 8 }}>
                    <span style={{ width: 28, height: 28, background: i === 0 ? 'var(--warning)' : 'var(--bg-card)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: i === 0 ? '#000' : 'var(--text-secondary)', flexShrink: 0 }}>#{i+1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{f.flight_number} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {f.airline}</span></div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{f.from_city} → {f.to_city}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--accent-light)' }}>{f.total_bookings}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>lượt đặt</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><LuCalendarDays size={16}/> Doanh thu 7 ngày gần nhất</div>
                {dailyRevenue.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon"><LuCalendarDays size={36}/></div><div className="empty-text">Không có dữ liệu</div></div>
                ) : (() => {
                  const maxRev = Math.max(...dailyRevenue.map(r => Number(r.revenue) || 0), 1)
                  return dailyRevenue.slice(0, 7).map((r, i) => {
                    const rev = Number(r.revenue) || 0
                    const pct = (rev / maxRev) * 100
                    return (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{new Date(r.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
                          <span style={{ fontWeight: 600 }}>{fmtCurrency(rev)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({r.bookings} vé)</span></span>
                        </div>
                        <div style={{ height: 7, background: 'var(--bg-input)', borderRadius: 99 }}>
                          <div style={{ height: '100%', borderRadius: 99, background: 'var(--accent)', width: `${Math.min(pct, 100)}%`, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
</>
        )}
      </div>
    </>
  )
}
