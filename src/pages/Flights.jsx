import { useState, useEffect, useCallback, useRef } from 'react'
import { getFlights, createFlight, updateFlight, updateFlightStatus, toggleFlightVisibility, getAirports, getAirlines } from '../api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { Link } from 'react-router-dom'
import { LuPlane, LuSearch, LuPencil, LuEye, LuBan, LuX, LuTriangleAlert, LuZap, LuCalculator, LuRefreshCw, LuCalendarDays, LuArrowLeftRight } from 'react-icons/lu'

const SEARCH_FETCH_LIMIT = 500

const SORT_OPTIONS = [
  { value: 'created_desc', label: 'Mới tạo nhất' },
  { value: 'created_asc',  label: 'Cũ tạo nhất' },
  { value: '',    label: 'Sắp xếp khởi hành' },
  { value: 'desc', label: 'Khởi hành mới nhất' },
  { value: 'asc',  label: 'Khởi hành cũ nhất' },
]
const fmtPrice = (n) => n ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n)) : '—'

const SEAT_CLASS_ORDER = ['economy', 'business', 'first']
const SEAT_CLASS_LABELS = { economy: 'Economy', business: 'Business', first: 'First Class' }
const SEAT_DEFAULTS = {
  economy:  { total_seats: '200', baggage_included_kg: '23', carry_on_kg: '7',  extra_baggage_price: '0' },
  business: { total_seats: '40',  baggage_included_kg: '32', carry_on_kg: '12', extra_baggage_price: '0' },
  first:    { total_seats: '20',  baggage_included_kg: '40', carry_on_kg: '15', extra_baggage_price: '0' },
}

// ─── Airline / Route validation ───────────────────────────────────────────────

const VN_AIRPORTS = new Set([
  'SGN','HAN','DAD','HPH','CXR','VCA','PQC','VDH','HUI','BMV',
  'DLI','UIH','TBB','CAH','VKG','VII','VCS','VCL','DIN','THD','PXU',
])
const VN_DOMESTIC_AIRLINES = ['VN','VJ','QH','BL','VU']
const FOREIGN_NO_DOMESTIC = new Set([
  'AA','UA','DL','BA','LH','AF','KL','QF','EK','EY','QR','TK',
  'SQ','CX','JL','NH','KE','OZ','TG','MH','AK','FD','TR','MU','CA','CZ','GA',
])

const BASE_ECO_PER_MIN = 5000 // VND per flight-minute, VN Airlines baseline

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

const tierInfo = (tier) => {
  const m = Number(tier) || 1.0
  if (m >= 1.3) return { label: 'Cao cấp', cls: 'badge-info' }
  if (m >= 0.85) return { label: 'Trung cấp', cls: 'badge-warning' }
  return { label: 'Giá rẻ', cls: 'badge-success' }
}

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
      return `Hãng ${airlineCode} thường không khai thác nội địa Việt Nam — kiểm tra lại`
  }
  return null
}

const ACTIVE_FLIGHT_STATUSES = new Set(['scheduled', 'delayed', 'boarding', 'departed', 'arrived'])

const autoGenFlightNum = (airlineCode, existingFlights) => {
  if (!airlineCode) return ''
  const code = String(airlineCode).toUpperCase()
  const used = new Set(
    existingFlights
      .filter(f => ACTIVE_FLIGHT_STATUSES.has(f.status) && String(f.flight_number || '').startsWith(code))
      .map(f => parseInt(String(f.flight_number || '').slice(code.length), 10))
      .filter(n => !isNaN(n) && n >= 100 && n <= 999)
  )
  for (let i = 100; i <= 999; i++) if (!used.has(i)) return `${code}${i}`
  return `${code}${100 + (Date.now() % 900)}`
}

const nowLocalISO = () => {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const addMinsToISO = (isoStr, mins) => {
  if (!isoStr || !mins) return ''
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  d.setMinutes(d.getMinutes() + Number(mins))
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

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

// ─── Seat helpers ─────────────────────────────────────────────────────────────

// ~4.5% base_price per kg for economy, ~2.5% for business, 0 for first
const autoExtraBagPrice = (basePrice, cls) => {
  const p = Number(basePrice) || 0
  if (!p || cls === 'first') return '0'
  const ratio = cls === 'business' ? 0.025 : 0.045
  return String(Math.max(5000, Math.round(p * ratio / 1000) * 1000))
}

const normalizeSeatForForm = (seat = {}) => {
  const cls = seat.class || 'economy'
  const def = SEAT_DEFAULTS[cls] || SEAT_DEFAULTS.economy
  return {
    class: cls,
    total_seats: seat.total_seats ?? '',
    base_price: seat.base_price ?? '',
    baggage_included_kg: seat.baggage_included_kg ?? def.baggage_included_kg,
    carry_on_kg: seat.carry_on_kg ?? def.carry_on_kg,
    extra_baggage_price: String(seat.extra_baggage_price ?? 0),
  }
}

const createSeat = (seatClass = 'economy') => ({ class: seatClass, total_seats: '', base_price: '', ...SEAT_DEFAULTS[seatClass] })

const buildSeatFormList = (seats = []) => {
  const map = new Map((Array.isArray(seats) ? seats : []).map(s => [s.class, s]))
  return SEAT_CLASS_ORDER.map(cls => normalizeSeatForForm(map.get(cls) || createSeat(cls)))
}

// ─── Flight list helpers ───────────────────────────────────────────────────────

const matchesFlightSearch = (f, q) =>
  [f.flight_number, f.airline_name, f.airline_code, f.departure_code, f.arrival_code, f.dep_code, f.arr_code, f.from_city, f.to_city, f.departure_city, f.arrival_city]
    .some(v => String(v || '').toLowerCase().includes(q))

const getFlightDateValue = (v) => {
  if (!v) return NaN
  const t = new Date(String(v).replace(' ', 'T')).getTime()
  return isNaN(t) ? NaN : t
}

const getFlightDateOnly = (v) => {
  if (!v) return ''
  const m = String(v).match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

const sortFlights = (items, dir) => {
  if (dir === 'created_desc') return [...items].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
  if (dir === 'created_asc')  return [...items].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
  return [...items].sort((a, b) => {
    const ta = getFlightDateValue(a?.departure_time)
    const tb = getFlightDateValue(b?.departure_time)
    if (isNaN(ta) && isNaN(tb)) return 0
    if (isNaN(ta)) return 1
    if (isNaN(tb)) return -1
    return dir === 'desc' ? tb - ta : ta - tb
  })
}

const STATUS_LABELS = {
  scheduled: { label: 'Đã lên lịch',    cls: 'badge-info' },
  delayed:   { label: 'Trễ giờ',        cls: 'badge-warning' },
  boarding:  { label: 'Lên máy bay',    cls: 'badge-warning' },
  departed:  { label: 'Đã khởi hành',   cls: 'badge-success' },
  arrived:   { label: 'Đã hạ cánh',     cls: 'badge-success' },
  cancelled: { label: 'Đã huỷ',         cls: 'badge-danger' },
  completed: { label: 'Hoàn thành',     cls: 'badge-muted' },
}
const FLIGHT_STATUSES = ['scheduled', 'delayed', 'boarding', 'departed', 'arrived', 'cancelled', 'completed']

const formatRawDateTime = (iso) => {
  if (!iso) return '—'
  const s = String(iso)
  const dm = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  const tm = s.match(/[T ](\d{2}):(\d{2})/)
  if (!dm) return s
  return tm ? `${dm[3]}/${dm[2]}/${dm[1]} ${tm[1]}:${tm[2]}` : `${dm[3]}/${dm[2]}/${dm[1]}`
}

const createEmptyFlight = () => ({
  flight_number: '', airline_id: '', departure_airport_id: '', arrival_airport_id: '',
  departure_time: '', arrival_time: '', duration_minutes: '', gate: '', seats: buildSeatFormList(),
})

const buildFlightPayload = (form) => ({
  flight_number: String(form.flight_number || '').trim(),
  airline_id: form.airline_id || '',
  departure_airport_id: form.departure_airport_id || '',
  arrival_airport_id: form.arrival_airport_id || '',
  departure_time: form.departure_time || '',
  arrival_time: form.arrival_time || '',
  duration_minutes: form.duration_minutes || '',
  gate: form.gate || null,
  seats: Array.isArray(form.seats) ? form.seats.map(s => ({
    class: s.class, total_seats: s.total_seats, base_price: s.base_price,
    baggage_included_kg: s.baggage_included_kg, carry_on_kg: s.carry_on_kg,
    extra_baggage_price: Number(s.extra_baggage_price) || 0,
  })) : [],
})

// ─── PriceCalcPanel ───────────────────────────────────────────────────────────

function PriceCalcPanel({ airports, airlines, onClose }) {
  const [depId, setDepId] = useState('')
  const [arrId, setArrId] = useState('')
  const [durH, setDurH] = useState('')
  const [durM, setDurM] = useState('')

  const dep = airports.find(a => String(a.id) === String(depId))
  const arr = airports.find(a => String(a.id) === String(arrId))
  const depCode = (dep?.code || '').toUpperCase()
  const arrCode = (arr?.code || '').toUpperCase()
  const totalMins = Number(durH || 0) * 60 + Number(durM || 0)
  const isDomestic = depCode && arrCode && VN_AIRPORTS.has(depCode) && VN_AIRPORTS.has(arrCode)

  const relevantAirlines = airlines
    .filter(a => {
      if (!depCode || !arrCode) return true
      const code = (a.code || '').toUpperCase()
      return isDomestic ? VN_DOMESTIC_AIRLINES.includes(code) : true
    })
    .sort((a, b) => (Number(b.price_tier) || 1.0) - (Number(a.price_tier) || 1.0))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 740 }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <LuCalculator size={16}/> Công cụ tính giá tham khảo theo hãng
          </div>
          <button className="modal-close" onClick={onClose}><LuX size={18}/></button>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Sân bay đi</label>
            <select className="form-control" value={depId} onChange={e => setDepId(e.target.value)}>
              <option value="">-- Chọn --</option>
              {airports.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Sân bay đến</label>
            <select className="form-control" value={arrId} onChange={e => setArrId(e.target.value)}>
              <option value="">-- Chọn --</option>
              {airports.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div className="form-group full">
            <label className="form-label">Thời gian bay ước tính</label>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input className="form-control" type="number" min="0" max="24" value={durH} onChange={e => setDurH(e.target.value)} placeholder="1" style={{ width:80 }} />
              <span style={{ fontSize:13, color:'var(--text-secondary)', whiteSpace:'nowrap' }}>giờ</span>
              <input className="form-control" type="number" min="0" max="59" value={durM} onChange={e => setDurM(e.target.value)} placeholder="30" style={{ width:80 }} />
              <span style={{ fontSize:13, color:'var(--text-secondary)', whiteSpace:'nowrap' }}>phút</span>
              {totalMins > 0 && <span style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>= {totalMins} phút tổng</span>}
            </div>
          </div>
        </div>

        {totalMins > 0 && relevantAirlines.length > 0 ? (
          <div style={{ marginTop:16, overflowX:'auto' }}>
            <table style={{ width:'100%', fontSize:13, borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--bg-input)' }}>
                  <th style={{ textAlign:'left', padding:'8px 10px', fontWeight:500 }}>Hãng bay</th>
                  <th style={{ textAlign:'right', padding:'8px 10px', fontWeight:500 }}>Economy</th>
                  <th style={{ textAlign:'right', padding:'8px 10px', fontWeight:500 }}>Business</th>
                  <th style={{ textAlign:'right', padding:'8px 10px', fontWeight:500 }}>First Class</th>
                  <th style={{ textAlign:'center', padding:'8px 10px', fontWeight:500 }}>Phân khúc</th>
                </tr>
              </thead>
              <tbody>
                {relevantAirlines.map(a => {
                  const prices = calcPrices(totalMins, Number(a.price_tier) || 1.0)
                  if (!prices) return null
                  const { label, cls } = tierInfo(a.price_tier)
                  return (
                    <tr key={a.id} style={{ borderTop:'1px solid var(--border)' }}>
                      <td style={{ padding:'7px 10px', fontWeight:500 }}>
                        {a.name} <span style={{ color:'var(--text-muted)', fontSize:11 }}>({a.code})</span>
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'right' }}>{fmtPrice(prices.economy)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right' }}>{fmtPrice(prices.business)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right' }}>{fmtPrice(prices.first)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'center' }}><span className={`badge ${cls}`}>{label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:8, padding:'0 2px' }}>
              * Giá tham khảo ước tính — VJ/BL là LCC (giá rẻ), VN/SQ là hãng truyền thống (full-service). Không phải giá chính thức.
            </div>
          </div>
        ) : (
          <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text-muted)', fontSize:13 }}>
            {totalMins === 0 ? 'Nhập thời gian bay để xem giá tham khảo' : 'Chọn sân bay để lọc hãng phù hợp'}
          </div>
        )}
      </div>
    </div>
  )
}


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

// ─── Main component ───────────────────────────────────────────────────────────

export default function FlightsPage() {
  const [flights, setFlights] = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1, page: 1 })
  const [page, setPage] = useState(1)
  const [limit] = useState(15)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [departureDateFilter, setDepartureDateFilter] = useState('')
  const [sortDirection, setSortDirection] = useState('created_desc')
  const [showHidden, setShowHidden] = useState(true)
  const [modal, setModal] = useState(null)
  const [editData, setEditData] = useState(null)
  const [form, setForm] = useState(createEmptyFlight)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [airports, setAirports] = useState([])
  const [airlines, setAirlines] = useState([])
  const [priceCalcOpen, setPriceCalcOpen] = useState(false)
  const [flightNumAuto, setFlightNumAuto] = useState(true)
  const [durCalcInfo, setDurCalcInfo] = useState(null) // { km, mins } | { error }
  const requestIdRef = useRef(0)
  const saveLockRef = useRef(false)
  const debouncedSearch = useDebouncedValue(search)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    const keyword = debouncedSearch.trim()
    const searching = keyword.length > 0
    const filteringDate = Boolean(departureDateFilter)
    const sorting = Boolean(sortDirection)
    const useClient = searching || filteringDate || sorting

    setLoading(true)
    getFlights({
      page: useClient ? 1 : page,
      limit: useClient ? SEARCH_FETCH_LIMIT : limit,
      status: filterStatus || undefined,
      show_hidden: showHidden ? true : undefined,
    })
      .then(r => {
        if (requestId !== requestIdRef.current) return
        const d = r.data
        let items = d.data || []

        if (useClient) {
          if (searching) items = items.filter(f => matchesFlightSearch(f, keyword.toLowerCase()))
          if (filteringDate) items = items.filter(f => getFlightDateOnly(f.departure_time) === departureDateFilter)
          if (sorting) items = sortFlights(items, sortDirection)

          const total = items.length
          const totalPages = Math.max(1, Math.ceil(total / limit))
          const safePage = Math.min(page, totalPages)
          setFlights(items.slice((safePage - 1) * limit, safePage * limit))
          setPagination({ total, total_pages: totalPages, page: safePage })
          if (safePage !== page) setPage(safePage)
          return
        }

        setFlights(items)
        setPagination(d.pagination || { total: 0, total_pages: 1, page: 1 })
      })
      .catch(() => { if (requestId !== requestIdRef.current) return })
      .finally(() => { if (requestId === requestIdRef.current) setLoading(false) })
  }, [page, limit, debouncedSearch, filterStatus, showHidden, departureDateFilter, sortDirection])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    getAirports({ limit: 200 }).then(r => setAirports(r.data.data || [])).catch(() => {})
    getAirlines({ limit: 100 }).then(r => setAirlines(r.data.data || [])).catch(() => {})
  }, [])

  const openCreate = () => {
    setForm(createEmptyFlight())
    setError('')
    setFlightNumAuto(true)
    setDurCalcInfo(null)
    setModal('create')
    setEditData(null)
  }

  const openEdit = (flight) => {
    setEditData(flight)
    setForm({
      flight_number: flight.flight_number,
      airline_id: flight.airline_id,
      departure_airport_id: flight.departure_airport_id || flight.dep_id,
      arrival_airport_id: flight.arrival_airport_id || flight.arr_id,
      departure_time: flight.departure_time?.replace(' ', 'T').slice(0, 16) || '',
      arrival_time: flight.arrival_time?.replace(' ', 'T').slice(0, 16) || '',
      duration_minutes: flight.duration_minutes,
      gate: flight.gate || '',
      seats: buildSeatFormList(flight.seats),
    })
    setError('')
    setFlightNumAuto(false)
    setDurCalcInfo(null)
    setModal('edit')
  }

  const handleAirlineChange = (airlineId) => {
    setField('airline_id', airlineId)
    if (modal === 'create' && flightNumAuto) {
      const airline = airlines.find(a => String(a.id) === String(airlineId))
      if (airline?.code) {
        setField('flight_number', autoGenFlightNum(airline.code, flights))
      } else {
        setField('flight_number', '')
      }
    }
  }

  const swapAirports = () =>
    setForm(p => ({ ...p, departure_airport_id: p.arrival_airport_id, arrival_airport_id: p.departure_airport_id }))

  const SEAT_MAX = { economy: 200, business: 40, first: 20 }

  const handleSave = async () => {
    if (saveLockRef.current) return
    for (const seat of form.seats) {
      const n = Number(seat.total_seats)
      const max = SEAT_MAX[seat.class]
      if (max && n > max) {
        setError(`${SEAT_CLASS_LABELS[seat.class]} tối đa ${max} ghế (hiện tại: ${n})`)
        return
      }
    }
    saveLockRef.current = true
    setSaving(true)
    setError('')
    try {
      const payload = buildFlightPayload(form)
      if (modal === 'create') await createFlight(payload)
      else await updateFlight(editData.id, payload)
      setModal(null)
      load()
    } catch (e) {
      const be = e.response?.data?.error || ''
      if (be.includes('flights_pkey')) setError('Backend trùng ID tự động của bảng flights, không phải trùng số hiệu bay.')
      else setError(be || 'Lỗi khi lưu')
    } finally {
      saveLockRef.current = false
      setSaving(false)
    }
  }

  const handleStatus = async (id, status) => {
    try { await updateFlightStatus(id, status); load() }
    catch (e) { alert(e.response?.data?.error || 'Lỗi') }
  }

  const handleVisibility = async (id) => {
    try { await toggleFlightVisibility(id); load() }
    catch (e) { alert(e.response?.data?.error || 'Lỗi') }
  }

  const setField = (key, value) => setForm(p => ({ ...p, [key]: value }))
  const setSeatField = (idx, key, value) =>
    setForm(p => ({ ...p, seats: p.seats.map((s, i) => {
      if (i !== idx) return s
      const updated = { ...s, [key]: value }
      if (key === 'base_price') updated.extra_baggage_price = autoExtraBagPrice(value, s.class)
      return updated
    })}))


  const clearFilters = () => { setDepartureDateFilter(''); setSortDirection(''); setPage(1) }

  const { total, total_pages } = pagination
  const pageButtons = () => {
    if (total_pages <= 7) return Array.from({ length: total_pages }, (_, i) => i + 1)
    const start = Math.max(1, Math.min(page - 3, total_pages - 6))
    return Array.from({ length: Math.min(7, total_pages) }, (_, i) => start + i)
  }

  // ─── Derived form values ─────────────────────────────────────────────────────
  const selectedAirline = airlines.find(a => String(a.id) === String(form.airline_id))
  const selectedAirlineCode = selectedAirline?.code || ''
  const depAirport = airports.find(a => String(a.id) === String(form.departure_airport_id))
  const arrAirport = airports.find(a => String(a.id) === String(form.arrival_airport_id))
  const depCode = depAirport?.code || ''
  const arrCode = arrAirport?.code || ''
  const routeWarning = getRouteWarning(selectedAirlineCode, depCode, arrCode)
  const depHour        = form.departure_time ? Number(form.departure_time.slice(11, 13)) : null
  const airlineTier    = Number(selectedAirline?.price_tier) || 1.0
  const priceSuggestion = calcPrices(form.duration_minutes, airlineTier, depHour)
  const timeInfo        = getTimeMult(depHour)

  const durTotal = Number(form.duration_minutes) || 0
  const durH = form.duration_minutes !== '' ? Math.floor(durTotal / 60) : ''
  const durM = form.duration_minutes !== '' ? durTotal % 60 : ''
  const setDurH = (val) => {
    const h = Math.max(0, Number(val) || 0)
    const m = form.duration_minutes !== '' ? durTotal % 60 : 0
    setField('duration_minutes', String(h * 60 + m))
  }
  const setDurM = (val) => {
    const h = form.duration_minutes !== '' ? Math.floor(durTotal / 60) : 0
    const m = Math.max(0, Number(val) || 0)
    setField('duration_minutes', String(h * 60 + m))
  }

  const handleSetNow = () => {
    const now = nowLocalISO()
    setField('departure_time', now)
    if (form.duration_minutes) setField('arrival_time', addMinsToISO(now, form.duration_minutes))
  }

  const handleAutoArrival = () => {
    if (form.departure_time && form.duration_minutes)
      setField('arrival_time', addMinsToISO(form.departure_time, form.duration_minutes))
  }

  const handleAutoCalcDuration = () => {
    const dep = airports.find(a => String(a.id) === String(form.departure_airport_id))
    const arr = airports.find(a => String(a.id) === String(form.arrival_airport_id))
    if (!dep || !arr) return setDurCalcInfo({ error: 'Chọn sân bay đi và đến trước' })
    if (dep.lat == null || dep.lng == null) return setDurCalcInfo({ error: `Sân bay ${dep.code} chưa có tọa độ trong DB` })
    if (arr.lat == null || arr.lng == null) return setDurCalcInfo({ error: `Sân bay ${arr.code} chưa có tọa độ trong DB` })
    const km = haversineKm(Number(dep.lat), Number(dep.lng), Number(arr.lat), Number(arr.lng))
    const mins = estimateFlightMins(km)
    setField('duration_minutes', String(mins))
    setDurCalcInfo({ km: Math.round(km), mins })
  }

  const handleApplyPrices = () => {
    if (!priceSuggestion) return
    setForm(p => ({
      ...p,
      seats: p.seats.map(s => ({
        ...s,
        base_price: String(priceSuggestion[s.class] ?? s.base_price),
        extra_baggage_price: autoExtraBagPrice(priceSuggestion[s.class] ?? s.base_price, s.class),
      }))
    }))
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}><LuPlane size={18}/> Quản lý chuyến bay</div>
          <div className="page-subtitle">{total} chuyến bay trong hệ thống</div>
        </div>
        <div className="header-right">
          <button className="btn btn-secondary" style={{ display:'flex', alignItems:'center', gap:5 }} onClick={() => setPriceCalcOpen(true)}>
            <LuCalculator size={14}/> Tính giá
          </button>
          <Link to="/schedules" className="btn btn-secondary" style={{ display:'flex', alignItems:'center', gap:5 }}>
            <LuCalendarDays size={14}/> Lịch bay
          </Link>
          <button className="btn btn-primary" onClick={openCreate}>+ Thêm chuyến bay</button>
        </div>
      </div>

      <div className="page-content">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon"><LuSearch size={16}/></span>
            <input placeholder="Tìm số hiệu, hãng bay, sân bay, thành phố..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="filter-select" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
            <option value="">Tất cả trạng thái</option>
            {FLIGHT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]?.label}</option>)}
          </select>
          <select className="filter-select" value={sortDirection} onChange={e => { setSortDirection(e.target.value); setPage(1) }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input className="filter-select" type="date" value={departureDateFilter} onChange={e => { setDepartureDateFilter(e.target.value); setPage(1) }} title="Ngày khởi hành" />
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer', color:'var(--text-secondary)' }}>
            <input type="checkbox" checked={showHidden} onChange={e => { setShowHidden(e.target.checked); setPage(1) }} />
            Hiện cả vé ẩn
          </label>
          <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Xoá lọc</button>
          <button className="btn btn-secondary btn-sm ml-auto" onClick={load}>Làm mới</button>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : flights.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><LuPlane size={36}/></div><div className="empty-text">Không tìm thấy chuyến bay</div></div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Số hiệu</th><th>Hãng</th><th>Tuyến đường</th>
                    <th>Khởi hành</th><th>Đến nơi</th><th>Thời gian</th>
                    <th>Giá (Economy / Business / First)</th>
                    <th>Trạng thái</th><th>Hiển thị</th><th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {flights.map(f => (
                    <tr key={f.id}>
                      <td><span className="td-mono">{f.flight_number}</span></td>
                      <td style={{ fontSize:13 }}>{f.airline_name || f.airline_code || '—'}</td>
                      <td>
                        <span style={{ fontSize:13, fontWeight:500 }}>
                          {f.departure_code || f.dep_code || '?'} → {f.arrival_code || f.arr_code || '?'}
                        </span>
                        {(f.from_city || f.departure_city || f.to_city || f.arrival_city) && (
                          <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                            {f.from_city || f.departure_city || ''} → {f.to_city || f.arrival_city || ''}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize:12 }}>{f.departure_time ? formatRawDateTime(f.departure_time) : '—'}</td>
                      <td style={{ fontSize:12 }}>{f.arrival_time ? formatRawDateTime(f.arrival_time) : '—'}</td>
                      <td style={{ fontSize:12, color:'var(--text-secondary)' }}>
                        {f.duration_minutes
                          ? `${Math.floor(f.duration_minutes/60)}h${f.duration_minutes%60 ? `${f.duration_minutes%60}m` : ''}`
                          : '—'}
                      </td>
                      <td style={{ fontSize:11, whiteSpace:'nowrap' }}>
                        {['economy','business','first'].map(cls => {
                          const s = (f.seats || []).find(x => x.class === cls)
                          return s ? <div key={cls}><span style={{ color:'var(--text-muted)', textTransform:'capitalize' }}>{cls}: </span>{fmtPrice(s.base_price)}</div> : null
                        })}
                      </td>
                      <td>
                        <select className="filter-select" style={{ padding:'4px 8px', fontSize:12 }} value={f.status} onChange={e => handleStatus(f.id, e.target.value)}>
                          {FLIGHT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]?.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${f.is_active !== false ? 'badge-success' : 'badge-danger'}`}>
                          {f.is_active !== false ? <><LuEye size={13}/> Hiện</> : <><LuBan size={13}/> Ẩn</>}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(f)}><LuPencil size={14}/></button>
                          <button
                            className="btn btn-sm"
                            style={{ background: f.is_active !== false ? 'var(--warning-bg)' : 'var(--success-bg)', color: f.is_active !== false ? 'var(--warning)' : 'var(--success)', border:'1px solid currentColor' }}
                            onClick={() => handleVisibility(f.id)}
                          >
                            {f.is_active !== false ? <LuBan size={14}/> : <LuEye size={14}/>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <div className="pagination-info">Trang {page} / {total_pages} · Tổng {total} chuyến bay</div>
              <div className="pagination-btns">
                <button className="page-btn" disabled={page===1} onClick={() => setPage(1)}>«</button>
                <button className="page-btn" disabled={page===1} onClick={() => setPage(p => p-1)}>‹</button>
                {pageButtons().map(p => <button key={p} className={`page-btn${p===page?' active':''}`} onClick={() => setPage(p)}>{p}</button>)}
                <button className="page-btn" disabled={page>=total_pages} onClick={() => setPage(p => p+1)}>›</button>
                <button className="page-btn" disabled={page>=total_pages} onClick={() => setPage(total_pages)}>»</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── Create / Edit Modal ─────────────────────────────────────── */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 740 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display:'flex', alignItems:'center', gap:6 }}>
                {modal === 'create' ? '+ Thêm chuyến bay' : <><LuPencil size={15}/> Cập nhật chuyến bay</>}
              </div>
              <button className="modal-close" onClick={() => setModal(null)}><LuX size={18}/></button>
            </div>

            {error && (
              <div className="alert alert-error" style={{ display:'flex', alignItems:'center', gap:6 }}>
                <LuTriangleAlert size={15}/> {error}
              </div>
            )}

            {/* Route warning */}
            {routeWarning && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px', margin:'0 0 8px', background:'var(--warning-bg)', border:'1px solid var(--warning)', borderRadius:6, fontSize:13 }}>
                <LuTriangleAlert size={15} style={{ color:'var(--warning)', flexShrink:0, marginTop:1 }} />
                <span style={{ color:'var(--warning)' }}>{routeWarning}</span>
              </div>
            )}

            <div className="form-grid">
              {/* Flight number */}
              <div className="form-group">
                <label className="form-label">
                  Số hiệu bay *
                  {modal === 'create' && (
                    <span style={{ fontWeight:400, fontSize:11, color:'var(--text-muted)', marginLeft:6 }}>
                      {flightNumAuto ? '— tự động' : '— tùy chỉnh'}
                    </span>
                  )}
                </label>
                <div style={{ display:'flex', gap:6 }}>
                  <input
                    className="form-control"
                    value={form.flight_number}
                    onChange={e => setField('flight_number', e.target.value)}
                    placeholder="VJ123"
                    readOnly={modal === 'create' && flightNumAuto}
                    style={modal === 'create' && flightNumAuto ? { background:'var(--bg-input)', color:'var(--text-secondary)', cursor:'default' } : {}}
                  />
                  {modal === 'create' && (
                    flightNumAuto ? (
                      <button type="button" className="btn btn-secondary btn-sm" style={{ whiteSpace:'nowrap' }} onClick={() => setFlightNumAuto(false)}>
                        Sửa
                      </button>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" title="Tự động sinh lại" onClick={() => {
                        if (selectedAirlineCode) setField('flight_number', autoGenFlightNum(selectedAirlineCode, flights))
                        setFlightNumAuto(true)
                      }}>
                        <LuRefreshCw size={13}/>
                      </button>
                    )
                  )}
                </div>
                {modal === 'create' && flightNumAuto && !form.airline_id && (
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>Chọn hãng bay để tự động sinh số hiệu</div>
                )}
              </div>

              {/* Airline */}
              <div className="form-group">
                <label className="form-label">Hãng bay *</label>
                <SearchSelect
                  value={form.airline_id}
                  onChange={handleAirlineChange}
                  options={airlines.map(a => ({ value: a.id, label: `${a.name} (${a.code})` }))}
                  placeholder="-- Chọn hãng --"
                />
              </div>

              {/* Airports + swap */}
              <div className="form-group full">
                <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                  <div style={{ flex:1 }}>
                    <label className="form-label">Sân bay đi *</label>
                    <SearchSelect
                      value={form.departure_airport_id}
                      onChange={v => setField('departure_airport_id', v)}
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
                      onChange={v => setField('arrival_airport_id', v)}
                      options={airports.map(a => ({ value: a.id, label: `${a.name} (${a.code})` }))}
                    />
                  </div>
                </div>
              </div>

              {/* Departure time */}
              <div className="form-group">
                <label className="form-label">Giờ khởi hành * <span style={{ fontWeight:400, color:'var(--text-muted)', fontSize:11 }}>(ICT)</span></label>
                <div style={{ display:'flex', gap:6 }}>
                  <input className="form-control" type="datetime-local" value={form.departure_time} onChange={e => setField('departure_time', e.target.value)} />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}
                    onClick={handleSetNow}
                    title="Đặt khởi hành ngay bây giờ (bỏ qua ràng buộc 24h)"
                  >
                    <LuZap size={13}/> Ngay
                  </button>
                </div>
              </div>

              {/* Arrival time */}
              <div className="form-group">
                <label className="form-label">Giờ đến * <span style={{ fontWeight:400, color:'var(--text-muted)', fontSize:11 }}>(ICT)</span></label>
                <div style={{ display:'flex', gap:6 }}>
                  <input className="form-control" type="datetime-local" value={form.arrival_time} onChange={e => setField('arrival_time', e.target.value)} />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ whiteSpace:'nowrap' }}
                    disabled={!form.departure_time || !form.duration_minutes}
                    onClick={handleAutoArrival}
                    title="Tự động tính giờ đến = khởi hành + thời gian bay"
                  >
                    Tự tính
                  </button>
                </div>
              </div>

              {/* Duration */}
              <div className="form-group full">
                <label className="form-label">Thời gian bay *</label>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <input
                    className="form-control"
                    type="number" min="0" max="24"
                    value={durH}
                    onChange={e => { setDurH(e.target.value); setDurCalcInfo(null) }}
                    placeholder="1"
                    style={{ width:80 }}
                  />
                  <span style={{ fontSize:13, color:'var(--text-secondary)', whiteSpace:'nowrap' }}>giờ</span>
                  <input
                    className="form-control"
                    type="number" min="0"
                    value={durM}
                    onChange={e => { setDurM(e.target.value); setDurCalcInfo(null) }}
                    placeholder="30"
                    style={{ width:80 }}
                  />
                  <span style={{ fontSize:13, color:'var(--text-secondary)', whiteSpace:'nowrap' }}>phút</span>
                  {form.duration_minutes ? (
                    <span style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>= {form.duration_minutes} phút tổng</span>
                  ) : null}
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
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
                  Có thể điền chỉ ô phút (ví dụ 90) hoặc kết hợp giờ + phút (1 giờ 30 phút)
                </div>
              </div>

              {/* Gate */}
              <div className="form-group">
                <label className="form-label">Cổng khởi hành (Gate)</label>
                <input
                  className="form-control"
                  value={form.gate}
                  onChange={e => setField('gate', e.target.value.toUpperCase())}
                  placeholder="VD: A12, B3 (để trống nếu chưa có)"
                  maxLength={10}
                />
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
                  Khi lưu, hệ thống tự động cập nhật gate trong boarding pass của hành khách đã check-in và gửi email thông báo.
                </div>
              </div>

              {/* Price suggestion bar */}
              {priceSuggestion && (
                <div className="form-group full">
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:6, fontSize:12, flexWrap:'wrap' }}>
                    <span style={{ color:'var(--text-secondary)', whiteSpace:'nowrap' }}>
                      Gợi ý giá ({selectedAirlineCode}
                      {timeInfo.label && <span style={{ color:'var(--accent)', marginLeft:4 }}>· {timeInfo.label}</span>}
                      ) :
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
                </div>
              )}

              {/* Seats */}
              <div className="form-group full">
                <div style={{ marginBottom:10 }}>
                  <label className="form-label">3 hạng ghế cố định và giá hành lý theo gói</label>
                </div>
                {form.seats.map((seat, idx) => (
                  <div className="seat-row" key={seat.class}>
                    <div className="seat-row-header">
                      <span>{SEAT_CLASS_LABELS[seat.class] || `Hạng ghế ${idx + 1}`}</span>
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Số ghế</label>
                        <input className="form-control" type="number" value={seat.total_seats} onChange={e => setSeatField(idx, 'total_seats', e.target.value)} placeholder={SEAT_MAX[seat.class]} min="1" max={SEAT_MAX[seat.class]} />
                      </div>
                      <div className="form-group full">
                        <label className="form-label">Giá cơ bản (VND)</label>
                        <input className="form-control" type="number" value={seat.base_price} onChange={e => setSeatField(idx, 'base_price', e.target.value)} placeholder="VD: 1500000" />
                        <div style={{ fontSize:11, marginTop:4, color:'var(--text-muted)', lineHeight:1.6 }}>
                          <span style={{ color:'var(--success)', fontWeight:600 }}>✓ Không bắt buộc.</span>{' '}
                          Để trống nếu chưa xác định — dùng nút{' '}
                          <span style={{ color:'var(--accent)', fontWeight:500 }}>Áp dụng vào ghế</span>{' '}
                          để điền giá gợi ý tự động.
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Ký gửi miễn phí (kg)</label>
                        <input className="form-control" type="number" value={seat.baggage_included_kg} onChange={e => setSeatField(idx, 'baggage_included_kg', e.target.value)} placeholder="23" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Xách tay (kg)</label>
                        <input className="form-control" type="number" value={seat.carry_on_kg} onChange={e => setSeatField(idx, 'carry_on_kg', e.target.value)} placeholder="7" />
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
                      <div className="form-group full">
                        <div style={{ fontSize:12, color:'var(--text-secondary)' }}>
                          Không mua thêm = 0 VND. Khách chọn 4 mức: không mua, 5kg, 10kg, 20kg.
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Price Calculator Modal ──────────────────────────────────── */}
      {priceCalcOpen && (
        <PriceCalcPanel airports={airports} airlines={airlines} onClose={() => setPriceCalcOpen(false)} />
      )}

    </>
  )
}
