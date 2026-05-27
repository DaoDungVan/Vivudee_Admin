import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getStatistics, getFlights, getUsers, getBookings, getAdminRefunds } from '../api'
import { useAuth } from '../context/AuthContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  LuLayoutDashboard, LuTicket, LuCircleDollarSign, LuUndo2, LuUsers,
  LuChartBar, LuLightbulb, LuTrophy, LuCalendarDays, LuPlane, LuArrowRight,
  LuX, LuTriangleAlert, LuClock,
} from 'react-icons/lu'

// ── Formatters ─────────────────────────────────────────────────────────────────

const fmtCurrency = (n) => {
  if (n == null || n === '' || isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(n)) + ' VND'
}

const fmt = (n) => {
  if (n == null) return '—'
  const num = Number(n)
  if (isNaN(num)) return '—'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return String(num)
}

const toDateStr = (val) => {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  const m = String(val).match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : ''
}

const toVNDateStr = (val) => {
  if (!val) return ''
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(val))
  } catch { return '' }
}

const localToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

// ── Lookup maps ────────────────────────────────────────────────────────────────

const STATUS_LABEL_VI = {
  confirmed:     'Đã xác nhận',
  pending:       'Chờ thanh toán',
  cancelled:     'Đã huỷ',
  expired:       'Hết hạn',
  refund_pending:'Chờ hoàn tiền',
  refunded:      'Hoàn tiền xong',
}
const STATUS_COLOR = {
  confirmed:     '#22c55e',
  pending:       '#f59e0b',
  cancelled:     '#ef4444',
  expired:       '#94a3b8',
  refund_pending:'#8b5cf6',
  refunded:      '#06b6d4',
}
const STATUS_BADGE = {
  confirmed:     'badge-success',
  pending:       'badge-warning',
  cancelled:     'badge-danger',
  expired:       'badge-muted',
  refund_pending:'badge-info',
  refunded:      'badge-info',
}

const FLIGHT_STATUS_LABEL = {
  scheduled: 'Đã lên lịch',
  delayed:   'Trễ giờ',
  boarding:  'Lên máy bay',
  departed:  'Đã khởi hành',
  arrived:   'Đã hạ cánh',
  cancelled: 'Đã huỷ',
  completed: 'Hoàn thành',
}
const FLIGHT_STATUS_BADGE = {
  scheduled: 'badge-info',
  delayed:   'badge-warning',
  boarding:  'badge-warning',
  departed:  'badge-success',
  arrived:   'badge-success',
  cancelled: 'badge-danger',
  completed: 'badge-muted',
}

const DOW_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ icon, value, label, color, bg }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function RevenueTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const date = new Date(d.dateStr + 'T00:00:00')
  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#f1f5f9' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        {DOW_VI[date.getDay()]} · {date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
        {d.isToday && <span style={{ marginLeft: 6, background: '#22c55e', color: '#000', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>Hôm nay</span>}
      </div>
      <div style={{ color: '#94a3b8' }}>Doanh thu: <span style={{ color: '#22c55e', fontWeight: 700 }}>{fmtCurrency(d.revenue)}</span></div>
      {d.refunded > 0 && <>
        <div style={{ color: '#94a3b8' }}>Hoàn tiền: <span style={{ color: '#ef4444', fontWeight: 600 }}>-{fmtCurrency(d.refunded)}</span></div>
        <div style={{ color: '#94a3b8', borderTop: '1px solid #334155', paddingTop: 4, marginTop: 2 }}>Thực thu: <span style={{ color: '#22c55e', fontWeight: 700 }}>{fmtCurrency(d.revenue - d.refunded)}</span></div>
      </>}
      <div style={{ color: '#94a3b8' }}>Tất cả vé: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{Number(d.bookings || 0).toLocaleString('vi-VN')}</span></div>
      <div style={{ color: '#94a3b8' }}>Hợp lệ: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{Number(d.valid_bookings || 0).toLocaleString('vi-VN')}</span></div>
      <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>Nhấn để xem chi tiết</div>
    </div>
  )
}

function CustomXTick({ x, y, payload }) {
  const ds = payload.value
  const d  = new Date(ds + 'T00:00:00')
  const isWknd = d.getDay() === 0 || d.getDay() === 6
  const today  = localToday()
  const isToday = ds === today
  const color = isToday ? '#22c55e' : isWknd ? '#8b5cf6' : '#94a3b8'
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill={color} fontSize={11} fontWeight={isToday ? 700 : 400}>
        {DOW_VI[d.getDay()]}
      </text>
      <text x={0} y={0} dy={24} textAnchor="middle" fill={color} fontSize={10}>
        {d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
      </text>
    </g>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth()

  const [stats, setStats]           = useState(null)
  const [counts, setCounts]         = useState({ flights: 0, users: 0, bookings: 0 })
  const [loading, setLoading]       = useState(true)
  const [dateRange, setDateRange]   = useState({ from_date: '', to_date: '' })
  const dateRangeRef                = useRef({ from_date: '', to_date: '' })

  const [selectedDay, setSelectedDay]   = useState(null)
  const [dayBookings, setDayBookings]   = useState([])
  const [dayLoading, setDayLoading]     = useState(false)

  const [recentBookings, setRecentBookings]     = useState([])
  const [todayFlights, setTodayFlights]         = useState([])
  const [todayFlightTotal, setTodayFlightTotal] = useState(0)
  const [statsError, setStatsError]             = useState(null)
  const [pendingRefunds, setPendingRefunds]     = useState(0)

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    const { from_date, to_date } = dateRangeRef.current
    const statParams = {}
    if (from_date && to_date) {
      statParams.from_date = from_date
      statParams.to_date   = to_date
    }
    const todayStr = localToday()
    getStatistics(statParams)
      .then(statRes => {
        setStats(statRes.data?.data || statRes.data || {})
        setStatsError(null)
      })
      .catch(err => {
        setStatsError(err?.response?.data?.error || 'Lỗi tải thống kê')
        console.error('[stats]', err?.response?.data || err)
      })
    Promise.all([
      getFlights({ page: 1, limit: 1, show_hidden: true }),
      getUsers({ page: 1, limit: 1 }),
      getBookings({ page: 1, limit: 8 }),
      getFlights({ page: 1, limit: 8, departure_date: todayStr, show_hidden: true }),
      getAdminRefunds({ status: 'pending', limit: 1, page: 1 }),
    ])
      .then(([flightRes, userRes, bookingRes, todayFlightRes, refundRes]) => {
        setCounts({
          flights:  flightRes.data?.pagination?.total  ?? 0,
          users:    userRes.data?.pagination?.total    ?? 0,
          bookings: bookingRes.data?.pagination?.total ?? 0,
        })
        setRecentBookings(bookingRes.data?.data || [])
        setTodayFlights(todayFlightRes.data?.data || [])
        setTodayFlightTotal(todayFlightRes.data?.pagination?.total ?? 0)
        setPendingRefunds(refundRes.data?.pagination?.total ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 10_000)
    return () => clearInterval(interval)
  }, [load])

  const openDayDetail = async (dateStr) => {
    if (!dateStr) return
    setSelectedDay(dateStr)
    setDayLoading(true)
    setDayBookings([])
    try {
      const res = await getBookings({ from_date: dateStr, to_date: dateStr, limit: 500, page: 1 })
      const all = res.data?.data || []
      setDayBookings(all.filter(b => toVNDateStr(b.created_at) === dateStr))
    } catch {
      setDayBookings([])
    } finally {
      setDayLoading(false)
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const overview       = stats?.overview        || {}
  const bookingSummary = stats?.booking_summary  || []
  const dailyRevenue   = stats?.daily_revenue    || []
  const popularFlights = stats?.popular_flights  || []

  const totalRevenue     = Number(overview.total_revenue)  || 0
  const totalRefunded    = Number(overview.total_refunded) || 0
  const netRevenue       = totalRevenue - totalRefunded
  const totalAllBookings = bookingSummary.reduce((sum, r) => sum + Number(r.count), 0)

  const getStatusCount    = (st) => Number(bookingSummary.find(r => r.status === st)?.count || 0)
  const validCount        = Number(overview.total_bookings) || 0
  const cancelExpireCount = (Number(overview.cancelled) || 0) + (Number(overview.expired) || 0)
  const successRate       = totalAllBookings > 0 ? ((Number(overview.confirmed) || 0) / totalAllBookings * 100).toFixed(1) : null
  const refundRate        = totalRevenue > 0 ? (totalRefunded / totalRevenue * 100).toFixed(1) : null
  const avgOrderValue     = validCount > 0 ? Math.round(totalRevenue / validCount) : 0
  const refundPendingCount = getStatusCount('refund_pending')

  const today = localToday()

  // Build full 7-day range (today VN and 6 days back), fill 0 for days without data
  const revenueByDate = {}
  dailyRevenue.forEach(r => { revenueByDate[toDateStr(r.date)] = r })

  const [ty, tm, td] = today.split('-').map(Number)
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const dateObj = new Date(ty, tm - 1, td - (6 - i))
    const ds = [
      dateObj.getFullYear(),
      String(dateObj.getMonth() + 1).padStart(2, '0'),
      String(dateObj.getDate()).padStart(2, '0'),
    ].join('-')
    const r = revenueByDate[ds] || {}
    return {
      dateStr:        ds,
      label:          ds,
      revenue:        Number(r.revenue) || 0,
      refunded:       Number(r.refunded) || 0,
      bookings:       Number(r.bookings) || 0,
      valid_bookings: Number(r.valid_bookings) || 0,
      isToday:        ds === today,
      isWknd:         dateObj.getDay() === 0 || dateObj.getDay() === 6,
    }
  })

  const totalDailyAllVe   = chartData.reduce((s, r) => s + r.bookings, 0)
  const totalDailyValid   = chartData.reduce((s, r) => s + r.valid_bookings, 0)
  const totalDailyRevenue = chartData.reduce((s, r) => s + r.revenue, 0)

  // ── JSX ──────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LuLayoutDashboard size={20}/> Tổng quan
          </div>
          <div className="page-subtitle">Tổng quan hệ thống Vivudee</div>
        </div>
        <div className="header-right" style={{ gap: 10 }}>
          <input type="date" className="filter-select" value={dateRange.from_date}
            onChange={e => setDateRange(p => ({ ...p, from_date: e.target.value }))} style={{ fontSize: 13 }} />
          <LuArrowRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
          <input type="date" className="filter-select" value={dateRange.to_date}
            onChange={e => setDateRange(p => ({ ...p, to_date: e.target.value }))} style={{ fontSize: 13 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Tự động cập nhật 10s
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => { dateRangeRef.current = dateRange; load() }}>Lọc</button>
          <button className="btn btn-secondary btn-sm" onClick={() => {
            const empty = { from_date: '', to_date: '' }
            setDateRange(empty); dateRangeRef.current = empty; load()
          }}>Xóa lọc</button>
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
            {/* ── Stats error banner ── */}
            {statsError && (
              <div style={{
                background: 'var(--danger-bg)', border: '1px solid var(--danger)',
                borderRadius: 10, padding: '10px 16px', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <LuTriangleAlert size={16} color="var(--danger)" style={{ flexShrink: 0 }}/>
                <span style={{ fontSize: 13, color: 'var(--danger)' }}>
                  Lỗi tải thống kê: <b>{statsError}</b> — Kiểm tra Render logs để biết chi tiết.
                </span>
              </div>
            )}

            {/* ── Alert banner ── */}
            {pendingRefunds > 0 && (
              <div style={{
                background: 'var(--danger-bg)', border: '1px solid var(--danger)',
                borderRadius: 10, padding: '10px 16px', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <LuTriangleAlert size={16} color="var(--danger)" style={{ flexShrink: 0 }}/>
                <span style={{ fontSize: 13 }}>
                  <b style={{ color: 'var(--danger)' }}>{pendingRefunds} yêu cầu hoàn tiền</b> đang chờ xử lý —{' '}
                  <Link to="/refunds" style={{ color: 'var(--danger)', fontWeight: 700, textDecoration: 'underline' }}>Xem ngay</Link>
                </span>
              </div>
            )}

            {/* ── KPI cards ── */}
            <div className="stat-grid">
              <StatCard icon={<LuTicket size={22} color="var(--accent-light)"/>}       value={counts.bookings.toLocaleString('vi-VN')} label="Tổng đặt vé"       color="var(--accent-light)" bg="var(--info-bg)" />
              <StatCard icon={<LuCircleDollarSign size={22} color="var(--success)"/>}  value={fmtCurrency(totalRevenue)}               label="Doanh thu gộp"      color="var(--success)"      bg="var(--success-bg)" />
              <StatCard icon={<LuUndo2 size={22} color="var(--danger)"/>}              value={fmtCurrency(totalRefunded)}              label="Đã hoàn cho khách"  color="var(--danger)"       bg="var(--danger-bg)" />
              <StatCard icon={<LuCircleDollarSign size={22} color="var(--info)"/>}     value={fmtCurrency(netRevenue)}                 label="Doanh thu thực"     color="var(--info)"         bg="var(--info-bg)" />
            </div>

            {/* ── System metrics row ── */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              {[
                { icon: <LuPlane size={14}/>,  label: 'Chuyến bay',      value: counts.flights.toLocaleString('vi-VN') },
                { icon: <LuUsers size={14}/>,  label: 'Người dùng',      value: counts.users.toLocaleString('vi-VN') },
                { icon: <LuTicket size={14}/>, label: 'Tổng hành khách', value: fmt(overview.total_passengers) },
              ].map(({ icon, label, value }) => (
                <div key={label} style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 15 }}>{value}</span>
                </div>
              ))}
            </div>

            {/* ── Row 1: Status bars + 7-day chart ── */}
            <div className="responsive-two-col" style={{ marginBottom: 20 }}>

              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <LuChartBar size={16}/> Trạng thái đặt vé
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                  Tổng {totalAllBookings.toLocaleString('vi-VN')} lượt đặt vé — chia theo trạng thái
                </div>
                {bookingSummary.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon"><LuChartBar size={36}/></div><div className="empty-text">Không có dữ liệu</div></div>
                ) : bookingSummary.map(row => {
                  const pct   = totalAllBookings > 0 ? (Number(row.count) / totalAllBookings) * 100 : 0
                  const color = STATUS_COLOR[row.status] || 'var(--accent)'
                  const label = STATUS_LABEL_VI[row.status] || row.status
                  return (
                    <div key={row.status} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                        <span style={{ fontWeight: 600 }}>
                          {Number(row.count).toLocaleString('vi-VN')}
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({pct.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 99 }}>
                        <div style={{ height: '100%', borderRadius: 99, background: color, width: `${Math.min(pct, 100)}%`, transition: 'width 0.5s ease' }} />
                      </div>
                      {row.revenue && Number(row.revenue) > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                          {row.status === 'refund_pending' || row.status === 'refunded'
                            ? `Giá vé gốc: ${fmtCurrency(row.revenue)}`
                            : `Doanh thu: ${fmtCurrency(row.revenue)}`}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <LuCalendarDays size={16}/> Doanh thu 7 ngày gần nhất
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Nhấn vào cột để xem chi tiết đặt vé trong ngày
                </div>
                {chartData.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon"><LuCalendarDays size={36}/></div><div className="empty-text">Không có dữ liệu</div></div>
                ) : (
                  <>
                    <div tabIndex={-1} style={{ outline: 'none' }}>
                      <ResponsiveContainer width="100%" height={190} style={{ outline: 'none' }}>
                        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 10 }} style={{ outline: 'none' }}
                          onClick={(data) => { if (data?.activeLabel) openDayDetail(data.activeLabel) }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="dateStr" tick={<CustomXTick />} tickLine={false} axisLine={false} height={36} />
                          <YAxis tickFormatter={n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : n}
                            tick={{ fontSize: 10, fill: '#94a3b8' }} width={40} axisLine={false} tickLine={false} />
                          <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(59,130,246,0.07)', stroke: 'none' }} />
                          <Bar dataKey="revenue" radius={[4, 4, 0, 0]} cursor="pointer" maxBarSize={48} minPointSize={3}
                            onClick={(barData) => openDayDetail(barData.dateStr)}>
                            {chartData.map((d, i) => (
                              <Cell key={i} fill={d.isToday ? '#22c55e' : d.isWknd ? '#8b5cf6' : '#3b82f6'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
                      {[
                        ['Tất cả vé', totalDailyAllVe.toLocaleString('vi-VN'), null],
                        ['Hợp lệ',    totalDailyValid.toLocaleString('vi-VN'),   null],
                        ['Doanh thu', fmtCurrency(totalDailyRevenue), '#22c55e'],
                      ].map(([k, v, c], i) => (
                        <div key={k} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k}</div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: c || 'inherit' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Row 2: Popular flights + Operational metrics ── */}
            <div className="responsive-two-col" style={{ marginBottom: 20 }}>
              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <LuTrophy size={16}/> Chuyến bay phổ biến nhất
                </div>
                {popularFlights.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon"><LuPlane size={36}/></div><div className="empty-text">Không có dữ liệu</div></div>
                ) : popularFlights.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8 }}>
                    <span style={{
                      width: 28, height: 28,
                      background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : 'var(--bg-card)',
                      borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: i < 2 ? '#000' : 'var(--text-secondary)', flexShrink: 0,
                    }}>#{i+1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {f.flight_number}
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}> · {f.airline}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{f.from_city} → {f.to_city}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: '#3b82f6', fontSize: 15 }}>{Number(f.total_bookings).toLocaleString('vi-VN')}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>lượt đặt</div>
                      {f.total_passengers > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{Number(f.total_passengers).toLocaleString('vi-VN')} hành khách</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <LuLightbulb size={16}/> Chỉ số vận hành
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                  Hiệu quả kinh doanh trong khoảng thời gian đã chọn
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Số lượng đặt vé</div>
                {[
                  ['Đã xác nhận',    Number(overview.confirmed)    || 0, '#22c55e'],
                  ['Đang chờ xử lý', Number(overview.pending)      || 0, '#f59e0b'],
                  ['Chờ hoàn tiền',  getStatusCount('refund_pending'), '#8b5cf6'],
                  ['Hoàn tiền xong', getStatusCount('refunded'),       '#06b6d4'],
                  ['Đã huỷ',         Number(overview.cancelled)    || 0, '#ef4444'],
                  ['Hết hạn',        Number(overview.expired)      || 0, '#94a3b8'],
                ].map(([k, v, c]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                      {k}
                    </span>
                    <span style={{ fontWeight: 600 }}>{v.toLocaleString('vi-VN')}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px' }}>Hiệu quả</div>
                {[
                  ['Tỷ lệ xác nhận thành công',     successRate != null ? `${successRate}%` : '—'],
                  ['Đã hoàn cho khách / doanh thu gộp', refundRate != null ? `${refundRate}%` : '—'],
                  ['Giá trị TB mỗi đặt vé hợp lệ',  fmtCurrency(avgOrderValue)],
                  ['Hợp lệ (XN + chờ hoàn + đã hoàn)', `${validCount.toLocaleString('vi-VN')} vé`],
                  ['Huỷ + hết hạn',                 `${cancelExpireCount.toLocaleString('vi-VN')} vé`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                    <span style={{ fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Row 3: Today's flights + Recent bookings ── */}
            <div className="responsive-two-col">

              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <LuPlane size={16}/> Chuyến bay khởi hành hôm nay
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                  {todayFlightTotal > 0
                    ? `${todayFlightTotal} chuyến bay · ${new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}`
                    : 'Không có chuyến bay hôm nay'}
                </div>
                {todayFlights.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon"><LuPlane size={36}/></div><div className="empty-text">Không có chuyến bay hôm nay</div></div>
                ) : todayFlights.map((f) => {
                  const depTime = f.departure_time ? new Date(f.departure_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'
                  const arrTime = f.arrival_time   ? new Date(f.arrival_time).toLocaleTimeString('vi-VN',   { hour: '2-digit', minute: '2-digit' }) : '—'
                  const totalAvail = Array.isArray(f.seats) ? f.seats.reduce((s, c) => s + (Number(c.available_seats) || 0), 0) : null
                  return (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 48 }}>
                        <LuClock size={13} style={{ color: 'var(--text-muted)' }}/>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{depTime}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{arrTime}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {f.flight_number}
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}> · {f.airline_name}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.dep_city} ({f.dep_code}) → {f.arr_city} ({f.arr_code})</div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <span className={`badge ${FLIGHT_STATUS_BADGE[f.status] || 'badge-muted'}`} style={{ fontSize: 10 }}>
                          {FLIGHT_STATUS_LABEL[f.status] || f.status}
                        </span>
                        {totalAvail != null && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{totalAvail} ghế trống</div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {todayFlightTotal > 8 && (
                  <div style={{ textAlign: 'center', paddingTop: 10 }}>
                    <Link to="/flights" style={{ fontSize: 12, color: 'var(--accent)' }}>Xem tất cả {todayFlightTotal} chuyến →</Link>
                  </div>
                )}
              </div>

              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <LuTicket size={16}/> Đặt vé gần đây
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                  8 lượt đặt vé mới nhất trong hệ thống
                </div>
                {recentBookings.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon"><LuTicket size={36}/></div><div className="empty-text">Chưa có đặt vé nào</div></div>
                ) : recentBookings.map(b => {
                  const totalPax = (Number(b.total_adults)||0) + (Number(b.total_children)||0) + (Number(b.total_infants)||0)
                  return (
                    <div key={b.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--accent-light)' }}>{b.booking_code}</span>
                          <span className={`badge ${STATUS_BADGE[b.status] || 'badge-muted'}`} style={{ fontSize: 10 }}>
                            {STATUS_LABEL_VI[b.status] || b.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{b.contact_name || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {b.outbound_flight} · {b.from_city} → {b.to_city} · {totalPax} khách
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: (b.status === 'confirmed' || b.status === 'pending') ? '#22c55e' : 'var(--text-muted)' }}>
                          {fmtCurrency(b.final_amount ?? b.grand_total ?? b.total_price)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {b.created_at ? new Date(b.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {counts.bookings > 8 && (
                  <div style={{ textAlign: 'center', paddingTop: 10 }}>
                    <Link to="/bookings" style={{ fontSize: 12, color: 'var(--accent)' }}>Xem tất cả {counts.bookings.toLocaleString('vi-VN')} đặt vé →</Link>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Day detail modal ── */}
      {selectedDay && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedDay(null)}>
          <div className="modal" style={{ maxWidth: 820 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <LuCalendarDays size={16}/>
                Chi tiết đặt vé ngày {new Date(selectedDay + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>
              <button className="modal-close" onClick={() => setSelectedDay(null)}><LuX size={18}/></button>
            </div>
            {dayLoading ? (
              <div className="loading-wrap"><div className="spinner"/></div>
            ) : dayBookings.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><LuTicket size={36}/></div>
                <div className="empty-text">Không có đặt vé nào trong ngày này</div>
              </div>
            ) : (() => {
                const statusCounts = dayBookings.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc }, {})
                const validRevenue = dayBookings.filter(b => ['confirmed','refund_pending','refunded'].includes(b.status)).reduce((s, b) => s + Number(b.final_amount ?? b.grand_total ?? b.total_price ?? 0), 0)
                const dayChart = chartData.find(c => c.dateStr === selectedDay)
                const refundedAmount = dayChart?.refunded ?? 0
                const netRevenue = validRevenue - refundedAmount
                const totalDay = dayBookings.length
                return (
              <>
                {/* Mini status chart */}
                <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', marginBottom: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    {Object.entries(statusCounts).map(([st, cnt]) => {
                      const pct = totalDay > 0 ? (cnt / totalDay) * 100 : 0
                      return (
                        <div key={st} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[st] || 'var(--accent)', flexShrink: 0 }}/>
                              {STATUS_LABEL_VI[st] || st}
                            </span>
                            <span style={{ fontWeight: 600 }}>{cnt} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct.toFixed(0)}%)</span></span>
                          </div>
                          <div style={{ height: 6, background: 'var(--bg-input)', borderRadius: 99 }}>
                            <div style={{ height: '100%', borderRadius: 99, background: STATUS_COLOR[st] || 'var(--accent)', width: `${pct}%`, transition: 'width 0.4s ease' }}/>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center', minWidth: 160 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tổng đặt vé: <b style={{ color: 'var(--text-primary)' }}>{totalDay}</b></div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Doanh thu:</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{fmtCurrency(validRevenue)}</div>
                    {refundedAmount > 0 && <>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hoàn tiền: <span style={{ color: '#ef4444', fontWeight: 600 }}>-{fmtCurrency(refundedAmount)}</span></div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 2 }}>Thực thu:</div>
                      <div style={{ fontWeight: 700, color: '#22c55e', fontSize: 15 }}>{fmtCurrency(netRevenue)}</div>
                    </>}
                    {refundedAmount === 0 && <div style={{ fontWeight: 700, color: '#22c55e', fontSize: 15 }}>{fmtCurrency(validRevenue)}</div>}
                  </div>
                </div>
                <div className="table-wrapper" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Mã đặt vé</th><th>Liên hệ</th><th>Chuyến bay</th>
                        <th>Hành khách</th><th>Trạng thái</th><th>Tổng tiền</th><th>Thời gian đặt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayBookings.map(b => {
                        const totalPax = (Number(b.total_adults)||0) + (Number(b.total_children)||0) + (Number(b.total_infants)||0)
                        return (
                          <tr key={b.id}>
                            <td><span className="td-mono">{b.booking_code}</span></td>
                            <td>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{b.contact_name || '—'}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.contact_email || ''}</div>
                              {b.contact_phone && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.contact_phone}</div>}
                            </td>
                            <td>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{b.outbound_flight || '—'}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{b.from_city} → {b.to_city}</div>
                            </td>
                            <td style={{ textAlign: 'center' }}>{totalPax}</td>
                            <td><span className={`badge ${STATUS_BADGE[b.status] || 'badge-muted'}`}>{STATUS_LABEL_VI[b.status] || b.status}</span></td>
                            <td style={{ fontWeight: 600, color: (b.status === 'confirmed' || b.status === 'pending') ? '#22c55e' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {fmtCurrency(b.final_amount ?? b.grand_total ?? b.total_price)}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {b.created_at ? new Date(b.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
          </div>
        </div>
      )}
    </>
  )
}
