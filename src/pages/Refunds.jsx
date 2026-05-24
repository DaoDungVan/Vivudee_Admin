import { useState, useEffect, useCallback, useRef } from 'react'
import { getAdminRefunds, approveRefund, completeRefund, rejectRefund } from '../api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { LuCheck, LuX, LuRefreshCw, LuChevronLeft, LuChevronRight, LuBanknote, LuSearch } from 'react-icons/lu'

const STATUS_BADGE = {
  pending:    'badge-warning',
  approved:   'badge-info',
  processing: 'badge-info',
  rejected:   'badge-danger',
  completed:  'badge-success',
  cancelled:  'badge-muted',
  failed:     'badge-danger',
}
const STATUS_LABEL = {
  pending:    'Chờ xử lý',
  approved:   'Đã duyệt',
  processing: 'Đang xử lý',
  rejected:   'Từ chối',
  completed:  'Hoàn tiền xong',
  cancelled:  'Đã huỷ',
  failed:     'Thất bại',
}

const REFUND_STATUSES = ['pending', 'approved', 'processing', 'completed', 'rejected', 'cancelled', 'failed']

const fmtCurrency = (n) => {
  if (n == null || n === '') return '—'
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(n)) + ' VND'
}

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('vi-VN') : '—'

const SEARCH_FETCH_LIMIT = 500

const matchesSearch = (r, kw) => {
  const q = kw.toLowerCase()
  return [r.refund_code, r.booking_code, r.user_email, r.user_name]
    .some(v => String(v || '').toLowerCase().includes(q))
}

export default function RefundsPage() {
  const [data, setData]           = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 })
  const [page, setPage]           = useState(1)
  const limit = 15
  const [loading, setLoading]     = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch]       = useState('')
  const [actionLoading, setActionLoading] = useState(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [confirmModal, setConfirmModal] = useState(null)
  const [error, setError]         = useState('')
  const requestIdRef              = useRef(0)
  const debouncedSearch           = useDebouncedValue(search)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    const keyword = debouncedSearch.trim()
    const searching = keyword.length > 0
    setLoading(true)
    getAdminRefunds({
      page: searching ? 1 : page,
      limit: searching ? SEARCH_FETCH_LIMIT : limit,
      status: filterStatus || undefined,
    })
      .then(r => {
        if (requestId !== requestIdRef.current) return
        const d = r.data
        const items = d.data || (Array.isArray(d) ? d : [])

        if (searching) {
          const filtered = items.filter(i => matchesSearch(i, keyword))
          const total = filtered.length
          const totalPages = Math.max(1, Math.ceil(total / limit))
          const safePage = Math.min(page, totalPages)
          setData(filtered.slice((safePage - 1) * limit, safePage * limit))
          setPagination({ total, total_pages: totalPages })
          if (safePage !== page) setPage(safePage)
          return
        }

        setData(items)
        setPagination(d.pagination || { total: 0, total_pages: 1 })
      })
      .catch(() => setData([]))
      .finally(() => { if (requestId === requestIdRef.current) setLoading(false) })
  }, [page, limit, filterStatus, debouncedSearch])

  useEffect(() => { load() }, [load])

  const handleApprove = (code) => {
    setConfirmModal({ code, action: 'approve', title: 'Duyệt hoàn tiền', message: `Xác nhận duyệt yêu cầu hoàn tiền`, btnLabel: 'Duyệt', btnClass: 'btn-success' })
  }

  const handleComplete = (code) => {
    setConfirmModal({ code, action: 'complete', title: 'Xác nhận hoàn tiền', message: `Tiền sẽ được hoàn trả cho khách hàng. Hành động này không thể hoàn tác.`, btnLabel: 'Xác nhận hoàn tiền', btnClass: 'btn-primary' })
  }

  const handleConfirmSubmit = async () => {
    if (!confirmModal) return
    const { code, action } = confirmModal
    setActionLoading(code + '_' + action)
    setError('')
    setConfirmModal(null)
    try {
      if (action === 'approve') await approveRefund(code)
      else await completeRefund(code)
      load()
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || 'Lỗi xử lý')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) { setError('Vui lòng nhập lý do từ chối'); return }
    setActionLoading(rejectModal + '_reject')
    setError('')
    try {
      await rejectRefund(rejectModal, rejectReason.trim())
      setRejectModal(null)
      setRejectReason('')
      load()
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || 'Lỗi khi từ chối')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Yêu cầu hoàn tiền</div>
          <div className="page-subtitle">Quản lý và xử lý các yêu cầu hoàn vé của khách hàng</div>
        </div>
      </div>

      <div className="page-content">

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError('')} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', display:'inline-flex', alignItems:'center' }}><LuX size={15}/></button>
        </div>
      )}

      {/* Filters */}
      <div className="toolbar">
        <div className="search-box">
          <span className="search-icon"><LuSearch size={16}/></span>
          <input placeholder="Tìm mã hoàn vé, mã đặt vé, email..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <div className="tabs" style={{ margin: 0 }}>
          <div className={`tab${filterStatus === '' ? ' active' : ''}`} onClick={() => { setFilterStatus(''); setPage(1) }}>Tất cả</div>
          {REFUND_STATUSES.map(s => (
            <div key={s} className={`tab${filterStatus === s ? ' active' : ''}`} onClick={() => { setFilterStatus(s); setPage(1) }}>{STATUS_LABEL[s]}</div>
          ))}
        </div>
        <button className="btn btn-secondary btn-sm ml-auto" style={{ display:'flex', alignItems:'center', gap:5 }} onClick={load} disabled={loading}>
          {loading ? '...' : <><LuRefreshCw size={14}/> Làm mới</>}
        </button>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mã hoàn vé</th>
              <th>Mã đặt vé</th>
              <th>Khách hàng</th>
              <th>Loại hoàn</th>
              <th>Số tiền hoàn</th>
              <th>Lý do</th>
              <th>Ngày yêu cầu</th>
              <th>Trạng thái</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>Đang tải...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Không có yêu cầu hoàn tiền</td></tr>
            ) : data.map(r => (
              <tr key={r.refund_code || r.id}>
                <td><code style={{ fontSize: 12 }}>{r.refund_code}</code></td>
                <td><code style={{ fontSize: 12 }}>{r.booking_code}</code></td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.user_name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.user_email}</div>
                </td>
                <td style={{ fontSize: 12 }}>{r.refund_type || '—'}</td>
                <td style={{ fontWeight: 700, color: '#16a34a' }}>{fmtCurrency(r.refund_amount)}</td>
                <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>
                  {r.reason || '—'}
                </td>
                <td style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[r.status?.toLowerCase()] || 'badge-muted'}`}>
                    {STATUS_LABEL[r.status?.toLowerCase()] || r.status}
                  </span>
                </td>
                <td>
                  {r.status?.toLowerCase() === 'pending' ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-success btn-sm"
                        disabled={!!actionLoading}
                        onClick={() => handleApprove(r.refund_code || r.id)}
                      >
                        {actionLoading === (r.refund_code || r.id) + '_approve' ? '...' : <><LuCheck size={13}/> Duyệt</>}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={!!actionLoading}
                        onClick={() => { setRejectModal(r.refund_code || r.id); setRejectReason(''); setError('') }}
                      >
                        <LuX size={13}/> Từ chối
                      </button>
                    </div>
                  ) : r.status?.toLowerCase() === 'approved' ? (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!!actionLoading}
                      onClick={() => handleComplete(r.refund_code || r.id)}
                    >
                      {actionLoading === (r.refund_code || r.id) + '_complete' ? '...' : <><LuBanknote size={13}/> Chấp nhận hoàn tiền</>}
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.total_pages >= 1 && (
        <div className="pagination">
          <div className="pagination-info">Trang {page} / {pagination.total_pages} · Tổng {pagination.total} yêu cầu</div>
          <div className="pagination-btns">
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
            {Array.from({ length: Math.min(7, pagination.total_pages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 3, pagination.total_pages - 6))
              return start + i
            }).map(p => (
              <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="page-btn" disabled={page >= pagination.total_pages} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="page-btn" disabled={page >= pagination.total_pages} onClick={() => setPage(pagination.total_pages)}>»</button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setRejectModal(null); setError('') } }}>
          <div className="modal-box" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Từ chối hoàn tiền</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Mã hoàn vé: <strong>{rejectModal}</strong>
            </p>
            {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
            <label className="form-label">Lý do từ chối <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea
              autoFocus
              className="form-control"
              rows={3}
              placeholder="Nhập lý do từ chối..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', pointerEvents: 'auto' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setRejectModal(null); setError('') }}>Huỷ</button>
              <button className="btn btn-danger" onClick={handleRejectSubmit} disabled={!!actionLoading}>
                {actionLoading?.includes('_reject') ? 'Đang xử lý...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal (approve / complete) */}
      {confirmModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmModal(null) }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">{confirmModal.title}</div>
              <button className="modal-close" onClick={() => setConfirmModal(null)}><LuX size={18}/></button>
            </div>
            <div style={{ padding: '4px 0 20px', fontSize: 13, color: 'var(--text-secondary)' }}>
              <div style={{ marginBottom: 8 }}>Mã hoàn vé: <strong style={{ color: 'var(--text-primary)' }}>{confirmModal.code}</strong></div>
              <div>{confirmModal.message}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>Huỷ</button>
              <button className={`btn ${confirmModal.btnClass}`} onClick={handleConfirmSubmit}>
                <LuCheck size={14} style={{ marginRight: 4 }}/>{confirmModal.btnLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </>
  )
}
