import { useState, useEffect, useCallback, useRef } from 'react'
import { getFlights, createFlight, updateFlight, updateFlightStatus, toggleFlightVisibility, getAirports, getAirlines } from '../api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

const SEARCH_FETCH_LIMIT = 500

const matchesFlightSearch = (flight, keyword) => {
  const q = keyword.toLowerCase()
  return [
    flight.flight_number,
    flight.airline_name,
    flight.airline_code,
    flight.departure_code,
    flight.arrival_code,
    flight.dep_code,
    flight.arr_code,
    flight.from_city,
    flight.to_city,
    flight.departure_city,
    flight.arrival_city,
  ].some(value => String(value || '').toLowerCase().includes(q))
}

const STATUS_LABELS = {
  scheduled: { label: 'Đã lên lịch', cls: 'badge-info' },
  delayed:   { label: 'Trễ giờ',     cls: 'badge-warning' },
  cancelled: { label: 'Đã huỷ',      cls: 'badge-danger' },
  completed: { label: 'Hoàn thành',  cls: 'badge-success' },
}
const FLIGHT_STATUSES = ['scheduled', 'delayed', 'cancelled', 'completed']

// Extract date & time directly from string to avoid UTC→local timezone shift
const formatRawDateTime = (iso) => {
  if (!iso) return '—'
  const s = String(iso)
  // Match YYYY-MM-DD and HH:MM
  const dateMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  const timeMatch = s.match(/[T ](\d{2}):(\d{2})/)
  if (!dateMatch) return s
  const [, y, m, d] = dateMatch
  const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : ''
  return time ? `${d}/${m}/${y} ${time}` : `${d}/${m}/${y}`
}

const emptyFlight = {
  flight_number: '', airline_id: '', departure_airport_id: '', arrival_airport_id: '',
  departure_time: '', arrival_time: '', duration_minutes: '',
  seats: [{ class: 'economy', total_seats: '', base_price: '' }]
}

export default function FlightsPage() {
  const [flights, setFlights]       = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1, page: 1 })
  const [page, setPage]             = useState(1)
  const [limit]                     = useState(15)
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showHidden, setShowHidden] = useState(true)   // admin xem cả vé ẩn
  const [modal, setModal]           = useState(null)
  const [editData, setEditData]     = useState(null)
  const [form, setForm]             = useState(emptyFlight)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [airports, setAirports]     = useState([])
  const [airlines, setAirlines]     = useState([])
  const requestIdRef                = useRef(0)
  const debouncedSearch             = useDebouncedValue(search)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    const keyword = debouncedSearch.trim()
    const searching = keyword.length > 0

    setLoading(true)
    getFlights({
      page: searching ? 1 : page,
      limit: searching ? SEARCH_FETCH_LIMIT : limit,
      status:        filterStatus || undefined,
      show_hidden:   showHidden ? true : undefined,
    })
      .then(r => {
        if (requestId !== requestIdRef.current) return
        const d = r.data
        const items = d.data || []

        if (searching) {
          const filtered = items.filter(item => matchesFlightSearch(item, keyword))
          const total = filtered.length
          const totalPages = Math.max(1, Math.ceil(total / limit))
          const safePage = Math.min(page, totalPages)

          setFlights(filtered.slice((safePage - 1) * limit, safePage * limit))
          setPagination({ total, total_pages: totalPages, page: safePage })

          if (safePage !== page) setPage(safePage)
          return
        }

        setFlights(items)
        setPagination(d.pagination || { total: 0, total_pages: 1, page: 1 })
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false)
      })
  }, [page, limit, debouncedSearch, filterStatus, showHidden])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getAirports({ limit: 200 }).then(r => setAirports(r.data.data || [])).catch(() => {})
    getAirlines({ limit: 100 }).then(r => setAirlines(r.data.data || [])).catch(() => {})
  }, [])

  const openCreate = () => { setForm(emptyFlight); setError(''); setModal('create'); setEditData(null) }
  const openEdit = (f) => {
    setEditData(f)
    setForm({
      flight_number:        f.flight_number,
      airline_id:           f.airline_id,
      departure_airport_id: f.departure_airport_id,
      arrival_airport_id:   f.arrival_airport_id,
      departure_time:       f.departure_time?.replace(' ', 'T').slice(0, 16) || '',
      arrival_time:         f.arrival_time?.replace(' ', 'T').slice(0, 16) || '',
      duration_minutes:     f.duration_minutes,
      seats: f.seats || [{ class: 'economy', total_seats: '', base_price: '' }],
    })
    setError('')
    setModal('edit')
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (modal === 'create') await createFlight(form)
      else await updateFlight(editData.id, form)
      setModal(null); load()
    } catch (e) { setError(e.response?.data?.error || 'Lỗi khi lưu') }
    finally { setSaving(false) }
  }

  const handleStatus = async (id, status) => {
    try { await updateFlightStatus(id, status); load() }
    catch (e) { alert(e.response?.data?.error || 'Lỗi') }
  }

  const handleVisibility = async (id) => {
    try { await toggleFlightVisibility(id); load() }
    catch (e) { alert(e.response?.data?.error || 'Lỗi') }
  }

  const setField    = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setSeatField = (i, k, v) => setForm(p => ({ ...p, seats: p.seats.map((s, idx) => idx === i ? { ...s, [k]: v } : s) }))
  const addSeat     = () => setForm(p => ({ ...p, seats: [...p.seats, { class: 'business', total_seats: '', base_price: '' }] }))
  const removeSeat  = (i) => setForm(p => ({ ...p, seats: p.seats.filter((_, idx) => idx !== i) }))

  const { total, total_pages } = pagination

  // Build page buttons (max 7 around current)
  const pageButtons = () => {
    if (total_pages <= 7) return Array.from({ length: total_pages }, (_, i) => i + 1)
    const start = Math.max(1, Math.min(page - 3, total_pages - 6))
    return Array.from({ length: Math.min(7, total_pages) }, (_, i) => start + i)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">✈️ Quản lý chuyến bay</div>
          <div className="page-subtitle">{total} chuyến bay trong hệ thống</div>
        </div>
        <div className="header-right">
          <button className="btn btn-primary" onClick={openCreate}>+ Thêm chuyến bay</button>
        </div>
      </div>

      <div className="page-content">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              placeholder="Tìm số hiệu bay..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <select className="filter-select" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
            <option value="">Tất cả trạng thái</option>
            {FLIGHT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]?.label}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={showHidden} onChange={e => { setShowHidden(e.target.checked); setPage(1) }} />
            Hiện cả vé ẩn
          </label>
          <select className="filter-select" value={limit} style={{ width: 80 }} onChange={() => {}}>
            <option value={15}>15/trang</option>
          </select>
          <button className="btn btn-secondary btn-sm ml-auto" onClick={load}>↺ Làm mới</button>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : flights.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">✈️</div><div className="empty-text">Không tìm thấy chuyến bay</div></div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Số hiệu</th>
                    <th>Hãng</th>
                    <th>Tuyến đường</th>
                    <th>Khởi hành</th>
                    <th>Đến nơi</th>
                    <th>Thời gian</th>
                    <th>Trạng thái</th>
                    <th>Hiển thị</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {flights.map(f => (
                    <tr key={f.id}>
                      <td><span className="td-mono">{f.flight_number}</span></td>
                      <td style={{ fontSize: 13 }}>{f.airline_name || f.airline_code || '—'}</td>
                      <td>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>
                          {f.departure_code || f.dep_code || '?'} → {f.arrival_code || f.arr_code || '?'}
                        </span>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {f.from_city || f.departure_city || ''} → {f.to_city || f.arrival_city || ''}
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {f.departure_time ? formatRawDateTime(f.departure_time) : '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {f.arrival_time ? formatRawDateTime(f.arrival_time) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {f.duration_minutes ? `${Math.floor(f.duration_minutes/60)}h${f.duration_minutes%60 ? f.duration_minutes%60+'m' : ''}` : '—'}
                      </td>
                      <td>
                        <select
                          className="filter-select"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          value={f.status}
                          onChange={e => handleStatus(f.id, e.target.value)}
                        >
                          {FLIGHT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]?.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${f.is_active !== false ? 'badge-success' : 'badge-danger'}`}>
                          {f.is_active !== false ? '👁 Hiện' : '🚫 Ẩn'}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(f)}>✏️</button>
                          <button
                            className="btn btn-sm"
                            style={{
                              background: f.is_active !== false ? 'var(--warning-bg)' : 'var(--success-bg)',
                              color:      f.is_active !== false ? 'var(--warning)' : 'var(--success)',
                              border: '1px solid currentColor',
                            }}
                            onClick={() => handleVisibility(f.id)}
                          >
                            {f.is_active !== false ? '🚫' : '👁'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pagination">
              <div className="pagination-info">
                Trang {page} / {total_pages} &nbsp;·&nbsp; Tổng {total} chuyến bay
              </div>
              <div className="pagination-btns">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                {pageButtons().map(p => (
                  <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="page-btn" disabled={page >= total_pages} onClick={() => setPage(p => p + 1)}>›</button>
                <button className="page-btn" disabled={page >= total_pages} onClick={() => setPage(total_pages)}>»</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{modal === 'create' ? '+ Thêm chuyến bay' : '✏️ Cập nhật chuyến bay'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            {error && <div className="alert alert-error">⚠ {error}</div>}
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Số hiệu bay *</label>
                <input className="form-control" value={form.flight_number} onChange={e => setField('flight_number', e.target.value)} placeholder="VN123" />
              </div>
              <div className="form-group">
                <label className="form-label">Hãng bay *</label>
                <select className="form-control" value={form.airline_id} onChange={e => setField('airline_id', e.target.value)}>
                  <option value="">-- Chọn hãng --</option>
                  {airlines.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Sân bay đi *</label>
                <select className="form-control" value={form.departure_airport_id} onChange={e => setField('departure_airport_id', e.target.value)}>
                  <option value="">-- Chọn sân bay --</option>
                  {airports.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Sân bay đến *</label>
                <select className="form-control" value={form.arrival_airport_id} onChange={e => setField('arrival_airport_id', e.target.value)}>
                  <option value="">-- Chọn sân bay --</option>
                  {airports.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Giờ khởi hành *</label>
                <input className="form-control" type="datetime-local" value={form.departure_time} onChange={e => setField('departure_time', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Giờ đến *</label>
                <input className="form-control" type="datetime-local" value={form.arrival_time} onChange={e => setField('arrival_time', e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">Thời gian bay (phút) *</label>
                <input className="form-control" type="number" value={form.duration_minutes} onChange={e => setField('duration_minutes', e.target.value)} placeholder="90" />
              </div>
              <div className="form-group full">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label className="form-label">Hạng ghế & Giá vé</label>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={addSeat}>+ Thêm hạng</button>
                </div>
                {form.seats.map((s, i) => (
                  <div className="seat-row" key={i}>
                    <div className="seat-row-header">
                      <span>Hạng ghế {i + 1}</span>
                      {form.seats.length > 1 && <button className="btn btn-danger btn-sm" type="button" onClick={() => removeSeat(i)}>✕</button>}
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Hạng</label>
                        <select className="form-control" value={s.class} onChange={e => setSeatField(i, 'class', e.target.value)}>
                          <option value="economy">Economy</option>
                          <option value="business">Business</option>
                          <option value="first">First Class</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Số ghế</label>
                        <input className="form-control" type="number" value={s.total_seats} onChange={e => setSeatField(i, 'total_seats', e.target.value)} placeholder="180" />
                      </div>
                      <div className="form-group full">
                        <label className="form-label">Giá cơ bản (VNĐ)</label>
                        <input className="form-control" type="number" value={s.base_price} onChange={e => setSeatField(i, 'base_price', e.target.value)} placeholder="1500000" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="form-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '⏳ Đang lưu...' : '💾 Lưu'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
