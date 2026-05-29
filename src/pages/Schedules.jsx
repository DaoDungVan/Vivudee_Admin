import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createFlight, updateFlightStatus, toggleFlightVisibility, getAirports, getAirlines, getFlights, getAutoFlightStatus, saveAutoFlightConfig, runAutoFlightBatch } from '../api'
import {
  LuCalendarDays, LuRefreshCw, LuTriangleAlert, LuPlane, LuArrowRight, LuRotateCcw,
  LuArrowLeftRight, LuPause, LuPlay, LuBan, LuX, LuSearch, LuCopy,
  LuChevronDown, LuChevronRight, LuZap, LuUser, LuCircleCheck,
} from 'react-icons/lu'

// ─── Shared constants ─────────────────────────────────────────────────────────

const fmtPrice = (n) => n ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n)) : '—'

const DAYS_OF_WEEK = [
  { value: 1, label: 'T2' }, { value: 2, label: 'T3' }, { value: 3, label: 'T4' },
  { value: 4, label: 'T5' }, { value: 5, label: 'T6' }, { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
]

const SEAT_CLASS_ORDER = ['economy', 'business', 'first']
const SEAT_CLASS_LABELS = { economy: 'Economy', business: 'Business', first: 'First Class' }
const SEAT_DEFAULTS = {
  economy:  { total_seats: '200', baggage_included_kg: '23', carry_on_kg: '7',  extra_baggage_price: '0' },
  business: { total_seats: '40',  baggage_included_kg: '32', carry_on_kg: '12', extra_baggage_price: '0' },
  first:    { total_seats: '20',  baggage_included_kg: '40', carry_on_kg: '15', extra_baggage_price: '0' },
}
const SEAT_MAX = { economy: 200, business: 40, first: 20 }

const VN_AIRPORTS = new Set([
  'SGN','HAN','DAD','HPH','CXR','VCA','PQC','VDH','HUI','BMV',
  'DLI','UIH','TBB','CAH','VKG','VII','VCS','VCL','DIN','THD','PXU',
])
const VN_DOMESTIC_AIRLINES = ['VN','VJ','QH','BL','VU']
const FOREIGN_NO_DOMESTIC = new Set([
  'AA','UA','DL','BA','LH','AF','KL','QF','EK','EY','QR','TK',
  'SQ','CX','JL','NH','KE','OZ','TG','MH','AK','FD','TR','MU','CA','CZ','GA',
])

const BASE_ECO_PER_MIN = 5000

const getTimeMult = (hour) => {
  const h = Number(hour)
  if (isNaN(h) || hour === '' || hour === null) return { mult: 1.0, label: null }
  if (h >= 5  && h <= 7)  return { mult: 1.10, label: 'sáng sớm +10%' }
  if (h >= 8  && h <= 10) return { mult: 1.25, label: 'cao điểm sáng +25%' }
  if (h >= 11 && h <= 14) return { mult: 1.00, label: null }
  if (h >= 15 && h <= 17) return { mult: 1.10, label: 'chiều +10%' }
  if (h >= 18 && h <= 21) return { mult: 1.20, label: 'cao điểm tối +20%' }
  return { mult: 0.85, label: 'đêm/rạng sáng -15%' }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ~4.5% base_price per kg for economy, ~2.5% for business, 0 for first
const autoExtraBagPrice = (basePrice, cls) => {
  const p = Number(basePrice) || 0
  if (!p || cls === 'first') return '0'
  const ratio = cls === 'business' ? 0.025 : 0.045
  return String(Math.max(5000, Math.round(p * ratio / 1000) * 1000))
}

const createSeat = (cls = 'economy') => ({ class: cls, total_seats: '', base_price: '', ...SEAT_DEFAULTS[cls] })
const buildSeatFormList = () => SEAT_CLASS_ORDER.map(cls => createSeat(cls))

const calcPrices = (durationMins, tierMult, departureHour = null) => {
  const mins = Number(durationMins) || 0
  if (!mins || !tierMult) return null
  const { mult: timeMult } = getTimeMult(departureHour)
  const eco = Math.round(mins * BASE_ECO_PER_MIN * tierMult * timeMult / 10000) * 10000
  return { economy: eco, business: Math.round(eco * 2.8 / 10000) * 10000, first: Math.round(eco * 5.5 / 10000) * 10000 }
}

const getRouteWarning = (airlineCode, depCode, arrCode) => {
  if (!airlineCode || !depCode || !arrCode) return null
  const code = String(airlineCode).toUpperCase()
  if (VN_AIRPORTS.has(depCode.toUpperCase()) && VN_AIRPORTS.has(arrCode.toUpperCase())) {
    if (FOREIGN_NO_DOMESTIC.has(code))
      return `Hãng ${airlineCode} không khai thác nội địa Việt Nam — đề xuất: ${VN_DOMESTIC_AIRLINES.join(', ')}`
    if (!VN_DOMESTIC_AIRLINES.includes(code))
      return `Hãng ${airlineCode} thường không khai thác nội địa Việt Nam`
  }
  return null
}

const ACTIVE_FLIGHT_STATUSES = new Set(['scheduled', 'delayed', 'boarding', 'departed', 'arrived'])

// Tất cả 24 khung giờ trong ngày
const ALL_DAY_TIMES = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

// Chọn N khung giờ phân bổ đều trong ngày (0 hoặc >= 24 → trả về tất cả 24)
const getTimeSlotsForDay = (flightsPerDay) => {
  const n = Number(flightsPerDay)
  if (!n || n <= 0 || n >= 24) return ALL_DAY_TIMES
  const slots = new Set()
  for (let i = 0; i < n; i++) slots.add(Math.floor(i * 24 / n))
  return [...slots].sort((a, b) => a - b).map(h => `${String(h).padStart(2, '0')}:00`)
}

// Tạo pool số hiệu khả dụng cho một hãng — dùng trong tạo lịch hàng loạt
const genFlightNumPool = (airlineCode, existingFlights, needed) => {
  if (!airlineCode) return []
  const code = String(airlineCode).toUpperCase()
  const used = new Set(
    existingFlights
      .filter(f => ACTIVE_FLIGHT_STATUSES.has(f.status) && String(f.flight_number || '').startsWith(code))
      .map(f => parseInt(String(f.flight_number || '').slice(code.length), 10))
      .filter(n => !isNaN(n) && n >= 100 && n <= 999)
  )
  const pool = []
  for (let i = 100; i <= 999 && pool.length < needed; i++) {
    if (!used.has(i)) pool.push(`${code}${i}`)
  }
  return pool
}

const addMinsToISO = (isoStr, mins) => {
  if (!isoStr || !mins) return ''
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  d.setMinutes(d.getMinutes() + Number(mins))
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const getDatesInRange = (startDate, endDate, daysOfWeek) => {
  if (!startDate || !endDate || !daysOfWeek.length) return []
  const dates = []
  const end = new Date(endDate + 'T00:00:00')
  const cur = new Date(startDate + 'T00:00:00')
  const daySet = new Set(daysOfWeek)
  while (cur <= end && dates.length < 500) {
    if (daySet.has(cur.getDay())) {
      const p = n => String(n).padStart(2, '0')
      dates.push(`${cur.getFullYear()}-${p(cur.getMonth()+1)}-${p(cur.getDate())}`)
    }
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

const emptyForm = () => ({
  airline_id: '', departure_airport_id: '', arrival_airport_id: '',
  dur_h: '', dur_m: '',
  start_date: '', end_date: '', days_of_week: [1, 2, 3, 4, 5],
  flights_per_day: '',
  seats: buildSeatFormList(),
})

// ─── Distance / duration helpers ──────────────────────────────────────────────

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

const estimateFlightMins = (km) => {
  if (km <= 500)  return Math.round(km / 500 * 60) + 40
  if (km <= 1500) return Math.round(km / 700 * 60) + 25
  if (km <= 4000) return Math.round(km / 820 * 60) + 30
  if (km <= 8000) return Math.round(km / 860 * 60) + 40
  return Math.round(km / 900 * 60) + 60
}

// ─── Schedule list helpers ────────────────────────────────────────────────────

const groupBySchedule = (flights) => {
  const map = new Map()
  for (const f of flights) {
    const depCode = f.dep_code || f.departure_code || '?'
    const arrCode = f.arr_code || f.arrival_code || '?'
    const airCode = f.airline_code || '?'
    const key = `${airCode}-${depCode}-${arrCode}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        airline_name: f.airline_name || airCode,
        airline_id: f.airline_id,
        airline_code: airCode,
        dep_code: depCode,
        arr_code: arrCode,
        dep_id: f.dep_id || f.departure_airport_id || '',
        arr_id: f.arr_id || f.arrival_airport_id || '',
        duration_minutes: f.duration_minutes,
        flights: [],
      })
    }
    map.get(key).flights.push(f)
  }
  return [...map.values()].sort((a, b) =>
    a.airline_code.localeCompare(b.airline_code) || a.dep_code.localeCompare(b.dep_code)
  )
}

const getGroupState = (group) => {
  const nonTerminal = group.flights.filter(f => f.status !== 'cancelled' && f.status !== 'completed')
  if (nonTerminal.length === 0) return 'cancelled'
  return nonTerminal.every(f => f.is_active === false) ? 'paused' : 'active'
}

const getGroupDateRange = (group) => {
  const times = group.flights
    .map(f => f.departure_time)
    .filter(Boolean)
    .map(t => String(t).replace(' ', 'T'))
    .sort()
  if (!times.length) return null
  const fmt = (t) => { const m = t.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : t }
  return { from: fmt(times[0]), to: fmt(times[times.length - 1]) }
}

const getGroupStats = (group) => ({
  total:       group.flights.length,
  scheduled:   group.flights.filter(f => f.status === 'scheduled').length,
  cancellable: group.flights.filter(f => f.status === 'scheduled' || f.status === 'delayed').length,
  paused:      group.flights.filter(f => f.status !== 'cancelled' && f.status !== 'completed' && f.is_active === false).length,
  cancelled:   group.flights.filter(f => f.status === 'cancelled').length,
})

// ─── SearchSelect ─────────────────────────────────────────────────────────────

function SearchSelect({ value, onChange, options, placeholder = '-- Chọn --' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const selected = options.find(o => String(o.value) === String(value))
  const q = query.toLowerCase()
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="form-control"
        autoComplete="off"
        value={open ? query : (selected?.label || '')}
        placeholder={open ? 'Tìm kiếm...' : placeholder}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 300,
          background: 'var(--bg-card, #fff)', border: '1px solid var(--border)',
          borderRadius: 6, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
        }}>
          {filtered.length === 0
            ? <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>Không tìm thấy</div>
            : filtered.map(o => (
              <div
                key={o.value}
                onMouseDown={e => { e.preventDefault(); onChange(o.value); setOpen(false) }}
                style={{
                  padding: '9px 14px', cursor: 'pointer', fontSize: 13,
                  background: String(o.value) === String(value) ? 'rgba(14,129,205,0.08)' : '',
                  color: String(o.value) === String(value) ? 'var(--accent)' : 'var(--text-primary)',
                }}
              >
                {o.label}
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const navigate = useNavigate()
  const [airports, setAirports] = useState([])
  const [airlines, setAirlines] = useState([])
  const [flights, setFlights]   = useState([])
  const [form, setForm]         = useState(emptyForm)
  const [seatsOpen, setSeatsOpen] = useState(false)
  const [error, setError]   = useState('')
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult]     = useState(null)
  // ── Schedule list state ──────────────────────────────────────────────────────
  const [groupSearch, setGroupSearch]       = useState('')
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [confirmAction, setConfirmAction]   = useState(null) // { type, group }
  const [actionLoading, setActionLoading]   = useState(false)
  const [durCalcInfo, setDurCalcInfo]       = useState(null) // { km, mins } | { error }
  // ── Auto multi-airline mode ───────────────────────────────────────────────────
  const [scheduleMode, setScheduleMode]     = useState('single') // 'single' | 'auto'
  const [autoStatus,   setAutoStatus]       = useState(null)
  const [autoSaving,   setAutoSaving]       = useState(false)
  const [autoRunning,  setAutoRunning]      = useState(false)
  const [autoMsg,      setAutoMsg]          = useState('')
  const [autoForm, setAutoForm]             = useState({ start_date:'', end_date:'', flights_per_route:'3', advance_days:'30', is_enabled: false })

  const loadFlights = () =>
    getFlights({ limit: 500 }).then(r => setFlights(r.data.data || [])).catch(() => {})

  const loadAutoStatus = () =>
    getAutoFlightStatus()
      .then(r => {
        const d = r.data
        setAutoStatus(d)
        if (d.config) setAutoForm(p => ({
          ...p,
          start_date:       d.config.start_date?.slice(0,10) || '',
          end_date:         d.config.end_date?.slice(0,10)   || '',
          flights_per_route: String(d.config.flights_per_route || 3),
          advance_days:      String(d.config.advance_days     || 30),
          is_enabled:        !!d.config.is_enabled,
        }))
      })
      .catch(() => {})

  useEffect(() => {
    getAirports({ limit: 200 }).then(r => setAirports(r.data.data || [])).catch(() => {})
    getAirlines({ limit: 100 }).then(r => setAirlines(r.data.data || [])).catch(() => {})
    loadFlights()
    loadAutoStatus()
  }, [])

  // ── Form helpers ─────────────────────────────────────────────────────────────

  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setSeatField = (idx, key, value) =>
    setForm(p => ({ ...p, seats: p.seats.map((s, i) => {
      if (i !== idx) return s
      const updated = { ...s, [key]: value }
      if (key === 'base_price') updated.extra_baggage_price = autoExtraBagPrice(value, s.class)
      return updated
    })}))

  const toggleDay = (day) =>
    setForm(p => ({
      ...p,
      days_of_week: p.days_of_week.includes(day)
        ? p.days_of_week.filter(d => d !== day)
        : [...p.days_of_week, day],
    }))

  const handleAirlineChange = (airlineId) => sf('airline_id', airlineId)

  const swapAirports = () =>
    setForm(p => ({ ...p, departure_airport_id: p.arrival_airport_id, arrival_airport_id: p.departure_airport_id }))

  const handleAutoCalcDuration = () => {
    const dep = airports.find(a => String(a.id) === String(form.departure_airport_id))
    const arr = airports.find(a => String(a.id) === String(form.arrival_airport_id))
    if (!dep || !arr) return setDurCalcInfo({ error: 'Chọn sân bay đi và đến trước' })
    if (dep.lat == null || dep.lng == null) return setDurCalcInfo({ error: `Sân bay ${dep.code} chưa có tọa độ trong DB` })
    if (arr.lat == null || arr.lng == null) return setDurCalcInfo({ error: `Sân bay ${arr.code} chưa có tọa độ trong DB` })
    const km = haversineKm(Number(dep.lat), Number(dep.lng), Number(arr.lat), Number(arr.lng))
    const mins = estimateFlightMins(km)
    setForm(p => ({ ...p, dur_h: String(Math.floor(mins / 60)), dur_m: String(mins % 60) }))
    setDurCalcInfo({ km: Math.round(km), mins })
  }

  const handleDurMChange = (val) => {
    const m = Number(val)
    if (!isNaN(m) && m >= 60) {
      setForm(p => ({ ...p, dur_h: String(Number(p.dur_h || 0) + Math.floor(m / 60)), dur_m: String(m % 60) }))
    } else {
      sf('dur_m', val)
    }
  }

  // Không tự động điền giá — người dùng bấm "Áp dụng" để áp giá gợi ý

  // ── Schedule list actions ────────────────────────────────────────────────────

  const handleCancelGroup = async (group) => {
    setActionLoading(true)
    const toCancel = group.flights.filter(f => f.status === 'scheduled' || f.status === 'delayed')
    for (const f of toCancel) {
      try { await updateFlightStatus(f.id, 'cancelled') } catch {}
    }
    setActionLoading(false)
    setConfirmAction(null)
    loadFlights()
  }

  const handlePauseGroup = async (group) => {
    setActionLoading(true)
    const toPause = group.flights.filter(f =>
      f.status !== 'cancelled' && f.status !== 'completed' && f.is_active !== false
    )
    for (const f of toPause) {
      try { await toggleFlightVisibility(f.id) } catch {}
    }
    setActionLoading(false)
    setConfirmAction(null)
    loadFlights()
  }

  const handleResumeGroup = async (group) => {
    setActionLoading(true)
    const toResume = group.flights.filter(f =>
      f.status !== 'cancelled' && f.status !== 'completed' && f.is_active === false
    )
    for (const f of toResume) {
      try { await toggleFlightVisibility(f.id) } catch {}
    }
    setActionLoading(false)
    setConfirmAction(null)
    loadFlights()
  }

  const toggleExpanded = (key) => setExpandedGroups(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const prefillFromGroup = (group) => {
    const depAirport = airports.find(a => a.id === group.dep_id || (a.code || '').toUpperCase() === group.dep_code.toUpperCase())
    const arrAirport = airports.find(a => a.id === group.arr_id || (a.code || '').toUpperCase() === group.arr_code.toUpperCase())
    const airline    = airlines.find(a => a.id === group.airline_id || (a.code || '').toUpperCase() === group.airline_code.toUpperCase())
    const durH = group.duration_minutes ? Math.floor(group.duration_minutes / 60) : 0
    const durM = group.duration_minutes ? group.duration_minutes % 60 : 0
    setForm({
      ...emptyForm(),
      airline_id:           airline?.id || '',
      departure_airport_id: depAirport?.id || '',
      arrival_airport_id:   arrAirport?.id || '',
      dur_h: durH ? String(durH) : '',
      dur_m: durM ? String(durM) : '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Auto mode handlers ───────────────────────────────────────────────────────

  const handleSaveAuto = async (newEnabled) => {
    setAutoSaving(true)
    setAutoMsg('')
    try {
      const payload = {
        is_enabled:        newEnabled !== undefined ? newEnabled : autoForm.is_enabled,
        start_date:        autoForm.start_date  || null,
        end_date:          autoForm.end_date    || null,
        flights_per_route: Number(autoForm.flights_per_route) || 3,
        advance_days:      Number(autoForm.advance_days)      || 30,
      }
      await saveAutoFlightConfig(payload)
      setAutoForm(p => ({ ...p, is_enabled: payload.is_enabled }))
      await loadAutoStatus()
      setAutoMsg(payload.is_enabled ? 'Đã bật — cron chạy mỗi 30 phút' : 'Đã tắt')
    } catch (e) {
      setAutoMsg('Lỗi: ' + (e.response?.data?.error || e.message))
    } finally {
      setAutoSaving(false)
    }
  }

  const handleRunNow = async () => {
    setAutoRunning(true)
    setAutoMsg('')
    try {
      const r = await runAutoFlightBatch(50)
      setAutoMsg(`Chạy xong: tạo ${r.data.created} chuyến, bỏ qua ${r.data.skipped}`)
      loadFlights()
      loadAutoStatus()
    } catch (e) {
      setAutoMsg('Lỗi: ' + (e.response?.data?.error || e.message))
    } finally {
      setAutoRunning(false)
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const selectedAirline     = airlines.find(a => String(a.id) === String(form.airline_id))
  const selectedAirlineCode = selectedAirline?.code || ''
  const depCode = airports.find(a => String(a.id) === String(form.departure_airport_id))?.code || ''
  const arrCode = airports.find(a => String(a.id) === String(form.arrival_airport_id))?.code || ''
  const routeWarning    = getRouteWarning(selectedAirlineCode, depCode, arrCode)
  const durMins         = Number(form.dur_h || 0) * 60 + Number(form.dur_m || 0)
  const airlineTier     = Number(selectedAirline?.price_tier) || 1.0
  const priceSuggestion = calcPrices(durMins, airlineTier, null)
  const previewDates    = getDatesInRange(form.start_date, form.end_date, form.days_of_week)
  const effectiveDates  = previewDates
  const timeSlotsPerDay = getTimeSlotsForDay(form.flights_per_day)

  const totalToCreate   = effectiveDates.length * timeSlotsPerDay.length
  const numPoolPreview  = selectedAirlineCode ? genFlightNumPool(selectedAirlineCode, flights, totalToCreate) : []
  const poolShortfall   = totalToCreate > 0 && numPoolPreview.length < totalToCreate

  const scheduleGroups  = groupBySchedule(flights)
  const filteredGroups  = groupSearch.trim()
    ? scheduleGroups.filter(g => {
        const q = groupSearch.toLowerCase()
        return g.dep_code.toLowerCase().includes(q) ||
               g.arr_code.toLowerCase().includes(q) ||
               g.airline_code.toLowerCase().includes(q) ||
               g.airline_name.toLowerCase().includes(q)
      })
    : scheduleGroups

  const handleApplyPrices = () => {
    if (!priceSuggestion) return
    setForm(p => ({ ...p, seats: p.seats.map(s => ({
      ...s,
      base_price: String(priceSuggestion[s.class] ?? s.base_price),
      extra_baggage_price: autoExtraBagPrice(priceSuggestion[s.class] ?? s.base_price, s.class),
    }))}))

  }

  // ── Create handler ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.airline_id)     return setError('Chọn hãng bay')
    if (!form.departure_airport_id || !form.arrival_airport_id) return setError('Chọn đủ sân bay đi và đến')
    if (!durMins)             return setError('Nhập thời gian bay')
    if (!form.start_date || !form.end_date) return setError('Chọn ngày bắt đầu và kết thúc')
    if (new Date(form.end_date) < new Date(form.start_date)) return setError('Ngày kết thúc phải sau ngày bắt đầu')
    if (!form.days_of_week.length) return setError('Chọn ít nhất 1 ngày trong tuần')
    if (!effectiveDates.length) return setError('Không có ngày nào trong khoảng đã chọn')
    for (const seat of form.seats) {
      const n = Number(seat.total_seats)
      const max = SEAT_MAX[seat.class]
      if (max && n > max) {
        setError(`${SEAT_CLASS_LABELS[seat.class]} tối đa ${max} ghế (hiện tại: ${n})`)
        return
      }
    }

    const totalFlights = effectiveDates.length * timeSlotsPerDay.length
    const numPool = genFlightNumPool(selectedAirlineCode, flights, totalFlights)
    if (numPool.length < totalFlights) {
      return setError(`Không đủ số hiệu bay khả dụng cho ${selectedAirlineCode} (cần ${totalFlights}, còn lại ${numPool.length} số chưa dùng). Hãy chờ các chuyến hiện tại kết thúc hoặc giảm khoảng ngày.`)
    }

    setError('')
    setCreating(true)
    setProgress({ done: 0, total: totalFlights, failed: 0 })

    // seatPayload cơ sở — base_price sẽ được nhân hệ số giờ bên trong vòng lặp
    const baseSeatPayload = form.seats.map(s => ({
      class: s.class, total_seats: s.total_seats,
      rawPrice: s.base_price ? Number(s.base_price) : null,
      baggage_included_kg: s.baggage_included_kg, carry_on_kg: s.carry_on_kg,
      extra_baggage_price: Number(s.extra_baggage_price) || 0,
    }))

    let done = 0, failed = 0, numIdx = 0
    for (const dateStr of effectiveDates) {
      for (const timeStr of timeSlotsPerDay) {
        const depTime = `${dateStr}T${timeStr}`
        const depHour = parseInt(timeStr.slice(0, 2))
        const { mult: timeMult } = getTimeMult(depHour)

        // Áp hệ số giờ vào giá từng hạng ghế
        const seatPayload = baseSeatPayload.map(({ rawPrice, ...s }) => ({
          ...s,
          base_price: rawPrice ? Math.round(rawPrice * timeMult / 1000) * 1000 : null,
        }))

        const flightNum = numPool[numIdx++]
        try {
          await createFlight({
            flight_number: flightNum,
            airline_id: form.airline_id,
            departure_airport_id: form.departure_airport_id,
            arrival_airport_id: form.arrival_airport_id,
            departure_time: depTime,
            arrival_time: addMinsToISO(depTime, durMins),
            duration_minutes: durMins,
            seats: seatPayload,
          })
          done++
        } catch { failed++ }
        setProgress({ done: done + failed, total: totalFlights, failed })
      }
    }

    setCreating(false)
    setResult({ done, failed, total: totalFlights, start: form.start_date, end: form.end_date, firstNum: numPool[0], lastNum: numPool[numIdx - 1] })
  }

  // ── Progress screen ──────────────────────────────────────────────────────────
  if (creating) {
    const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <>
        <div className="page-header">
          <div>
            <div className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}><LuCalendarDays size={18}/> Lịch bay định kỳ</div>
            <div className="page-subtitle">Đang tạo chuyến bay...</div>
          </div>
        </div>
        <div className="page-content">
          <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>
              {progress?.done ?? 0}
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '6px 0 24px' }}>
              / {progress?.total ?? 0} chuyến bay đã xử lý
            </div>
            <div style={{ background: 'var(--border)', borderRadius: 8, height: 12, overflow: 'hidden', margin: '0 0 12px' }}>
              <div style={{
                background: 'var(--accent)', height: 12, borderRadius: 8,
                width: `${pct}%`, transition: 'width 0.15s ease',
              }} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{pct}%</div>
            {(progress?.failed ?? 0) > 0 && (
              <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 12 }}>
                {progress.failed} chuyến bị lỗi
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  // ── Result screen ────────────────────────────────────────────────────────────
  if (result) {
    return (
      <>
        <div className="page-header">
          <div>
            <div className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}><LuCalendarDays size={18}/> Lịch bay định kỳ</div>
          </div>
        </div>
        <div className="page-content">
          <div style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              {result.failed === 0
                ? <LuCircleCheck size={64} style={{ color:'var(--success)' }}/>
                : <span style={{ fontSize:52 }}>⚠️</span>}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              {result.failed === 0 ? 'Tạo lịch bay thành công!' : 'Hoàn tất với một số lỗi'}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
              <strong>{result.done}</strong> chuyến bay đã được tạo
              {result.firstNum && <> — số hiệu từ <strong>{result.firstNum}</strong> đến <strong>{result.lastNum}</strong></>}
              <br/>từ <strong>{result.start}</strong> đến <strong>{result.end}</strong>
              {result.failed > 0 && (
                <><br/><span style={{ color: 'var(--danger)' }}>{result.failed} chuyến bị lỗi (có thể số hiệu trùng hoặc dữ liệu không hợp lệ)</span></>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button className="btn btn-secondary" style={{ display:'flex', alignItems:'center', gap:5 }} onClick={() => { setResult(null); setForm(emptyForm()); loadFlights() }}>
                <LuRotateCcw size={14}/> Tạo lịch mới
              </button>
              <button className="btn btn-primary" style={{ display:'flex', alignItems:'center', gap:5 }} onClick={() => navigate('/flights')}>
                Xem chuyến bay <LuArrowRight size={14}/>
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── Form screen ──────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}><LuCalendarDays size={18}/> Lịch bay định kỳ</div>
          <div className="page-subtitle">Tạo hàng loạt chuyến bay trong một khoảng thời gian xác định</div>
        </div>
      </div>

      <div className="page-content">
        {error && (
          <div className="alert alert-error" style={{ display:'flex', alignItems:'center', gap:6, marginBottom:16 }}>
            <LuTriangleAlert size={15}/> {error}
          </div>
        )}

        <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

          {/* ════════ LEFT: Creation form ════════ */}
          <div style={{ flex:'1 1 auto', minWidth:0 }}>

            {/* ── Mode toggle ── */}
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <button
                type="button"
                onClick={() => setScheduleMode('single')}
                style={{
                  display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:8,
                  fontWeight:600, fontSize:13, cursor:'pointer', border:'2px solid',
                  borderColor: scheduleMode === 'single' ? 'var(--accent)' : 'var(--border)',
                  background:  scheduleMode === 'single' ? 'rgba(14,129,205,0.08)' : 'var(--bg-card)',
                  color:       scheduleMode === 'single' ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <LuUser size={14}/> Tạo 1 hãng
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode('auto')}
                style={{
                  display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:8,
                  fontWeight:600, fontSize:13, cursor:'pointer', border:'2px solid',
                  borderColor: scheduleMode === 'auto' ? 'var(--success)' : 'var(--border)',
                  background:  scheduleMode === 'auto' ? 'rgba(5,150,105,0.08)' : 'var(--bg-card)',
                  color:       scheduleMode === 'auto' ? 'var(--success)' : 'var(--text-secondary)',
                }}
              >
                <LuZap size={14}/> Tự động đa hãng
                {autoForm.is_enabled && <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--success)', display:'inline-block', marginLeft:2 }}/>}
              </button>
            </div>

            {/* ── AUTO mode panel ── */}
            {scheduleMode === 'auto' && (
              <div className="card" style={{ padding:'20px', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <LuZap size={16} style={{ color:'var(--success)' }}/>
                  <span style={{ fontWeight:700, fontSize:15 }}>Tự động tạo chuyến — Đa hãng</span>
                  <span style={{
                    marginLeft:'auto', fontSize:11, padding:'2px 8px', borderRadius:12,
                    background: autoForm.is_enabled ? 'var(--success-bg)' : 'var(--bg-input)',
                    color:      autoForm.is_enabled ? 'var(--success)'    : 'var(--text-muted)',
                    fontWeight: 600,
                  }}>
                    {autoForm.is_enabled ? 'Đang bật' : 'Đang tắt'}
                  </span>
                </div>
                <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16, lineHeight:1.6 }}>
                  Hệ thống tự động đọc tất cả hãng bay và tuyến đường từ dữ liệu thực tế,
                  tính thời gian bay bằng tọa độ, áp giá theo tier hãng và khung giờ.
                  Cron chạy mỗi <strong>30 phút</strong>, tạo tối đa 20 chuyến/lần — trải đều trong ngày.
                </p>

                {/* Status chips */}
                {autoStatus && (
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
                    <span style={{ fontSize:11, padding:'3px 10px', borderRadius:6, background:'var(--bg-input)', color:'var(--text-muted)' }}>
                      {autoStatus.total_routes} tuyến đã phát hiện
                    </span>
                    <span style={{ fontSize:11, padding:'3px 10px', borderRadius:6, background:'var(--bg-input)', color:'var(--text-muted)' }}>
                      Đã tạo tổng: {autoStatus.config?.total_created || 0} chuyến
                    </span>
                    {autoStatus.config?.last_run_at && (
                      <span style={{ fontSize:11, padding:'3px 10px', borderRadius:6, background:'var(--bg-input)', color:'var(--text-muted)' }}>
                        Lần cuối: {new Date(autoStatus.config.last_run_at).toLocaleString('vi-VN')}
                      </span>
                    )}
                  </div>
                )}

                {/* Form fields */}
                <div className="form-grid" style={{ marginBottom:16 }}>
                  <div className="form-group">
                    <label className="form-label">Từ ngày</label>
                    <input className="form-control" type="date"
                      value={autoForm.start_date}
                      onChange={e => setAutoForm(p => ({ ...p, start_date: e.target.value }))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Đến ngày</label>
                    <input className="form-control" type="date"
                      value={autoForm.end_date}
                      onChange={e => setAutoForm(p => ({ ...p, end_date: e.target.value }))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Số chuyến/tuyến/ngày</label>
                    <input className="form-control" type="number" min="1" max="12"
                      value={autoForm.flights_per_route}
                      onChange={e => setAutoForm(p => ({ ...p, flights_per_route: e.target.value }))}/>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>
                      Ví dụ: 5 → SGN→DAD 5 chuyến/ngày, SGN→HAN 5 chuyến/ngày riêng biệt
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Giới hạn tạo trước (ngày)</label>
                    <input className="form-control" type="number" min="1" max="90"
                      value={autoForm.advance_days}
                      onChange={e => setAutoForm(p => ({ ...p, advance_days: e.target.value }))}/>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>
                      Chỉ tạo chuyến bay trong vòng <strong>N ngày tính từ hôm nay</strong>, bất kể "Đến ngày" chọn đến bao xa.
                      <br/>Ví dụ: đặt 30 → dù "Đến ngày" là 31/12, hệ thống chỉ tạo đến {new Date(Date.now() + 30*864e5).toLocaleDateString('vi-VN')}.
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={autoSaving}
                    onClick={() => handleSaveAuto()}
                    style={{ fontSize:13 }}
                  >
                    {autoSaving ? 'Đang lưu...' : 'Lưu cấu hình'}
                  </button>
                  {autoForm.is_enabled ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={autoSaving}
                      onClick={() => handleSaveAuto(false)}
                      style={{ fontSize:13, background:'rgba(220,53,69,0.08)', color:'var(--danger)', border:'1px solid var(--danger)' }}
                    >
                      Tắt cron
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={autoSaving}
                      onClick={() => handleSaveAuto(true)}
                      style={{ fontSize:13, background:'var(--success-bg)', color:'var(--success)', border:'1px solid var(--success)' }}
                    >
                      Bật cron
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={autoRunning}
                    onClick={handleRunNow}
                    style={{ fontSize:13, display:'flex', alignItems:'center', gap:5, background:'rgba(14,129,205,0.08)', color:'var(--accent)', border:'1px solid var(--accent)' }}
                  >
                    <LuZap size={12}/> {autoRunning ? 'Đang chạy...' : 'Chạy ngay (50 chuyến)'}
                  </button>
                </div>

                {autoMsg && (
                  <div style={{ marginTop:10, fontSize:12, padding:'6px 10px', borderRadius:6,
                    background: autoMsg.startsWith('Lỗi') ? 'rgba(220,53,69,0.08)' : 'var(--success-bg)',
                    color:      autoMsg.startsWith('Lỗi') ? 'var(--danger)'        : 'var(--success)',
                  }}>
                    {autoMsg}
                  </div>
                )}
              </div>
            )}

            {/* ── Section 1: Thông tin cơ bản (ẩn khi mode auto) ── */}
            {scheduleMode === 'single' && <>

            {/* ── Section 1: Thông tin cơ bản ── */}
            <div className="card" style={{ marginBottom: 16, padding: '20px 20px 12px' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--text-primary)' }}>
                Thông tin chuyến bay
              </div>

              {/* ★ Chú thích nổi bật: 24 chuyến/ngày */}
              <div style={{
                display:'flex', gap:8, alignItems:'flex-start', padding:'10px 14px', marginBottom:14,
                background:'rgba(14,129,205,0.08)', border:'1px solid var(--accent)',
                borderRadius:8, fontSize:13,
              }}>
                <span style={{ color:'var(--accent)', fontWeight:700, fontSize:16, lineHeight:1, flexShrink:0 }}>ℹ</span>
                <div style={{ color:'var(--accent)', lineHeight:1.6 }}>
                  Hệ thống sẽ <strong>tự động tạo 24 chuyến/ngày</strong> (00:00, 01:00, ... 23:00) cho mỗi ngày phù hợp trong khoảng đã chọn. Giá vé sẽ dao động theo khung giờ (cao điểm, thấp điểm).
                </div>
              </div>

              {routeWarning && (
                <div style={{ display:'flex', gap:8, padding:'10px 12px', marginBottom:12, background:'var(--warning-bg)', border:'1px solid var(--warning)', borderRadius:6, fontSize:13 }}>
                  <LuTriangleAlert size={15} style={{ color:'var(--warning)', flexShrink:0, marginTop:1 }}/>
                  <span style={{ color:'var(--warning)' }}>{routeWarning}</span>
                </div>
              )}

              {/* ★ Số hiệu bay tự động theo từng chuyến */}
              <div style={{
                display:'flex', gap:8, alignItems:'flex-start', padding:'9px 13px', marginBottom:4,
                background:'rgba(14,129,205,0.06)', border:'1px solid rgba(14,129,205,0.3)',
                borderRadius:7, fontSize:12,
              }}>
                <span style={{ color:'var(--accent)', fontWeight:700, fontSize:15, lineHeight:1, flexShrink:0 }}>✦</span>
                <span style={{ color:'var(--accent)', lineHeight:1.6 }}>
                  <strong>Số hiệu bay được gán tự động và duy nhất cho từng chuyến</strong> (VD: VJ100, VJ101, ...).
                  Số hiệu chỉ được tái sử dụng sau khi chuyến bay tương ứng kết thúc hoặc bị hủy.
                </span>
              </div>

              <div className="form-grid">
                {/* Airline */}
                <div className="form-group">
                  <label className="form-label">Hãng bay *</label>
                  <SearchSelect
                    value={form.airline_id}
                    onChange={handleAirlineChange}
                    options={airlines.map(a => ({ value: a.id, label: `${a.name} (${a.code})` }))}
                    placeholder="-- Chọn hãng --"
                  />
                  <div style={{ fontSize:11, marginTop:4, color:'var(--text-muted)' }}>
                    Hệ số giá được xác định theo hãng bay. Bắt buộc để tự sinh số hiệu.
                  </div>
                </div>

                {/* Airports + swap */}
                <div className="form-group full">
                  <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                    <div style={{ flex:1 }}>
                      <label className="form-label">Sân bay đi *</label>
                      <SearchSelect
                        value={form.departure_airport_id}
                        onChange={v => sf('departure_airport_id', v)}
                        options={airports.map(a => ({ value: a.id, label: `${a.name} (${a.code})` }))}
                      />
                    </div>
                    <button
                      type="button" title="Đảo chiều" onClick={swapAirports}
                      style={{
                        height:38, width:38, borderRadius:6, border:'1px solid var(--border)',
                        background:'var(--bg-input)', cursor:'pointer', flexShrink:0,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        color:'var(--text-secondary)',
                      }}
                    >
                      <LuArrowLeftRight size={16}/>
                    </button>
                    <div style={{ flex:1 }}>
                      <label className="form-label">Sân bay đến *</label>
                      <SearchSelect
                        value={form.arrival_airport_id}
                        onChange={v => sf('arrival_airport_id', v)}
                        options={airports.map(a => ({ value: a.id, label: `${a.name} (${a.code})` }))}
                      />
                    </div>
                  </div>
                  {/* ★ Ghi chú nổi bật tuyến đường */}
                  {depCode && arrCode && (
                    <div style={{ fontSize:11, marginTop:6, color: routeWarning ? 'var(--warning)' : 'var(--text-muted)' }}>
                      {routeWarning
                        ? '⚠ Kiểm tra lại tuyến đường — có thể hãng không khai thác nội địa Việt Nam.'
                        : `Tuyến ${depCode} → ${arrCode} đã xác nhận. Sân bay đi ≠ sân bay đến.`
                      }
                    </div>
                  )}
                </div>

                {/* Duration */}
                <div className="form-group full">
                  <label className="form-label">Thời gian bay *</label>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <input className="form-control" type="number" min="0" max="24" value={form.dur_h} onChange={e => { sf('dur_h', e.target.value); setDurCalcInfo(null) }} style={{ width:80 }} placeholder="1"/>
                    <span style={{ fontSize:13, color:'var(--text-secondary)' }}>giờ</span>
                    <input className="form-control" type="number" min="0" value={form.dur_m} onChange={e => { handleDurMChange(e.target.value); setDurCalcInfo(null) }} style={{ width:80 }} placeholder="30"/>
                    <span style={{ fontSize:13, color:'var(--text-secondary)' }}>phút</span>
                    {durMins > 0 && <span style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>= {durMins} phút</span>}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ display:'flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }}
                      disabled={!form.departure_airport_id || !form.arrival_airport_id}
                      onClick={handleAutoCalcDuration}
                      title="Tự động ước tính dựa vào khoảng cách thực tế giữa hai sân bay"
                    >
                      <LuRefreshCw size={12}/> Tự tính
                    </button>
                  </div>
                  {durCalcInfo && (
                    <div style={{ fontSize:11, marginTop:5, lineHeight:1.5, color: durCalcInfo.error ? 'var(--danger)' : 'var(--success)' }}>
                      {durCalcInfo.error
                        ? `⚠ ${durCalcInfo.error}`
                        : `✓ Khoảng cách ~${durCalcInfo.km.toLocaleString('vi-VN')} km → ước tính ${Math.floor(durCalcInfo.mins / 60)}h${durCalcInfo.mins % 60 > 0 ? ` ${durCalcInfo.mins % 60}m` : ''} (đã tính thời gian lăn bánh)`
                      }
                    </div>
                  )}
                  {/* ★ Ghi chú thời gian */}
                  <div style={{ fontSize:11, marginTop:4, color:'var(--text-muted)' }}>
                    Thời gian bay thực tế trên không — <strong style={{ color:'var(--accent)' }}>không tính</strong> thời gian chờ ở sân bay. Nhập chỉ phút (VD: 90) sẽ tự đổi sang giờ + phút.
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 2: Lịch trình ── */}
            <div className="card" style={{ marginBottom: 16, padding: '20px 20px 12px' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--text-primary)' }}>
                Lịch trình
              </div>
              <div className="form-grid">
                {/* Date range */}
                <div className="form-group">
                  <label className="form-label">Từ ngày *</label>
                  <input className="form-control" type="date" value={form.start_date} onChange={e => sf('start_date', e.target.value)}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Đến ngày *</label>
                  <input className="form-control" type="date" value={form.end_date} min={form.start_date} onChange={e => sf('end_date', e.target.value)}/>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Số chuyến/ngày
                    <span style={{ fontWeight:400, fontSize:11, color:'var(--text-muted)', marginLeft:6 }}>— để trống = tạo đủ 24 chuyến/ngày</span>
                  </label>
                  <input
                    className="form-control" type="number" min="1" max="24"
                    value={form.flights_per_day}
                    onChange={e => sf('flights_per_day', e.target.value)}
                    placeholder="24"
                  />
                  {/* ★ Ghi chú nổi bật */}
                  <div style={{ fontSize:11, marginTop:4, color:'var(--accent)', fontWeight:500 }}>
                    Mỗi ngày trong khoảng đã chọn sẽ tạo đúng số chuyến này.
                    Các giờ được phân bổ đều trong ngày (0 – 23h).
                    Tổng = số ngày × số chuyến/ngày.
                  </div>
                </div>

                {/* Days of week */}
                <div className="form-group full">
                  <label className="form-label">Các ngày trong tuần *</label>
                  <div style={{ fontSize:12, marginBottom:8, color:'var(--text-muted)', lineHeight:1.6 }}>
                    Lọc ngày <strong>trong khoảng đã chọn</strong> — chỉ tạo chuyến vào những ngày được tick.
                    VD: chọn 01/06 → 30/06 nhưng chỉ tick <strong>T2–T6</strong> → hệ thống bỏ qua T7 &amp; CN,
                    chỉ tạo trên ~22 ngày làm việc thay vì cả 30 ngày.
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {DAYS_OF_WEEK.map(d => (
                      <button key={d.value} type="button" onClick={() => toggleDay(d.value)} style={{
                        padding:'6px 16px', borderRadius:20, border:'1px solid', fontSize:13, fontWeight:500, cursor:'pointer',
                        background: form.days_of_week.includes(d.value) ? 'var(--accent)' : 'var(--bg-input)',
                        color:      form.days_of_week.includes(d.value) ? '#fff' : 'var(--text-secondary)',
                        borderColor:form.days_of_week.includes(d.value) ? 'var(--accent)' : 'var(--border)',
                        transition: 'all 0.12s',
                      }}>
                        {d.label}
                      </button>
                    ))}
                    <button type="button" className="btn btn-secondary btn-sm" style={{ borderRadius:20 }} onClick={() => setForm(p => ({ ...p, days_of_week: [0,1,2,3,4,5,6] }))}>Tất cả</button>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ borderRadius:20 }} onClick={() => setForm(p => ({ ...p, days_of_week: [1,2,3,4,5] }))}>T2 – T6</button>
                  </div>
                </div>

                {/* Preview */}
                {form.start_date && form.end_date && form.days_of_week.length > 0 && (
                  <div className="form-group full">
                    <div style={{
                      display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
                      background: previewDates.length > 0 ? 'var(--success-bg)' : 'var(--bg-input)',
                      border: `1px solid ${previewDates.length > 0 ? 'var(--success)' : 'var(--border)'}`,
                      borderRadius:8, fontSize:14,
                    }}>
                      {effectiveDates.length > 0 ? (
                        <>
                          <span style={{ fontSize:20 }}>✓</span>
                          <div style={{ lineHeight:1.7 }}>
                            <div>
                              <span style={{ fontWeight:600, color:'var(--success)' }}>
                                Sẽ tạo {totalToCreate} chuyến bay
                              </span>
                              <span style={{ color:'var(--text-muted)', fontSize:12, marginLeft:8 }}>
                                ({effectiveDates.length} ngày × {timeSlotsPerDay.length} chuyến/ngày)
                              </span>
                            </div>
                            {(() => {
                              const totalDaysInRange = form.start_date && form.end_date
                                ? getDatesInRange(form.start_date, form.end_date, [0,1,2,3,4,5,6]).length
                                : 0
                              const skipped = totalDaysInRange - effectiveDates.length
                              return skipped > 0 ? (
                                <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                                  Khoảng ngày có <strong>{totalDaysInRange} ngày</strong>, đã lọc bỏ{' '}
                                  <strong style={{ color:'var(--accent)' }}>{skipped} ngày</strong>{' '}
                                  không khớp ngày trong tuần đã chọn
                                </div>
                              ) : null
                            })()}
                            {previewDates.length >= 500 && (
                              <div style={{ fontSize:12, color:'var(--warning)' }}>⚠ Giới hạn 500 ngày/lần tạo</div>
                            )}
                            {poolShortfall && (
                              <div style={{ fontSize:12, color:'var(--danger)' }}>
                                ⚠ Chỉ còn {numPoolPreview.length} số hiệu khả dụng — cần {totalToCreate}
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <span style={{ color:'var(--text-muted)' }}>Không có ngày nào khớp trong khoảng đã chọn</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 3: Giá vé ── */}
            <div className="card" style={{ marginBottom: 24, padding: '20px 20px 4px' }}>
              <button type="button" onClick={() => setSeatsOpen(p => !p)} style={{
                display:'flex', alignItems:'center', gap:6, background:'none', border:'none',
                cursor:'pointer', padding:'0 0 16px', color:'var(--text-primary)', fontSize:14, fontWeight:600, width:'100%', textAlign:'left',
              }}>
                {seatsOpen ? '▾' : '▸'} Giá vé và cấu hình ghế
                <span style={{ fontWeight:400, fontSize:12, color:'var(--text-muted)', marginLeft:4 }}>(áp dụng cho tất cả chuyến)</span>
              </button>

              {/* ★ Ghi chú ghế nổi bật */}
              <div style={{
                display:'flex', gap:8, alignItems:'flex-start', padding:'8px 12px', marginBottom:10,
                background:'rgba(250,173,20,0.08)', border:'1px solid var(--warning)',
                borderRadius:6, fontSize:12,
              }}>
                <span style={{ color:'var(--warning)', fontWeight:700, flexShrink:0 }}>!</span>
                <span style={{ color:'var(--warning)' }}>
                  Giới hạn ghế: <strong>Economy ≤ 200</strong> · <strong>Business ≤ 40</strong> · <strong>First ≤ 20</strong>.
                  Giá gợi ý tính theo hãng + thời gian bay — chưa tính hệ số giờ cao điểm (biến động trong 24 chuyến/ngày).
                </span>
              </div>

              {/* Price suggestion */}
              {priceSuggestion && (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', marginBottom:12, background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:6, fontSize:12, flexWrap:'wrap' }}>
                  <span style={{ color:'var(--text-secondary)' }}>
                    Gợi ý giá cơ bản ({selectedAirlineCode || 'chưa chọn hãng'}):
                  </span>
                  <span>Economy <strong>{fmtPrice(priceSuggestion.economy)}</strong></span>
                  <span style={{ color:'var(--text-muted)' }}>·</span>
                  <span>Business <strong>{fmtPrice(priceSuggestion.business)}</strong></span>
                  <span style={{ color:'var(--text-muted)' }}>·</span>
                  <span>First <strong>{fmtPrice(priceSuggestion.first)}</strong></span>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft:'auto' }} onClick={handleApplyPrices}>
                    Áp dụng vào ghế
                  </button>
                </div>
              )}

              {seatsOpen && form.seats.map((seat, idx) => (
                <div className="seat-row" key={seat.class}>
                  <div className="seat-row-header"><span>{SEAT_CLASS_LABELS[seat.class]}</span></div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Số ghế <span style={{ color:'var(--accent)', fontSize:11 }}>(tối đa {SEAT_MAX[seat.class]})</span></label>
                      <input className="form-control" type="number" value={seat.total_seats} onChange={e => setSeatField(idx, 'total_seats', e.target.value)} placeholder={String(SEAT_MAX[seat.class])} min="1" max={SEAT_MAX[seat.class]}/>
                    </div>
                    <div className="form-group full">
                      <label className="form-label">Giá cơ bản (VND)</label>
                      <input className="form-control" type="number" value={seat.base_price} onChange={e => setSeatField(idx, 'base_price', e.target.value)} placeholder="VD: 1500000"/>
                      <div style={{ fontSize:11, marginTop:4, color:'var(--text-muted)', lineHeight:1.6 }}>
                        <span style={{ color:'var(--success)', fontWeight:600 }}>✓ Không bắt buộc.</span>{' '}
                        Để trống nếu chưa xác định giá — có thể cập nhật sau trong <strong>Quản lý chuyến bay</strong>.{' '}
                        Nếu điền giá, hệ thống sẽ{' '}
                        <span style={{ color:'var(--accent)', fontWeight:600 }}>tự động nhân hệ số theo giờ bay</span>{' '}
                        (VD: cao điểm sáng +25%, đêm khuya -15%) cho từng chuyến.
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Ký gửi (kg)</label>
                      <input className="form-control" type="number" value={seat.baggage_included_kg} onChange={e => setSeatField(idx, 'baggage_included_kg', e.target.value)}/>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Xách tay (kg)</label>
                      <input className="form-control" type="number" value={seat.carry_on_kg} onChange={e => setSeatField(idx, 'carry_on_kg', e.target.value)}/>
                    </div>
                    <div className="form-group full">
                      <label className="form-label">Giá hành lý mua thêm (VND/kg)</label>
                      <input className="form-control" type="number"
                        value={seat.extra_baggage_price ?? '0'}
                        onChange={e => setSeatField(idx, 'extra_baggage_price', e.target.value)}
                        placeholder="Tự động từ giá cơ bản" min="0"/>
                      <div style={{ fontSize:11, marginTop:4, color:'var(--text-muted)' }}>
                        {seat.class === 'first'
                          ? 'First Class: hành lý mua thêm miễn phí (0 VND/kg)'
                          : Number(seat.extra_baggage_price) > 0
                            ? `Tự tính từ giá vé · 5kg = ${fmtPrice(Number(seat.extra_baggage_price)*5)} · 10kg = ${fmtPrice(Number(seat.extra_baggage_price)*10)} · 20kg = ${fmtPrice(Number(seat.extra_baggage_price)*20)}`
                            : 'Tự động tính khi nhập giá cơ bản'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Action bar ── */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:12, paddingBottom:32 }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setForm(emptyForm()); setFlightNumAuto(true); setError('') }}
              >
                Đặt lại
              </button>
              <button
                className="btn btn-primary"
                disabled={!effectiveDates.length || poolShortfall}
                onClick={handleCreate}
                style={{ display:'flex', alignItems:'center', gap:6 }}
              >
                <LuCalendarDays size={14}/>
                {effectiveDates.length > 0
                  ? `Tạo ${totalToCreate} chuyến bay`
                  : 'Tạo lịch bay'}
              </button>
            </div>

            </>}{/* end scheduleMode === 'single' */}

          </div>{/* end LEFT column */}

          {/* ════════ RIGHT: Schedule list ════════ */}
          <div style={{ width: 360, flexShrink: 0, position: 'sticky', top: 16 }}>
            <div className="card" style={{ padding: '16px 16px 8px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ fontWeight:600, fontSize:14, color:'var(--text-primary)', display:'flex', alignItems:'center', gap:6 }}>
                  <LuPlane size={14}/> Danh sách lịch bay
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ display:'flex', alignItems:'center', gap:4 }}
                  onClick={loadFlights}
                  title="Tải lại"
                >
                  <LuRefreshCw size={12}/>
                </button>
              </div>

              {/* Search bar */}
              <div style={{ position:'relative', marginBottom:10 }}>
                <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}>
                  <LuSearch size={13}/>
                </span>
                <input
                  className="form-control"
                  style={{ paddingLeft:30, fontSize:13 }}
                  placeholder="Tìm số hiệu, sân bay, hãng..."
                  value={groupSearch}
                  onChange={e => setGroupSearch(e.target.value)}
                />
              </div>

              {/* Stats summary */}
              <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10 }}>
                {scheduleGroups.length} tuyến · {flights.length} chuyến tổng
              </div>

              {/* List */}
              <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY:'auto' }}>
                {filteredGroups.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text-muted)', fontSize:13 }}>
                    {scheduleGroups.length === 0 ? 'Chưa có lịch bay nào' : 'Không tìm thấy'}
                  </div>
                ) : filteredGroups.map(group => {
                  const state     = getGroupState(group)
                  const dateRange = getGroupDateRange(group)
                  const stats     = getGroupStats(group)
                  const isExpanded = expandedGroups.has(group.key)
                  const sortedFlights = [...group.flights].sort((a, b) =>
                    (a.departure_time || '').localeCompare(b.departure_time || '')
                  )
                  const fmtDt = (dt) => {
                    const m = dt?.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
                    return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : (dt || '—')
                  }
                  const STATUS_LABEL = { scheduled:'Lên lịch', delayed:'Trễ', boarding:'Lên máy bay', departed:'Đã khởi hành', arrived:'Đã đến', cancelled:'Đã hủy', completed:'Hoàn thành' }
                  const STATUS_COLOR = { scheduled:'var(--success)', delayed:'var(--warning)', boarding:'var(--accent)', departed:'var(--accent)', arrived:'var(--success)', cancelled:'var(--danger)', completed:'var(--text-muted)' }

                  return (
                    <div key={group.key} style={{
                      border:'1px solid var(--border)', borderRadius:8, marginBottom:8,
                      background: state === 'cancelled' ? 'rgba(0,0,0,0.02)' : 'var(--bg-card)',
                      opacity: state === 'cancelled' ? 0.75 : 1, overflow:'hidden',
                    }}>
                      {/* ── Clickable summary header ── */}
                      <div
                        onClick={() => toggleExpanded(group.key)}
                        style={{ padding:'10px 12px', cursor:'pointer', userSelect:'none' }}
                      >
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          {isExpanded
                            ? <LuChevronDown size={13} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
                            : <LuChevronRight size={13} style={{ color:'var(--text-muted)', flexShrink:0 }}/>}
                          <span style={{ fontWeight:700, fontSize:14 }}>
                            {group.dep_code} → {group.arr_code}
                          </span>
                          <span style={{ fontSize:11, color:'var(--text-muted)' }}>· {group.airline_code}</span>
                          {state === 'active'    && <span className="badge badge-success"  style={{ fontSize:10, marginLeft:'auto' }}>Đang chạy</span>}
                          {state === 'paused'    && <span className="badge badge-warning"  style={{ fontSize:10, marginLeft:'auto' }}>Tạm dừng</span>}
                          {state === 'cancelled' && <span className="badge badge-danger"   style={{ fontSize:10, marginLeft:'auto' }}>Đã hủy</span>}
                        </div>
                        <div style={{ fontSize:11, color:'var(--text-muted)', paddingLeft:19, marginBottom:4 }}>
                          {group.airline_name}
                          {dateRange && <> · {dateRange.from} – {dateRange.to}</>}
                          {' · '}<strong>{stats.total}</strong> chuyến
                        </div>
                        {/* Stats chips */}
                        <div style={{ display:'flex', gap:5, flexWrap:'wrap', paddingLeft:19 }}>
                          {stats.scheduled > 0 && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'var(--success-bg)', color:'var(--success)' }}>Lên lịch: {stats.scheduled}</span>}
                          {stats.paused    > 0 && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'var(--warning-bg)', color:'var(--warning)' }}>Ẩn: {stats.paused}</span>}
                          {stats.cancelled > 0 && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'rgba(220,53,69,0.1)', color:'var(--danger)' }}>Hủy: {stats.cancelled}</span>}
                        </div>
                      </div>

                      {/* ── Action buttons ── */}
                      <div style={{ display:'flex', gap:6, padding:'0 12px 10px', paddingLeft:31 }}>
                        {state === 'cancelled' ? (
                          <button className="btn btn-secondary btn-sm" style={{ display:'flex', alignItems:'center', gap:4, fontSize:11 }}
                            onClick={() => prefillFromGroup(group)}>
                            <LuCopy size={11}/> Tạo lại lịch tương tự
                          </button>
                        ) : (
                          <>
                            {state === 'paused' ? (
                              <button className="btn btn-sm" style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, background:'var(--success-bg)', color:'var(--success)', border:'1px solid var(--success)' }}
                                onClick={() => setConfirmAction({ type:'resume', group })}>
                                <LuPlay size={11}/> Tiếp tục
                              </button>
                            ) : (
                              <button className="btn btn-sm" style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, background:'var(--warning-bg)', color:'var(--warning)', border:'1px solid var(--warning)' }}
                                onClick={() => setConfirmAction({ type:'pause', group })}>
                                <LuPause size={11}/> Tạm dừng
                              </button>
                            )}
                            {stats.cancellable > 0 && (
                              <button className="btn btn-sm" style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, background:'rgba(220,53,69,0.08)', color:'var(--danger)', border:'1px solid var(--danger)' }}
                                onClick={() => setConfirmAction({ type:'cancel', group })}>
                                <LuBan size={11}/> Hủy lịch
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {/* ── Expanded flight list ── */}
                      {isExpanded && (
                        <div style={{ borderTop:'1px solid var(--border)', maxHeight:280, overflowY:'auto' }}>
                          {sortedFlights.map(f => (
                            <div key={f.id} style={{
                              display:'grid', gridTemplateColumns:'1fr 90px 80px',
                              alignItems:'center', padding:'5px 12px',
                              borderBottom:'1px solid var(--border)', fontSize:11,
                            }}>
                              <span style={{ fontWeight:600, fontFamily:'monospace', letterSpacing:0.3, color:'var(--text-primary)' }}>
                                {f.flight_number}
                              </span>
                              <span style={{ color:'var(--text-muted)' }}>{fmtDt(f.departure_time)}</span>
                              <span style={{ color: STATUS_COLOR[f.status] || 'var(--text-muted)', textAlign:'right' }}>
                                {STATUS_LABEL[f.status] || f.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>{/* end RIGHT column */}

        </div>{/* end two-column flex */}
      </div>

      {/* ════════ Confirmation Modal ════════ */}
      {confirmAction && (
        <div
          className="modal-overlay"
          onClick={e => !actionLoading && e.target === e.currentTarget && setConfirmAction(null)}
        >
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display:'flex', alignItems:'center', gap:6 }}>
                {confirmAction.type === 'cancel' && <><LuBan size={16} style={{ color:'var(--danger)' }}/> Xác nhận hủy lịch bay</>}
                {confirmAction.type === 'pause'  && <><LuPause size={16} style={{ color:'var(--warning)' }}/> Xác nhận tạm dừng</>}
                {confirmAction.type === 'resume' && <><LuPlay size={16} style={{ color:'var(--success)' }}/> Xác nhận tiếp tục</>}
              </div>
              {!actionLoading && (
                <button className="modal-close" onClick={() => setConfirmAction(null)}><LuX size={18}/></button>
              )}
            </div>

            {/* Flight info */}
            <div style={{ padding:'10px 0 6px', borderBottom:'1px solid var(--border)', marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:16 }}>
                {confirmAction.group.dep_code} → {confirmAction.group.arr_code}
              </div>
              <div style={{ fontSize:13, color:'var(--text-secondary)', marginTop:2 }}>
                {confirmAction.group.airline_name} · {getGroupStats(confirmAction.group).total} chuyến
              </div>
            </div>

            {/* Description */}
            {confirmAction.type === 'cancel' && (
              <div style={{ padding:'10px 14px', background:'rgba(220,53,69,0.08)', border:'1px solid var(--danger)', borderRadius:8, fontSize:13, marginBottom:16, lineHeight:1.7 }}>
                <div style={{ color:'var(--danger)', fontWeight:600, marginBottom:4 }}>⚠ Hành động không thể hoàn tác</div>
                Sẽ chuyển <strong>{getGroupStats(confirmAction.group).cancellable}</strong> chuyến bay có trạng thái "<em>scheduled / delayed</em>" thành "<em>cancelled</em>". Các chuyến đã khởi hành hoặc hoàn thành không bị ảnh hưởng.
                <div style={{ marginTop:8, color:'var(--text-muted)', fontSize:11 }}>
                  Sau khi hủy, bạn có thể dùng nút <strong>Tạo lại lịch tương tự</strong> nếu đổi ý.
                </div>
              </div>
            )}
            {confirmAction.type === 'pause' && (
              <div style={{ padding:'10px 14px', background:'var(--warning-bg)', border:'1px solid var(--warning)', borderRadius:8, fontSize:13, marginBottom:16, lineHeight:1.7 }}>
                <div style={{ color:'var(--warning)', fontWeight:600, marginBottom:4 }}>Tạm ẩn toàn bộ lịch</div>
                Tất cả chuyến bay chưa hủy của lịch này sẽ bị <strong>ẩn</strong> khỏi kết quả tìm kiếm của hành khách. Bạn có thể <strong>tiếp tục lại</strong> bất cứ lúc nào.
              </div>
            )}
            {confirmAction.type === 'resume' && (
              <div style={{ padding:'10px 14px', background:'var(--success-bg)', border:'1px solid var(--success)', borderRadius:8, fontSize:13, marginBottom:16, lineHeight:1.7 }}>
                <div style={{ color:'var(--success)', fontWeight:600, marginBottom:4 }}>Khôi phục hiển thị</div>
                Tất cả chuyến bay đang bị ẩn của lịch này sẽ được <strong>hiển thị trở lại</strong> trong kết quả tìm kiếm.
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button
                className="btn btn-secondary"
                disabled={actionLoading}
                onClick={() => setConfirmAction(null)}
              >
                Không, hủy bỏ
              </button>
              <button
                className={`btn ${confirmAction.type === 'cancel' ? 'btn-danger' : confirmAction.type === 'pause' ? 'btn-warning' : 'btn-primary'}`}
                style={confirmAction.type === 'pause' ? { background:'var(--warning)', color:'#fff', border:'none' } : {}}
                disabled={actionLoading}
                onClick={() => {
                  if (confirmAction.type === 'cancel') handleCancelGroup(confirmAction.group)
                  else if (confirmAction.type === 'pause') handlePauseGroup(confirmAction.group)
                  else handleResumeGroup(confirmAction.group)
                }}
              >
                {actionLoading
                  ? 'Đang xử lý...'
                  : confirmAction.type === 'cancel' ? 'Xác nhận hủy'
                  : confirmAction.type === 'pause'  ? 'Xác nhận tạm dừng'
                  : 'Xác nhận tiếp tục'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
