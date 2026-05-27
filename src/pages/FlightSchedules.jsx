import { useState, useEffect, useCallback } from 'react'
import { getSchedules, createSchedule, updateScheduleStatus, deleteSchedule, triggerGenerateFlights, getAirlines, getAirports } from '../api'
import { LuCalendarClock, LuTrash2, LuToggleLeft, LuToggleRight, LuPlay, LuSave, LuRefreshCw, LuRotateCcw } from 'react-icons/lu'

const DAYS = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
]

const SEAT_CLASSES = ['economy', 'business', 'first']
const SEAT_CLASS_LABELS = { economy: 'Economy', business: 'Business', first: 'First Class' }
const SEAT_DEFAULTS = {
  economy:  { total_seats: '150', base_price: '' },
  business: { total_seats: '30',  base_price: '' },
  first:    { total_seats: '10',  base_price: '' },
}

const emptyForm = () => ({
  flight_number: '',
  flight_number_suffix: '',
  airline_id: '',
  departure_airport_id: '',
  arrival_airport_id: '',
  departure_time: '',
  arrival_time: '',
  duration_minutes: '',
  days_of_week: [1, 2, 3, 4, 5],
  start_date: '',
  end_date: '',
  seats: SEAT_CLASSES.map(cls => ({ class: cls, enabled: cls === 'economy', ...SEAT_DEFAULTS[cls] })),
})

const fmtTime = (t) => (t ? String(t).slice(0, 5) : '—')

const formatDays = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return '—'
  if (arr.length === 7) return 'Hàng ngày'
  return arr.map(d => DAYS.find(x => x.value === d)?.label || d).join(', ')
}

export default function FlightSchedulesPage() {
  const [schedules, setSchedules]   = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 })
  const [page, setPage]             = useState(1)
  const limit = 10
  const [loading, setLoading]       = useState(false)
  const [form, setForm]             = useState(emptyForm())
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult]   = useState('')
  const [airlines, setAirlines]     = useState([])
  const [airports, setAirports]     = useState([])

  const load = useCallback(() => {
    setLoading(true)
    getSchedules({ page, limit })
      .then(r => {
        setSchedules(r.data?.schedules || r.data?.data || [])
        setPagination(r.data?.pagination || { total: 0, total_pages: 1 })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getAirlines({ limit: 200 }).then(r => setAirlines(r.data?.airlines || r.data?.data || [])).catch(() => {})
    getAirports({ limit: 500 }).then(r => setAirports(r.data?.airports || r.data?.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    const { departure_time, arrival_time } = form
    if (!departure_time || !arrival_time) return
    const [dh, dm] = departure_time.split(':').map(Number)
    const [ah, am] = arrival_time.split(':').map(Number)
    let diff = (ah * 60 + am) - (dh * 60 + dm)
    if (diff <= 0) diff += 24 * 60
    setForm(f => ({ ...f, duration_minutes: String(diff) }))
  }, [form.departure_time, form.arrival_time])

  const toggleDay = (val) => {
    setForm(f => ({
      ...f,
      days_of_week: f.days_of_week.includes(val)
        ? f.days_of_week.filter(d => d !== val)
        : [...f.days_of_week, val],
    }))
  }

  const updateSeat = (cls, field, value) => {
    setForm(f => ({ ...f, seats: f.seats.map(s => s.class === cls ? { ...s, [field]: value } : s) }))
  }

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    if (!form.airline_id)               return setError('Vui lòng chọn hãng bay')
    if (!form.flight_number_suffix)     return setError('Vui lòng nhập số hiệu (phần số)')
    if (!form.departure_airport_id)     return setError('Vui lòng chọn sân bay đi')
    if (!form.arrival_airport_id)       return setError('Vui lòng chọn sân bay đến')
    if (form.departure_airport_id === form.arrival_airport_id) return setError('Sân bay đi và đến không được trùng nhau')
    if (!form.departure_time)           return setError('Vui lòng nhập giờ khởi hành')
    if (!form.arrival_time)             return setError('Vui lòng nhập giờ đến')
    if (!form.duration_minutes)         return setError('Vui lòng nhập thời gian bay')
    if (form.days_of_week.length === 0) return setError('Vui lòng chọn ít nhất một ngày trong tuần')
    if (!form.start_date)               return setError('Vui lòng nhập ngày bắt đầu')

    const enabledSeats = form.seats.filter(s => s.enabled)
    if (enabledSeats.length === 0) return setError('Vui lòng bật ít nhất một hạng ghế')
    for (const s of enabledSeats) {
      if (!s.total_seats || Number(s.total_seats) <= 0) return setError(`${SEAT_CLASS_LABELS[s.class]}: số ghế không hợp lệ`)
      if (!s.base_price  || Number(s.base_price)  <= 0) return setError(`${SEAT_CLASS_LABELS[s.class]}: giá vé không hợp lệ`)
    }

    setSaving(true)
    try {
      await createSchedule({
        flight_number:        form.flight_number.trim().toUpperCase(),
        airline_id:           Number(form.airline_id),
        departure_airport_id: Number(form.departure_airport_id),
        arrival_airport_id:   Number(form.arrival_airport_id),
        departure_time:       form.departure_time,
        arrival_time:         form.arrival_time,
        duration_minutes:     Number(form.duration_minutes),
        days_of_week:         form.days_of_week,
        start_date:           form.start_date,
        end_date:             form.end_date || null,
        seats: enabledSeats.map(s => ({
          class: s.class, total_seats: Number(s.total_seats), base_price: Number(s.base_price),
        })),
      })
      setSuccess(`Đã tạo lịch bay ${form.flight_number.toUpperCase()} thành công!`)
      setForm(emptyForm())
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Tạo lịch bay thất bại')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (id, current) => {
    try {
      await updateScheduleStatus(id, !current)
      setSchedules(s => s.map(x => x.id === id ? { ...x, is_active: !current } : x))
    } catch {}
  }

  const handleDelete = async (id, flightNumber) => {
    if (!window.confirm(`Xoá lịch bay "${flightNumber}"? Các chuyến bay đã tạo sẽ không bị ảnh hưởng.`)) return
    try { await deleteSchedule(id); load() } catch {}
  }

  const handleGenerate = async () => {
    setGenerating(true); setGenResult('')
    try {
      const r = await triggerGenerateFlights()
      setGenResult(r.data?.message || 'Hoàn thành')
    } catch (err) {
      setGenResult('Lỗi: ' + (err.response?.data?.error || err.message))
    } finally { setGenerating(false) }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><LuCalendarClock size={22}/> Lịch Bay Định Kỳ</h1>
          <p className="page-subtitle">Template tuyến bay — hệ thống tự tạo chuyến mỗi 24 giờ</p>
        </div>
        <button className="btn btn-secondary" onClick={handleGenerate} disabled={generating}>
          {generating ? <LuRefreshCw size={15} className="spin"/> : <LuPlay size={15}/>}
          {generating ? 'Đang chạy...' : 'Chạy Generate ngay'}
        </button>
      </div>

      {genResult && (
        <div className={`alert ${genResult.startsWith('Lỗi') ? 'alert-danger' : 'alert-success'}`} style={{ marginBottom: 16 }}>
          {genResult}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── LEFT: Form ── */}
        <div className="card" style={{ position: 'sticky', top: 20 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Tạo lịch bay mới</h3>
            <button className="btn btn-sm btn-secondary" onClick={() => { setForm(emptyForm()); setError(''); setSuccess('') }} title="Xoá trắng">
              <LuRotateCcw size={13}/>
            </button>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error   && <div className="alert alert-danger"  style={{ margin: 0 }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ margin: 0 }}>{success}</div>}

            {/* Airline */}
            <div className="form-group" style={{ margin: 0 }}>
              <label>Hãng hàng không *</label>
              <select className="form-control" value={form.airline_id}
                onChange={e => {
                  const airline = airlines.find(a => String(a.id) === e.target.value)
                  setForm(f => ({ ...f, airline_id: e.target.value, flight_number: airline?.code || '', flight_number_suffix: '' }))
                }}>
                <option value="">-- Chọn hãng --</option>
                {airlines.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>

            {/* Flight number */}
            <div className="form-group" style={{ margin: 0 }}>
              <label>Số hiệu chuyến bay *</label>
              <div style={{ display: 'flex' }}>
                <span style={{
                  padding: '8px 12px', background: 'var(--bg-muted)',
                  border: '1px solid var(--border-color)', borderRight: 'none',
                  borderRadius: '8px 0 0 8px', fontWeight: 700, minWidth: 48, textAlign: 'center',
                  color: form.flight_number ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>
                  {form.flight_number || '??'}
                </span>
                <input className="form-control" style={{ borderRadius: '0 8px 8px 0', borderLeft: 'none' }}
                  placeholder="123" value={form.flight_number_suffix}
                  onChange={e => {
                    const suffix = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setForm(f => ({ ...f, flight_number_suffix: suffix, flight_number: (f.flight_number.replace(/\d+$/, '') || '') + suffix }))
                  }}/>
              </div>
            </div>

            {/* Airports */}
            <div className="form-group" style={{ margin: 0 }}>
              <label>Sân bay đi *</label>
              <select className="form-control" value={form.departure_airport_id}
                onChange={e => setForm(f => ({ ...f, departure_airport_id: e.target.value }))}>
                <option value="">-- Chọn sân bay --</option>
                {airports.map(a => <option key={a.id} value={a.id}>{a.code} — {a.city}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Sân bay đến *</label>
              <select className="form-control" value={form.arrival_airport_id}
                onChange={e => setForm(f => ({ ...f, arrival_airport_id: e.target.value }))}>
                <option value="">-- Chọn sân bay --</option>
                {airports.map(a => <option key={a.id} value={a.id}>{a.code} — {a.city}</option>)}
              </select>
            </div>

            {/* Times */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Giờ khởi hành *</label>
                <input type="time" className="form-control" value={form.departure_time}
                  onChange={e => setForm(f => ({ ...f, departure_time: e.target.value }))}/>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Giờ đến *</label>
                <input type="time" className="form-control" value={form.arrival_time}
                  onChange={e => setForm(f => ({ ...f, arrival_time: e.target.value }))}/>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Thời gian bay (phút) — tự tính</label>
              <input type="number" className="form-control" min="1" value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}/>
            </div>

            {/* Days */}
            <div className="form-group" style={{ margin: 0 }}>
              <label>Ngày bay trong tuần *</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {DAYS.map(d => (
                  <button key={d.value} type="button"
                    className={`btn btn-sm ${form.days_of_week.includes(d.value) ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ minWidth: 38 }}
                    onClick={() => toggleDay(d.value)}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Ngày bắt đầu *</label>
                <input type="date" className="form-control" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}/>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Ngày kết thúc</label>
                <input type="date" className="form-control" value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}/>
              </div>
            </div>

            {/* Seats */}
            <div className="form-group" style={{ margin: 0 }}>
              <label>Hạng ghế & giá vé *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                {form.seats.map(s => (
                  <div key={s.class} style={{
                    border: '1px solid var(--border-color)', borderRadius: 8,
                    padding: '10px 12px',
                    background: s.enabled ? 'var(--bg-card)' : 'var(--bg-muted)',
                    opacity: s.enabled ? 1 : 0.5,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: s.enabled ? 8 : 0 }}>
                      <input type="checkbox" id={`seat-${s.class}`} checked={s.enabled}
                        onChange={e => updateSeat(s.class, 'enabled', e.target.checked)}
                        style={{ width: 15, height: 15, cursor: 'pointer' }}/>
                      <label htmlFor={`seat-${s.class}`} style={{ fontWeight: 600, cursor: 'pointer', margin: 0, fontSize: 13 }}>
                        {SEAT_CLASS_LABELS[s.class]}
                      </label>
                    </div>
                    {s.enabled && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Số ghế</label>
                          <input type="number" className="form-control" min="1" value={s.total_seats}
                            onChange={e => updateSeat(s.class, 'total_seats', e.target.value)}/>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Giá vé (VNĐ)</label>
                          <input type="number" className="form-control" min="0" value={s.base_price}
                            placeholder="VD: 1000000"
                            onChange={e => updateSeat(s.class, 'base_price', e.target.value)}/>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} onClick={handleSubmit} disabled={saving}>
              {saving ? <LuRefreshCw size={14} className="spin"/> : <LuSave size={14}/>}
              {saving ? 'Đang lưu...' : 'Tạo lịch bay'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Table ── */}
        <div className="card">
          {loading ? (
            <div className="loading-wrap"><div className="spinner"/></div>
          ) : schedules.length === 0 ? (
            <div className="empty-state">
              <LuCalendarClock size={40} style={{ opacity: 0.3, marginBottom: 8 }}/>
              <p>Chưa có lịch bay nào. Tạo lịch bay định kỳ đầu tiên!</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Số hiệu</th>
                  <th>Tuyến bay</th>
                  <th>Hãng</th>
                  <th>Giờ bay</th>
                  <th>Ngày bay</th>
                  <th>Hiệu lực</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.id}>
                    <td><b>{s.flight_number}</b></td>
                    <td>
                      {s.dep_code} → {s.arr_code}
                      <br/><small style={{ color: 'var(--text-muted)' }}>{s.dep_city} → {s.arr_city}</small>
                    </td>
                    <td>
                      {s.airline_code}
                      <br/><small style={{ color: 'var(--text-muted)' }}>{s.airline_name}</small>
                    </td>
                    <td>
                      {fmtTime(s.departure_time)} → {fmtTime(s.arrival_time)}
                      <br/><small style={{ color: 'var(--text-muted)' }}>{s.duration_minutes} phút</small>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDays(s.days_of_week)}</td>
                    <td>
                      <small>{s.start_date ? new Date(s.start_date).toLocaleDateString('vi-VN') : '—'}</small>
                      <br/><small style={{ color: 'var(--text-muted)' }}>{s.end_date ? '→ ' + new Date(s.end_date).toLocaleDateString('vi-VN') : '→ Không hạn'}</small>
                    </td>
                    <td>
                      <span className={`badge ${s.is_active ? 'badge-success' : 'badge-secondary'}`}>
                        {s.is_active ? 'Đang chạy' : 'Tạm dừng'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className={`btn btn-sm ${s.is_active ? 'btn-warning' : 'btn-success'}`}
                          title={s.is_active ? 'Tạm dừng' : 'Kích hoạt'}
                          onClick={() => toggleActive(s.id, s.is_active)}>
                          {s.is_active ? <LuToggleRight size={15}/> : <LuToggleLeft size={15}/>}
                        </button>
                        <button className="btn btn-sm btn-danger" title="Xoá"
                          onClick={() => handleDelete(s.id, s.flight_number)}>
                          <LuTrash2 size={15}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {pagination.total_pages > 1 && (
            <div className="pagination">
              <button className="btn btn-sm btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
              <span>Trang {page} / {pagination.total_pages}</span>
              <button className="btn btn-sm btn-secondary" disabled={page >= pagination.total_pages} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
