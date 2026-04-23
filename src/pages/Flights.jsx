import { useState, useEffect, useCallback, useRef } from 'react'
import { getFlights, createFlight, updateFlight, updateFlightStatus, toggleFlightVisibility, getAirports, getAirlines } from '../api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

const SEARCH_FETCH_LIMIT = 500
const SORT_OPTIONS = [
  { value: '', label: 'Sap xep khoi hanh' },
  { value: 'desc', label: 'Chuyen moi nhat' },
  { value: 'asc', label: 'Chuyen cu nhat' },
]
const SEAT_CLASS_ORDER = ['economy', 'business', 'first']
const SEAT_CLASS_LABELS = {
  economy: 'Economy',
  business: 'Business',
  first: 'First Class',
}
const BAGGAGE_PACKAGE_KGS = [5, 10, 20]
const SEAT_DEFAULTS = {
  economy: {
    baggage_included_kg: '23',
    carry_on_kg: '7',
    extra_baggage_options: { 0: '0', 5: '0', 10: '0', 20: '0' },
  },
  business: {
    baggage_included_kg: '32',
    carry_on_kg: '12',
    extra_baggage_options: { 0: '0', 5: '0', 10: '0', 20: '0' },
  },
  first: {
    baggage_included_kg: '40',
    carry_on_kg: '15',
    extra_baggage_options: { 0: '0', 5: '0', 10: '0', 20: '0' },
  },
}

const createSeat = (seatClass = 'economy') => ({
  class: seatClass,
  total_seats: '',
  base_price: '',
  ...SEAT_DEFAULTS[seatClass],
})

const normalizeBaggageOptions = (options, legacyExtraBaggagePrice = 0) => {
  const fallbackPricePerKg = Number(legacyExtraBaggagePrice || 0)

  return {
    0: '0',
    5: String(options?.[5] ?? options?.['5'] ?? (fallbackPricePerKg * 5)),
    10: String(options?.[10] ?? options?.['10'] ?? (fallbackPricePerKg * 10)),
    20: String(options?.[20] ?? options?.['20'] ?? (fallbackPricePerKg * 20)),
  }
}

const normalizeSeatForForm = (seat = {}) => {
  const seatClass = seat.class || 'economy'
  const defaults = SEAT_DEFAULTS[seatClass] || SEAT_DEFAULTS.economy

  return {
    class: seatClass,
    total_seats: seat.total_seats ?? '',
    base_price: seat.base_price ?? '',
    baggage_included_kg: seat.baggage_included_kg ?? defaults.baggage_included_kg,
    carry_on_kg: seat.carry_on_kg ?? defaults.carry_on_kg,
    extra_baggage_options: normalizeBaggageOptions(
      seat.extra_baggage_options ?? defaults.extra_baggage_options,
      seat.extra_baggage_price
    ),
  }
}

const buildSeatFormList = (seats = []) => {
  const seatMap = new Map((Array.isArray(seats) ? seats : []).map((seat) => [seat.class, seat]))
  return SEAT_CLASS_ORDER.map((seatClass) => normalizeSeatForForm(seatMap.get(seatClass) || createSeat(seatClass)))
}

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
  ].some((value) => String(value || '').toLowerCase().includes(q))
}

const getFlightDateValue = (value) => {
  if (!value) return Number.NaN
  const normalized = String(value).replace(' ', 'T')
  const time = new Date(normalized).getTime()
  return Number.isNaN(time) ? Number.NaN : time
}

const getFlightDateOnly = (value) => {
  if (!value) return ''
  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

const sortFlightsByDepartureTime = (items, sortDirection) => {
  return [...items].sort((a, b) => {
    const timeA = getFlightDateValue(a?.departure_time)
    const timeB = getFlightDateValue(b?.departure_time)
    const missingA = Number.isNaN(timeA)
    const missingB = Number.isNaN(timeB)

    if (missingA && missingB) return 0
    if (missingA) return 1
    if (missingB) return -1

    if (sortDirection === 'desc') return timeB - timeA
    return timeA - timeB
  })
}

const STATUS_LABELS = {
  scheduled: { label: 'Da len lich', cls: 'badge-info' },
  delayed: { label: 'Tre gio', cls: 'badge-warning' },
  cancelled: { label: 'Da huy', cls: 'badge-danger' },
  completed: { label: 'Hoan thanh', cls: 'badge-success' },
}
const FLIGHT_STATUSES = ['scheduled', 'delayed', 'cancelled', 'completed']

// Extract date & time directly from string to avoid UTC -> local timezone shift
const formatRawDateTime = (iso) => {
  if (!iso) return '—'
  const s = String(iso)
  const dateMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  const timeMatch = s.match(/[T ](\d{2}):(\d{2})/)
  if (!dateMatch) return s
  const [, y, m, d] = dateMatch
  const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : ''
  return time ? `${d}/${m}/${y} ${time}` : `${d}/${m}/${y}`
}

const createEmptyFlight = () => ({
  flight_number: '',
  airline_id: '',
  departure_airport_id: '',
  arrival_airport_id: '',
  departure_time: '',
  arrival_time: '',
  duration_minutes: '',
  seats: buildSeatFormList(),
})

const buildFlightPayload = (form) => ({
  flight_number: String(form.flight_number || '').trim(),
  airline_id: form.airline_id || '',
  departure_airport_id: form.departure_airport_id || '',
  arrival_airport_id: form.arrival_airport_id || '',
  departure_time: form.departure_time || '',
  arrival_time: form.arrival_time || '',
  duration_minutes: form.duration_minutes || '',
  seats: Array.isArray(form.seats)
    ? form.seats.map((seat) => ({
        class: seat.class,
        total_seats: seat.total_seats,
        base_price: seat.base_price,
        baggage_included_kg: seat.baggage_included_kg,
        carry_on_kg: seat.carry_on_kg,
        extra_baggage_options: {
          0: 0,
          5: Number(seat.extra_baggage_options?.[5] ?? seat.extra_baggage_options?.['5'] ?? 0),
          10: Number(seat.extra_baggage_options?.[10] ?? seat.extra_baggage_options?.['10'] ?? 0),
          20: Number(seat.extra_baggage_options?.[20] ?? seat.extra_baggage_options?.['20'] ?? 0),
        },
      }))
    : [],
})

export default function FlightsPage() {
  const [flights, setFlights] = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1, page: 1 })
  const [page, setPage] = useState(1)
  const [limit] = useState(15)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [departureDateFilter, setDepartureDateFilter] = useState('')
  const [sortDirection, setSortDirection] = useState('')
  const [showHidden, setShowHidden] = useState(true)
  const [modal, setModal] = useState(null)
  const [editData, setEditData] = useState(null)
  const [form, setForm] = useState(createEmptyFlight)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [airports, setAirports] = useState([])
  const [airlines, setAirlines] = useState([])
  const requestIdRef = useRef(0)
  const saveLockRef = useRef(false)
  const debouncedSearch = useDebouncedValue(search)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    const keyword = debouncedSearch.trim()
    const searching = keyword.length > 0
    const filteringByDepartureDate = Boolean(departureDateFilter)
    const sorting = Boolean(sortDirection)
    const useClientPipeline = searching || filteringByDepartureDate || sorting

    setLoading(true)
    getFlights({
      page: useClientPipeline ? 1 : page,
      limit: useClientPipeline ? SEARCH_FETCH_LIMIT : limit,
      status: filterStatus || undefined,
      show_hidden: showHidden ? true : undefined,
    })
      .then((r) => {
        if (requestId !== requestIdRef.current) return

        const d = r.data
        const items = d.data || []

        if (useClientPipeline) {
          let processedItems = items

          if (searching) {
            processedItems = processedItems.filter((item) => matchesFlightSearch(item, keyword))
          }

          if (filteringByDepartureDate) {
            processedItems = processedItems.filter((item) => getFlightDateOnly(item.departure_time) === departureDateFilter)
          }

          if (sorting) {
            processedItems = sortFlightsByDepartureTime(processedItems, sortDirection)
          }

          const total = processedItems.length
          const totalPages = Math.max(1, Math.ceil(total / limit))
          const safePage = Math.min(page, totalPages)

          setFlights(processedItems.slice((safePage - 1) * limit, safePage * limit))
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
  }, [page, limit, debouncedSearch, filterStatus, showHidden, departureDateFilter, sortDirection])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    getAirports({ limit: 200 }).then((r) => setAirports(r.data.data || [])).catch(() => {})
    getAirlines({ limit: 100 }).then((r) => setAirlines(r.data.data || [])).catch(() => {})
  }, [])

  const openCreate = () => {
    setForm(createEmptyFlight())
    setError('')
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
      seats: buildSeatFormList(flight.seats),
    })
    setError('')
    setModal('edit')
  }

  const handleSave = async () => {
    if (saveLockRef.current) return

    saveLockRef.current = true
    setSaving(true)
    setError('')

    const payload = buildFlightPayload(form)

    try {
      if (modal === 'create') await createFlight(payload)
      else await updateFlight(editData.id, payload)
      setModal(null)
      load()
    } catch (e) {
      const backendError = e.response?.data?.error || ''
      if (backendError.includes('flights_pkey')) {
        setError('Backend dang bi trung ID tu dong cua bang flights, khong phai trung so hieu bay.')
      } else {
        setError(backendError || 'Loi khi luu')
      }
    } finally {
      saveLockRef.current = false
      setSaving(false)
    }
  }

  const handleStatus = async (id, statusValue) => {
    try {
      await updateFlightStatus(id, statusValue)
      load()
    } catch (e) {
      alert(e.response?.data?.error || 'Loi')
    }
  }

  const handleVisibility = async (id) => {
    try {
      await toggleFlightVisibility(id)
      load()
    } catch (e) {
      alert(e.response?.data?.error || 'Loi')
    }
  }

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }))
  const setSeatField = (index, key, value) =>
    setForm((p) => ({
      ...p,
      seats: p.seats.map((seat, seatIndex) => (seatIndex === index ? { ...seat, [key]: value } : seat)),
    }))
  const setSeatBaggageOption = (index, kg, value) =>
    setForm((p) => ({
      ...p,
      seats: p.seats.map((seat, seatIndex) => (
        seatIndex === index
          ? {
              ...seat,
              extra_baggage_options: {
                ...seat.extra_baggage_options,
                [kg]: value,
              },
            }
          : seat
      )),
    }))

  const clearFilters = () => {
    setDepartureDateFilter('')
    setSortDirection('')
    setPage(1)
  }

  const { total, total_pages } = pagination

  const pageButtons = () => {
    if (total_pages <= 7) return Array.from({ length: total_pages }, (_, i) => i + 1)
    const start = Math.max(1, Math.min(page - 3, total_pages - 6))
    return Array.from({ length: Math.min(7, total_pages) }, (_, i) => start + i)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">✈️ Quan ly chuyen bay</div>
          <div className="page-subtitle">{total} chuyen bay trong he thong</div>
        </div>
        <div className="header-right">
          <button className="btn btn-primary" onClick={openCreate}>+ Them chuyen bay</button>
        </div>
      </div>

      <div className="page-content">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              placeholder="Tim so hieu bay..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <select className="filter-select" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}>
            <option value="">Tat ca trang thai</option>
            {FLIGHT_STATUSES.map((statusValue) => (
              <option key={statusValue} value={statusValue}>{STATUS_LABELS[statusValue]?.label}</option>
            ))}
          </select>
          <select className="filter-select" value={sortDirection} onChange={(e) => { setSortDirection(e.target.value); setPage(1) }}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            className="filter-select"
            type="date"
            value={departureDateFilter}
            onChange={(e) => { setDepartureDateFilter(e.target.value); setPage(1) }}
            title="Ngay khoi hanh"
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={showHidden} onChange={(e) => { setShowHidden(e.target.checked); setPage(1) }} />
            Hien ca ve an
          </label>
          <select className="filter-select" value={limit} style={{ width: 80 }} onChange={() => {}}>
            <option value={15}>15/trang</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Xoa loc</button>
          <button className="btn btn-secondary btn-sm ml-auto" onClick={load}>Lam moi</button>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : flights.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">✈️</div><div className="empty-text">Khong tim thay chuyen bay</div></div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>So hieu</th>
                    <th>Hang</th>
                    <th>Tuyen duong</th>
                    <th>Khoi hanh</th>
                    <th>Den noi</th>
                    <th>Thoi gian</th>
                    <th>Trang thai</th>
                    <th>Hien thi</th>
                    <th>Hanh dong</th>
                  </tr>
                </thead>
                <tbody>
                  {flights.map((flight) => (
                    <tr key={flight.id}>
                      <td><span className="td-mono">{flight.flight_number}</span></td>
                      <td style={{ fontSize: 13 }}>{flight.airline_name || flight.airline_code || '—'}</td>
                      <td>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>
                          {flight.departure_code || flight.dep_code || '?'} → {flight.arrival_code || flight.arr_code || '?'}
                        </span>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {flight.from_city || flight.departure_city || ''} → {flight.to_city || flight.arrival_city || ''}
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>{flight.departure_time ? formatRawDateTime(flight.departure_time) : '—'}</td>
                      <td style={{ fontSize: 12 }}>{flight.arrival_time ? formatRawDateTime(flight.arrival_time) : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {flight.duration_minutes ? `${Math.floor(flight.duration_minutes / 60)}h${flight.duration_minutes % 60 ? `${flight.duration_minutes % 60}m` : ''}` : '—'}
                      </td>
                      <td>
                        <select
                          className="filter-select"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          value={flight.status}
                          onChange={(e) => handleStatus(flight.id, e.target.value)}
                        >
                          {FLIGHT_STATUSES.map((statusValue) => (
                            <option key={statusValue} value={statusValue}>{STATUS_LABELS[statusValue]?.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${flight.is_active !== false ? 'badge-success' : 'badge-danger'}`}>
                          {flight.is_active !== false ? '👁 Hien' : '🚫 An'}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(flight)}>✏️</button>
                          <button
                            className="btn btn-sm"
                            style={{
                              background: flight.is_active !== false ? 'var(--warning-bg)' : 'var(--success-bg)',
                              color: flight.is_active !== false ? 'var(--warning)' : 'var(--success)',
                              border: '1px solid currentColor',
                            }}
                            onClick={() => handleVisibility(flight.id)}
                          >
                            {flight.is_active !== false ? '🚫' : '👁'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <div className="pagination-info">
                Trang {page} / {total_pages} · Tong {total} chuyen bay
              </div>
              <div className="pagination-btns">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                <button className="page-btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                {pageButtons().map((pageValue) => (
                  <button key={pageValue} className={`page-btn${pageValue === page ? ' active' : ''}`} onClick={() => setPage(pageValue)}>{pageValue}</button>
                ))}
                <button className="page-btn" disabled={page >= total_pages} onClick={() => setPage((p) => p + 1)}>›</button>
                <button className="page-btn" disabled={page >= total_pages} onClick={() => setPage(total_pages)}>»</button>
              </div>
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{modal === 'create' ? '+ Them chuyen bay' : '✏️ Cap nhat chuyen bay'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            {error && <div className="alert alert-error">⚠ {error}</div>}
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">So hieu bay *</label>
                <input className="form-control" value={form.flight_number} onChange={(e) => setField('flight_number', e.target.value)} placeholder="VN123" />
              </div>
              <div className="form-group">
                <label className="form-label">Hang bay *</label>
                <select className="form-control" value={form.airline_id} onChange={(e) => setField('airline_id', e.target.value)}>
                  <option value="">-- Chon hang --</option>
                  {airlines.map((airline) => <option key={airline.id} value={airline.id}>{airline.name} ({airline.code})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">San bay di *</label>
                <select className="form-control" value={form.departure_airport_id} onChange={(e) => setField('departure_airport_id', e.target.value)}>
                  <option value="">-- Chon san bay --</option>
                  {airports.map((airport) => <option key={airport.id} value={airport.id}>{airport.name} ({airport.code})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">San bay den *</label>
                <select className="form-control" value={form.arrival_airport_id} onChange={(e) => setField('arrival_airport_id', e.target.value)}>
                  <option value="">-- Chon san bay --</option>
                  {airports.map((airport) => <option key={airport.id} value={airport.id}>{airport.name} ({airport.code})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Gio khoi hanh *</label>
                <input className="form-control" type="datetime-local" value={form.departure_time} onChange={(e) => setField('departure_time', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Gio den *</label>
                <input className="form-control" type="datetime-local" value={form.arrival_time} onChange={(e) => setField('arrival_time', e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">Thoi gian bay (phut) *</label>
                <input className="form-control" type="number" value={form.duration_minutes} onChange={(e) => setField('duration_minutes', e.target.value)} placeholder="90" />
              </div>
              <div className="form-group full">
                <div style={{ marginBottom: 10 }}>
                  <label className="form-label">3 hang ghe co dinh va gia hanh ly theo goi</label>
                </div>
                {form.seats.map((seat, index) => (
                  <div className="seat-row" key={seat.class}>
                    <div className="seat-row-header">
                      <span>{SEAT_CLASS_LABELS[seat.class] || `Hang ghe ${index + 1}`}</span>
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">So ghe</label>
                        <input className="form-control" type="number" value={seat.total_seats} onChange={(e) => setSeatField(index, 'total_seats', e.target.value)} placeholder="180" />
                      </div>
                      <div className="form-group full">
                        <label className="form-label">Gia co ban (VND)</label>
                        <input className="form-control" type="number" value={seat.base_price} onChange={(e) => setSeatField(index, 'base_price', e.target.value)} placeholder="1500000" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Ky gui mien phi (kg)</label>
                        <input className="form-control" type="number" value={seat.baggage_included_kg} onChange={(e) => setSeatField(index, 'baggage_included_kg', e.target.value)} placeholder="23" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Xach tay (kg)</label>
                        <input className="form-control" type="number" value={seat.carry_on_kg} onChange={(e) => setSeatField(index, 'carry_on_kg', e.target.value)} placeholder="7" />
                      </div>
                      {BAGGAGE_PACKAGE_KGS.map((kg) => (
                        <div className="form-group" key={kg}>
                          <label className="form-label">Gia hanh ly {kg}kg (VND)</label>
                          <input
                            className="form-control"
                            type="number"
                            value={seat.extra_baggage_options?.[kg] ?? seat.extra_baggage_options?.[String(kg)] ?? '0'}
                            onChange={(e) => setSeatBaggageOption(index, kg, e.target.value)}
                            placeholder="0"
                          />
                        </div>
                      ))}
                      <div className="form-group full">
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          Khong mua them hanh ly = 0 VND. User chi duoc chon 4 muc: khong mua, 5kg, 10kg, 20kg.
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="form-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Huy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Dang luu...' : 'Luu'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
