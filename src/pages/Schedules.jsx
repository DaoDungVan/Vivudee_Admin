import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createFlight, getAirports, getAirlines, getFlights } from '../api'
import { LuCalendarDays, LuRefreshCw, LuTriangleAlert, LuPlane, LuArrowRight, LuRotateCcw } from 'react-icons/lu'

// ─── Shared constants ─────────────────────────────────────────────────────────

const fmtPrice = (n) => n ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n)) : '—'

const DAYS_OF_WEEK = [
  { value: 1, label: 'T2' }, { value: 2, label: 'T3' }, { value: 3, label: 'T4' },
  { value: 4, label: 'T5' }, { value: 5, label: 'T6' }, { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
]

const SEAT_CLASS_ORDER = ['economy', 'business', 'first']
const SEAT_CLASS_LABELS = { economy: 'Economy', business: 'Business', first: 'First Class' }
const BAGGAGE_PACKAGE_KGS = [5, 10, 20]
const SEAT_DEFAULTS = {
  economy: { baggage_included_kg: '23', carry_on_kg: '7', extra_baggage_options: { 0: '0', 5: '0', 10: '0', 20: '0' } },
  business: { baggage_included_kg: '32', carry_on_kg: '12', extra_baggage_options: { 0: '0', 5: '0', 10: '0', 20: '0' } },
  first:    { baggage_included_kg: '40', carry_on_kg: '15', extra_baggage_options: { 0: '0', 5: '0', 10: '0', 20: '0' } },
}

const VN_AIRPORTS = new Set([
  'SGN','HAN','DAD','HPH','CXR','VCA','PQC','VDH','HUI','BMV',
  'DLI','UIH','TBB','CAH','VKG','VII','VCS','VCL','DIN','THD','PXU',
])
const VN_DOMESTIC_AIRLINES = ['VN','VJ','QH','BL','VU']
const FOREIGN_NO_DOMESTIC = new Set([
  'AA','UA','DL','BA','LH','AF','KL','QF','EK','EY','QR','TK',
  'SQ','CX','JL','NH','KE','OZ','TG','MH','AK','FD','TR','MU','CA','CZ','GA',
])

const AIRLINE_TIER = {
  VN:1.00, QH:0.82, VJ:0.63, BL:0.58, VU:0.67,
  TG:1.18, SQ:1.40, MH:1.05, TR:0.60, AK:0.55, FD:0.55,
  OD:0.62, CX:1.42, KE:1.22, OZ:1.12, JL:1.28, NH:1.25,
  AA:2.20, UA:2.20, DL:2.20, BA:1.90, LH:1.85, AF:1.80, KL:1.78, EK:1.60, TK:1.40,
}
const BASE_ECO_PER_MIN = 5000

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createSeat = (cls = 'economy') => ({ class: cls, total_seats: '', base_price: '', ...SEAT_DEFAULTS[cls] })

const buildSeatFormList = () => SEAT_CLASS_ORDER.map(cls => createSeat(cls))

const calcPrices = (durationMins, airlineCode) => {
  const mins = Number(durationMins) || 0
  if (!mins || !airlineCode) return null
  const mult = AIRLINE_TIER[String(airlineCode).toUpperCase()] ?? 1.0
  const eco = Math.round(mins * BASE_ECO_PER_MIN * mult / 10000) * 10000
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

const autoGenFlightNum = (airlineCode, existingFlights) => {
  if (!airlineCode) return ''
  const code = String(airlineCode).toUpperCase()
  const used = new Set(
    existingFlights
      .filter(f => f.status !== 'completed' && String(f.flight_number || '').startsWith(code))
      .map(f => parseInt(String(f.flight_number || '').slice(code.length), 10))
      .filter(n => !isNaN(n) && n >= 100 && n <= 999)
  )
  for (let i = 100; i <= 999; i++) if (!used.has(i)) return `${code}${i}`
  return `${code}${100 + (Date.now() % 900)}`
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
  flight_number: '', airline_id: '', departure_airport_id: '', arrival_airport_id: '',
  dep_hour: '08', dep_minute: '00', dur_h: '', dur_m: '',
  start_date: '', end_date: '', days_of_week: [1, 2, 3, 4, 5],
  seats: buildSeatFormList(),
})

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const navigate = useNavigate()
  const [airports, setAirports] = useState([])
  const [airlines, setAirlines] = useState([])
  const [flights, setFlights]   = useState([])
  const [form, setForm]         = useState(emptyForm)
  const [flightNumAuto, setFlightNumAuto] = useState(true)
  const [seatsOpen, setSeatsOpen]         = useState(false)
  const [error, setError]   = useState('')
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult]     = useState(null)

  useEffect(() => {
    getAirports({ limit: 200 }).then(r => setAirports(r.data.data || [])).catch(() => {})
    getAirlines({ limit: 100 }).then(r => setAirlines(r.data.data || [])).catch(() => {})
    getFlights({ limit: 500 }).then(r => setFlights(r.data.data || [])).catch(() => {})
  }, [])

  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setSeatField = (idx, key, value) =>
    setForm(p => ({ ...p, seats: p.seats.map((s, i) => i === idx ? { ...s, [key]: value } : s) }))
  const setSeatBaggageOption = (idx, kg, value) =>
    setForm(p => ({ ...p, seats: p.seats.map((s, i) => i === idx ? { ...s, extra_baggage_options: { ...s.extra_baggage_options, [kg]: value } } : s) }))
  const toggleDay = (day) =>
    setForm(p => ({
      ...p,
      days_of_week: p.days_of_week.includes(day)
        ? p.days_of_week.filter(d => d !== day)
        : [...p.days_of_week, day],
    }))

  const handleAirlineChange = (airlineId) => {
    sf('airline_id', airlineId)
    if (flightNumAuto) {
      const a = airlines.find(x => String(x.id) === String(airlineId))
      sf('flight_number', a?.code ? autoGenFlightNum(a.code, flights) : '')
    }
  }

  const selectedAirline     = airlines.find(a => String(a.id) === String(form.airline_id))
  const selectedAirlineCode = selectedAirline?.code || ''
  const depCode = airports.find(a => String(a.id) === String(form.departure_airport_id))?.code || ''
  const arrCode = airports.find(a => String(a.id) === String(form.arrival_airport_id))?.code || ''
  const routeWarning   = getRouteWarning(selectedAirlineCode, depCode, arrCode)
  const durMins        = Number(form.dur_h || 0) * 60 + Number(form.dur_m || 0)
  const priceSuggestion = calcPrices(durMins, selectedAirlineCode)
  const previewDates   = getDatesInRange(form.start_date, form.end_date, form.days_of_week)

  const handleApplyPrices = () => {
    if (!priceSuggestion) return
    setForm(p => ({ ...p, seats: p.seats.map(s => ({ ...s, base_price: String(priceSuggestion[s.class] ?? s.base_price) })) }))
  }

  const handleCreate = async () => {
    if (!form.flight_number)  return setError('Cần có số hiệu bay')
    if (!form.airline_id)     return setError('Chọn hãng bay')
    if (!form.departure_airport_id || !form.arrival_airport_id) return setError('Chọn đủ sân bay đi và đến')
    if (!durMins)             return setError('Nhập thời gian bay')
    if (!form.start_date || !form.end_date) return setError('Chọn ngày bắt đầu và kết thúc')
    if (new Date(form.end_date) < new Date(form.start_date)) return setError('Ngày kết thúc phải sau ngày bắt đầu')
    if (!form.days_of_week.length) return setError('Chọn ít nhất 1 ngày trong tuần')
    if (!previewDates.length) return setError('Không có ngày nào trong khoảng đã chọn')

    setError('')
    setCreating(true)
    setProgress({ done: 0, total: previewDates.length, failed: 0 })

    const p2 = n => String(n).padStart(2, '0')
    const depH = p2(Number(form.dep_hour) || 0)
    const depM = p2(Number(form.dep_minute) || 0)
    const seatPayload = form.seats.map(s => ({
      class: s.class, total_seats: s.total_seats, base_price: s.base_price,
      baggage_included_kg: s.baggage_included_kg, carry_on_kg: s.carry_on_kg,
      extra_baggage_options: { 0: 0, 5: Number(s.extra_baggage_options?.[5] ?? 0), 10: Number(s.extra_baggage_options?.[10] ?? 0), 20: Number(s.extra_baggage_options?.[20] ?? 0) },
    }))

    let done = 0, failed = 0
    for (const dateStr of previewDates) {
      const depTime = `${dateStr}T${depH}:${depM}`
      try {
        await createFlight({
          flight_number: form.flight_number,
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
      setProgress({ done: done + failed, total: previewDates.length, failed })
    }

    setCreating(false)
    setResult({ done, failed, total: previewDates.length, flightNum: form.flight_number, start: form.start_date, end: form.end_date })
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
            <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>
              {progress?.done ?? 0}
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '6px 0 24px' }}>
              / {progress?.total ?? 0} chuyến bay đã xử lý
            </div>
            <div style={{ background: 'var(--border)', borderRadius: 8, height: 12, overflow: 'hidden', margin: '0 0 12px' }}>
              <div style={{
                background: 'var(--primary)', height: 12, borderRadius: 8,
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
            <div style={{ fontSize: 52, marginBottom: 16 }}>
              {result.failed === 0 ? '✅' : '⚠️'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              {result.failed === 0 ? 'Tạo lịch bay thành công!' : 'Hoàn tất với một số lỗi'}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
              <strong>{result.done}</strong> chuyến bay <strong>{result.flightNum}</strong> đã được tạo
              <br/>từ <strong>{result.start}</strong> đến <strong>{result.end}</strong>
              {result.failed > 0 && (
                <><br/><span style={{ color: 'var(--danger)' }}>{result.failed} chuyến bị lỗi (có thể đã tồn tại hoặc dữ liệu không hợp lệ)</span></>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button className="btn btn-secondary" style={{ display:'flex', alignItems:'center', gap:5 }} onClick={() => { setResult(null); setForm(emptyForm()); setFlightNumAuto(true) }}>
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

        {/* ── Section 1: Thông tin cơ bản ── */}
        <div className="card" style={{ marginBottom: 16, padding: '20px 20px 4px' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16, color: 'var(--text-primary)' }}>
            Thông tin chuyến bay
          </div>

          {routeWarning && (
            <div style={{ display:'flex', gap:8, padding:'10px 12px', marginBottom:12, background:'var(--warning-bg)', border:'1px solid var(--warning)', borderRadius:6, fontSize:13 }}>
              <LuTriangleAlert size={15} style={{ color:'var(--warning)', flexShrink:0, marginTop:1 }}/>
              <span style={{ color:'var(--warning)' }}>{routeWarning}</span>
            </div>
          )}

          <div className="form-grid">
            {/* Flight number */}
            <div className="form-group">
              <label className="form-label">
                Số hiệu bay *
                <span style={{ fontWeight:400, fontSize:11, color:'var(--text-muted)', marginLeft:6 }}>
                  {flightNumAuto ? '— tự động' : '— tùy chỉnh'}
                </span>
              </label>
              <div style={{ display:'flex', gap:6 }}>
                <input
                  className="form-control" value={form.flight_number} placeholder="VJ123"
                  onChange={e => sf('flight_number', e.target.value)}
                  readOnly={flightNumAuto}
                  style={flightNumAuto ? { background:'var(--bg-input)', color:'var(--text-secondary)', cursor:'default' } : {}}
                />
                {flightNumAuto
                  ? <button type="button" className="btn btn-secondary btn-sm" style={{ whiteSpace:'nowrap' }} onClick={() => setFlightNumAuto(false)}>Sửa</button>
                  : <button type="button" className="btn btn-secondary btn-sm" title="Tự động sinh lại" onClick={() => { if (selectedAirlineCode) sf('flight_number', autoGenFlightNum(selectedAirlineCode, flights)); setFlightNumAuto(true) }}><LuRefreshCw size={13}/></button>
                }
              </div>
              {flightNumAuto && !form.airline_id && (
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>Chọn hãng bay để tự sinh số hiệu</div>
              )}
            </div>

            {/* Airline */}
            <div className="form-group">
              <label className="form-label">Hãng bay *</label>
              <select className="form-control" value={form.airline_id} onChange={e => handleAirlineChange(e.target.value)}>
                <option value="">-- Chọn hãng --</option>
                {airlines.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
              </select>
            </div>

            {/* Airports */}
            <div className="form-group">
              <label className="form-label">Sân bay đi *</label>
              <select className="form-control" value={form.departure_airport_id} onChange={e => sf('departure_airport_id', e.target.value)}>
                <option value="">-- Chọn --</option>
                {airports.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Sân bay đến *</label>
              <select className="form-control" value={form.arrival_airport_id} onChange={e => sf('arrival_airport_id', e.target.value)}>
                <option value="">-- Chọn --</option>
                {airports.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
              </select>
            </div>

            {/* Departure time */}
            <div className="form-group">
              <label className="form-label">Giờ khởi hành hàng ngày * <span style={{ fontWeight:400, color:'var(--text-muted)', fontSize:11 }}>(ICT)</span></label>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input className="form-control" type="number" min="0" max="23" value={form.dep_hour} onChange={e => sf('dep_hour', e.target.value)} style={{ width:80 }} placeholder="08"/>
                <span style={{ fontSize:15, fontWeight:600 }}>:</span>
                <input className="form-control" type="number" min="0" max="59" value={form.dep_minute} onChange={e => sf('dep_minute', e.target.value)} style={{ width:80 }} placeholder="00"/>
              </div>
            </div>

            {/* Duration */}
            <div className="form-group">
              <label className="form-label">Thời gian bay *</label>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input className="form-control" type="number" min="0" max="24" value={form.dur_h} onChange={e => sf('dur_h', e.target.value)} style={{ width:80 }} placeholder="1"/>
                <span style={{ fontSize:13, color:'var(--text-secondary)' }}>giờ</span>
                <input className="form-control" type="number" min="0" value={form.dur_m} onChange={e => sf('dur_m', e.target.value)} style={{ width:80 }} placeholder="30"/>
                <span style={{ fontSize:13, color:'var(--text-secondary)' }}>phút</span>
                {durMins > 0 && <span style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>= {durMins} phút</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: Lịch trình ── */}
        <div className="card" style={{ marginBottom: 16, padding: '20px 20px 4px' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16, color: 'var(--text-primary)' }}>
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

            {/* Days of week */}
            <div className="form-group full">
              <label className="form-label">Các ngày trong tuần *</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                {DAYS_OF_WEEK.map(d => (
                  <button key={d.value} type="button" onClick={() => toggleDay(d.value)} style={{
                    padding:'6px 16px', borderRadius:20, border:'1px solid', fontSize:13, fontWeight:500, cursor:'pointer',
                    background: form.days_of_week.includes(d.value) ? 'var(--primary)' : 'var(--bg-input)',
                    color:      form.days_of_week.includes(d.value) ? '#fff' : 'var(--text-secondary)',
                    borderColor:form.days_of_week.includes(d.value) ? 'var(--primary)' : 'var(--border)',
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
                  {previewDates.length > 0 ? (
                    <>
                      <span style={{ fontSize:20 }}>✓</span>
                      <div>
                        <span style={{ fontWeight:600, color:'var(--success)' }}>Sẽ tạo {previewDates.length} chuyến bay</span>
                        <span style={{ color:'var(--text-muted)', fontSize:12, marginLeft:8 }}>
                          {form.start_date} → {form.end_date}
                        </span>
                        {previewDates.length >= 500 && (
                          <span style={{ color:'var(--warning)', fontSize:12, marginLeft:8 }}>⚠ Giới hạn 500/lần</span>
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

          {/* Price suggestion */}
          {priceSuggestion && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', marginBottom:12, background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:6, fontSize:12, flexWrap:'wrap' }}>
              <span style={{ color:'var(--text-secondary)' }}>Gợi ý giá ({selectedAirlineCode}):</span>
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
                  <label className="form-label">Số ghế</label>
                  <input className="form-control" type="number" value={seat.total_seats} onChange={e => setSeatField(idx, 'total_seats', e.target.value)} placeholder="150" min="1"/>
                </div>
                <div className="form-group full">
                  <label className="form-label">Giá cơ bản (VND)</label>
                  <input className="form-control" type="number" value={seat.base_price} onChange={e => setSeatField(idx, 'base_price', e.target.value)} placeholder="1500000"/>
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
                  <label className="form-label">Hành lý mua thêm</label>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                    {BAGGAGE_PACKAGE_KGS.map(kg => (
                      <div key={kg}>
                        <label className="form-label" style={{ fontSize:11 }}>{kg}kg (VND)</label>
                        <input className="form-control" type="number" value={seat.extra_baggage_options?.[kg] ?? '0'} onChange={e => setSeatBaggageOption(idx, kg, e.target.value)}/>
                      </div>
                    ))}
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
            disabled={!previewDates.length}
            onClick={handleCreate}
            style={{ display:'flex', alignItems:'center', gap:6 }}
          >
            <LuCalendarDays size={14}/>
            {previewDates.length > 0 ? `Tạo ${previewDates.length} chuyến bay` : 'Tạo lịch bay'}
          </button>
        </div>
      </div>
    </>
  )
}
