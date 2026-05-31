import { useState, useEffect, useCallback, useRef } from 'react'
import { getBookings, getBookingById, updateBookingStatus } from '../api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { LuTicket, LuSearch, LuRefreshCw, LuEye, LuX, LuUser, LuChevronRight } from 'react-icons/lu'

const SEARCH_FETCH_LIMIT = 500

const matchesBookingSearch = (booking, keyword) => {
  const q = keyword.toLowerCase()
  return [
    booking.id,
    booking.booking_code,
    booking.contact_name,
    booking.contact_email,
    booking.contact_phone,
    booking.outbound_flight,
    booking.from_code,
    booking.to_code,
    booking.from_city,
    booking.to_city,
  ].some(value => String(value || '').toLowerCase().includes(q))
}

const BOOKING_STATUSES = ['pending', 'confirmed', 'refund_pending', 'refunded', 'cancelled', 'expired']
const STATUS_BADGE  = { pending: 'badge-warning', confirmed: 'badge-success', cancelled: 'badge-danger', expired: 'badge-muted', refund_pending: 'badge-info', refunded: 'badge-info' }
const STATUS_LABEL  = { pending: 'Chờ thanh toán', confirmed: 'Đã xác nhận', cancelled: 'Đã huỷ', expired: 'Hết hạn', refund_pending: 'Chờ hoàn tiền', refunded: 'Hoàn tiền xong' }

const fmtCurrency = (n) => {
  if (n == null || n === '') return '—'
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(n)) + ' VND'
}

export default function BookingsPage() {
  const [data, setData]             = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 })
  const [page, setPage]             = useState(1)
  const [limit]                     = useState(15)
  const [loading, setLoading]       = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch]         = useState('')
  const [detail, setDetail]         = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const requestIdRef                = useRef(0)
  const debouncedSearch             = useDebouncedValue(search)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    const keyword = debouncedSearch.trim()
    const searching = keyword.length > 0

    setLoading(true)
    getBookings({
      page: searching ? 1 : page,
      limit: searching ? SEARCH_FETCH_LIMIT : limit,
      status: filterStatus || undefined,
    })
      .then(r => {
        if (requestId !== requestIdRef.current) return
        const d = r.data
        const items = d.data || []

        if (searching) {
          const filtered = items.filter(item => matchesBookingSearch(item, keyword))
          const total = filtered.length
          const totalPages = Math.max(1, Math.ceil(total / limit))
          const safePage = Math.min(page, totalPages)

          setData(filtered.slice((safePage - 1) * limit, safePage * limit))
          setPagination({ total, total_pages: totalPages, page: safePage })

          if (safePage !== page) setPage(safePage)
          return
        }

        setData(items)
        setPagination(d.pagination || { total: 0, total_pages: 1 })
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false)
      })
  }, [page, limit, filterStatus, debouncedSearch])

  useEffect(() => { load() }, [load])

  const openDetail = async (b) => {
    setDetail(b); setDetailLoading(true)
    try { const r = await getBookingById(b.id); setDetail(r.data.data || r.data) }
    catch { setDetail(b) }
    finally { setDetailLoading(false) }
  }

  const handleStatus = async (id, status) => {
    try { await updateBookingStatus(id, status); load(); if (detail?.id === id) setDetail(p => ({ ...p, status })) }
    catch (e) { alert(e.response?.data?.error || 'Lỗi') }
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
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}><LuTicket size={18}/> Quản lý đặt vé</div>
          <div className="page-subtitle">{total} lượt đặt vé trong hệ thống</div>
        </div>
      </div>

      <div className="page-content">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon"><LuSearch size={16}/></span>
            <input placeholder="Tìm mã booking, email, tên..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <div className="tabs" style={{ margin: 0 }}>
            <div className={`tab${filterStatus===''?' active':''}`} onClick={() => { setFilterStatus(''); setPage(1) }}>Tất cả</div>
            {BOOKING_STATUSES.map(s => (
              <div key={s} className={`tab${filterStatus===s?' active':''}`} onClick={() => { setFilterStatus(s); setPage(1) }}>{STATUS_LABEL[s]}</div>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm ml-auto" style={{ display:'flex', alignItems:'center', gap:5 }} onClick={load}><LuRefreshCw size={14}/> Làm mới</button>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : data.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><LuTicket size={36}/></div><div className="empty-text">Không tìm thấy đặt vé</div></div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Mã booking</th><th>Liên hệ</th><th>Chuyến bay</th>
                    <th>Hành khách</th><th>Tổng tiền</th><th>Trạng thái</th>
                    <th>Ngày đặt</th><th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(b => {
                    // Fields từ backend: booking_code, contact_name, contact_email, outbound_flight,
                    // from_code, to_code, from_city, to_city, total_adults, total_children, total_infants,
                    // total_price, status, created_at, departure_time
                    const paxCount = (Number(b.total_adults)||0) + (Number(b.total_children)||0) + (Number(b.total_infants)||0)
                    return (
                      <tr key={b.id}>
                        <td><span className="td-mono">{b.booking_code || `#${b.id}`}</span></td>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{b.contact_name || '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.contact_email || ''}</div>
                        </td>
                        <td>
                          <span className="td-mono">{b.outbound_flight || '—'}</span>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {b.from_code} → {b.to_code}
                            {b.from_city && <span style={{ color: 'var(--text-muted)' }}> ({b.from_city} → {b.to_city})</span>}
                          </div>
                          {b.departure_time && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {new Date(b.departure_time).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' })}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-info">{paxCount} khách</span>
                          {b.trip_type && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{b.trip_type}</div>}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--success)' }}>{fmtCurrency(b.final_amount ?? b.grand_total ?? b.total_price)}</td>
                        <td><span className={`badge ${STATUS_BADGE[b.status]||'badge-muted'}`}>{STATUS_LABEL[b.status]||b.status}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {b.created_at ? new Date(b.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </td>
                        <td>
                          <button className="btn btn-secondary btn-sm" style={{ display:'flex', alignItems:'center', gap:4 }} onClick={() => openDetail(b)}><LuEye size={13}/> Chi tiết</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <div className="pagination-info">Trang {page} / {total_pages} · Tổng {total} lượt đặt vé</div>
              <div className="pagination-btns">
                <button className="page-btn" disabled={page===1} onClick={() => setPage(1)}>«</button>
                <button className="page-btn" disabled={page===1} onClick={() => setPage(p=>p-1)}>‹</button>
                {pageButtons().map(p => <button key={p} className={`page-btn${p===page?' active':''}`} onClick={() => setPage(p)}>{p}</button>)}
                <button className="page-btn" disabled={page>=total_pages} onClick={() => setPage(p=>p+1)}>›</button>
                <button className="page-btn" disabled={page>=total_pages} onClick={() => setPage(total_pages)}>»</button>
              </div>
            </div>
          </>
        )}
      </div>

      {detail && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&setDetail(null)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display:'flex', alignItems:'center', gap:6 }}><LuTicket size={16}/> Chi tiết: {detail.booking_code || `#${detail.id}`}</div>
              <button className="modal-close" onClick={() => setDetail(null)}><LuX size={18}/></button>
            </div>
            {detailLoading ? <div className="loading-wrap"><div className="spinner" /></div> : (
              <>
                {/* Status actions */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                  {['confirmed','cancelled','expired'].filter(s => s !== detail.status).map(s => (
                    <button key={s} className={`btn btn-sm ${s==='cancelled'?'btn-danger':s==='confirmed'?'btn-success':'btn-secondary'}`}
                      style={{ display:'flex', alignItems:'center', gap:4 }}
                      onClick={() => handleStatus(detail.id, s)}><LuChevronRight size={14}/> {STATUS_LABEL[s]}</button>
                  ))}
                </div>

                <div className="detail-grid">
                  {[
                    ['Mã booking',    detail.booking_code || `#${detail.id}`],
                    ['Trạng thái',    STATUS_LABEL[detail.status] || detail.status],
                    ['Loại chuyến',  detail.trip_type || '—'],
                    ['Liên hệ',      detail.contact_name || '—'],
                    ['Email',         detail.contact_email || '—'],
                    ['SĐT',           detail.contact_phone || '—'],
                    ['Chuyến đi',    `${detail.outbound_flight || '—'} (${detail.from_code || ''}→${detail.to_code || ''})`],
                    ['Khởi hành',    detail.outbound_dep_time ? new Date(detail.outbound_dep_time).toLocaleString('vi-VN', { timeZone: 'UTC' }) : (detail.departure_time ? new Date(detail.departure_time).toLocaleString('vi-VN', { timeZone: 'UTC' }) : '—')],
                    ['Hãng bay',     detail.outbound_airline || '—'],
                    ['Người lớn',    detail.total_adults ?? '—'],
                    ['Trẻ em',        detail.total_children ?? '—'],
                    ['Em bé',         detail.total_infants ?? '—'],
                    ['Tổng tiền',    fmtCurrency(detail.final_amount ?? detail.grand_total ?? detail.total_price)],
                    ['Giữ đến',      detail.held_until ? new Date(detail.held_until).toLocaleString('vi-VN') : '—'],
                    ['Ngày đặt',     detail.created_at ? new Date(detail.created_at).toLocaleString('vi-VN') : '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="detail-row">
                      <span className="detail-row-label">{k}</span>
                      <span className="detail-row-value">{String(v)}</span>
                    </div>
                  ))}
                </div>

                {detail.passengers?.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14, display:'flex', alignItems:'center', gap:6 }}><LuUser size={14}/> Hành khách</div>
                    <div className="table-wrapper">
                      <table>
                        <thead><tr><th>Họ tên</th><th>Loại</th><th>Chuyến</th><th>Số ghế</th></tr></thead>
                        <tbody>
                          {detail.passengers.map((p, i) => (
                            <tr key={i}>
                              <td>{p.full_name || p.last_name + ' ' + p.first_name || '—'}</td>
                              <td><span className="badge badge-info">{p.passenger_type || p.type || 'adult'}</span></td>
                              <td style={{ fontSize: 12 }}>{p.flight_type || '—'}</td>
                              <td><span className="td-mono">{p.seat_number || '—'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
