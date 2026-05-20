import { useState, useEffect, useCallback, useRef } from 'react'
import { getAdminRefunds, approveRefund, rejectRefund } from '../api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

const STATUS_BADGE = {
  pending:   'badge-warning',
  approved:  'badge-success',
  rejected:  'badge-danger',
  completed: 'badge-success',
  cancelled: 'badge-muted',
}
const STATUS_LABEL = {
  pending:   '⏳ Chờ xử lý',
  approved:  '✓ Đã duyệt',
  rejected:  '✕ Từ chối',
  completed: '✓ Hoàn tiền xong',
  cancelled: '— Đã huỷ',
}

const fmtCurrency = (n) =>
  n == null ? '—' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n))

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
        const filtered = searching ? items.filter(i => matchesSearch(i, keyword)) : items
        setData(filtered)
        setPagination({ total: d.total || filtered.length, total_pages: d.total_pages || 1 })
      })
      .catch(() => setData([]))
      .finally(() => { if (requestId === requestIdRef.current) setLoading(false) })
  }, [page, limit, filterStatus, debouncedSearch])

  useEffect(() => { load() }, [load])

  const handleApprove = async (code) => {
    if (!window.confirm(`Xác nhận duyệt hoàn tiền ${code}?`)) return
    setActionLoading(code + '_approve')
    setError('')
    try {
      await approveRefund(code)
      load()
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || 'Lỗi khi duyệt')
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
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">Yêu cầu hoàn tiền</h1>
        <p className="page-subtitle">Quản lý và xử lý các yêu cầu hoàn vé của khách hàng</p>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError('')} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="table-toolbar">
        <input
          className="form-control"
          placeholder="Tìm mã hoàn vé, mã đặt vé, email..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ maxWidth: 300 }}
        />
        <select
          className="form-control"
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          style={{ maxWidth: 180 }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ xử lý</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
          <option value="completed">Hoàn tiền xong</option>
          <option value="cancelled">Đã huỷ</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading ? '...' : '↻ Tải lại'}
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
                        onClick={() => handleApprove(r.refund_code)}
                      >
                        {actionLoading === r.refund_code + '_approve' ? '...' : '✓ Duyệt'}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={!!actionLoading}
                        onClick={() => { setRejectModal(r.refund_code); setRejectReason(''); setError('') }}
                      >
                        ✕ Từ chối
                      </button>
                    </div>
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
      {pagination.total_pages > 1 && (
        <div className="pagination">
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</button>
          <span style={{ padding: '0 12px', fontSize: 13 }}>Trang {page} / {pagination.total_pages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= pagination.total_pages} onClick={() => setPage(p => p + 1)}>Sau →</button>
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
    </div>
  )
}
