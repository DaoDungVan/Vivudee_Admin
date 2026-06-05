import { useState, useEffect, useCallback, useRef } from 'react'
import { getAdminDateChanges, approveDateChange, rejectDateChange } from '../api'
import { LuCheck, LuX, LuRefreshCw, LuChevronLeft, LuChevronRight, LuCalendarDays } from 'react-icons/lu'

const STATUS_BADGE = {
  pending:         'badge-warning',
  pending_otp:     'badge-muted',
  pending_payment: 'badge-warning',
  approved:        'badge-success',
  rejected:        'badge-danger',
  completed:       'badge-info',
  cancelled:       'badge-muted',
}
const STATUS_LABEL = {
  pending:         'Chờ duyệt',
  pending_otp:     'Chờ OTP',
  pending_payment: 'Chờ thanh toán',
  approved:        'Đã duyệt',
  rejected:        'Từ chối',
  completed:       'Hoàn thành',
  cancelled:       'Đã huỷ',
}

const ALL_STATUSES = ['pending', 'pending_otp', 'pending_payment', 'approved', 'rejected', 'completed', 'cancelled']

const fmtCurrency = (n) => {
  if (n == null || n === '') return '—'
  const v = Number(n)
  const sign = v > 0 ? '+' : ''
  return sign + new Intl.NumberFormat('vi-VN').format(v) + ' VND'
}

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' })
}

export default function DateChangesPage() {
  const [data, setData]         = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 })
  const [page, setPage]         = useState(1)
  const limit = 15
  const [loading, setLoading]   = useState(false)
  const [filterStatus, setFilterStatus] = useState('pending')
  const [actionLoading, setActionLoading] = useState(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [notesModal, setNotesModal] = useState(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [error, setError]       = useState('')
  const requestIdRef            = useRef(0)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError('')
    getAdminDateChanges({ status: filterStatus, page, limit })
      .then(res => {
        if (requestIdRef.current !== requestId) return
        const d = res.data?.data
        setData(Array.isArray(d?.data) ? d.data : [])
        if (d?.pagination) setPagination(d.pagination)
      })
      .catch(() => { if (requestIdRef.current === requestId) setError('Không thể tải dữ liệu') })
      .finally(() => { if (requestIdRef.current === requestId) setLoading(false) })
  }, [filterStatus, page])

  useEffect(() => { load() }, [load])

  const handleApprove = async (code) => {
    setNotesModal(code)
    setAdminNotes('')
  }

  const confirmApprove = async () => {
    const code = notesModal
    setNotesModal(null)
    setActionLoading(code)
    try {
      await approveDateChange(code, adminNotes)
      load()
    } catch (err) {
      setError(err?.response?.data?.error || 'Duyệt thất bại')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = (code) => {
    setRejectModal(code)
    setRejectReason('')
  }

  const confirmReject = async () => {
    if (!rejectReason.trim() || rejectReason.trim().length < 10) {
      setError('Lý do từ chối phải có ít nhất 10 ký tự')
      return
    }
    const code = rejectModal
    setRejectModal(null)
    setActionLoading(code)
    try {
      await rejectDateChange(code, rejectReason.trim())
      load()
    } catch (err) {
      setError(err?.response?.data?.error || 'Từ chối thất bại')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <LuCalendarDays size={22} />
          <h1 className="page-title">Quản lý đổi ngày bay</h1>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          <LuRefreshCw size={14} className={loading ? 'spin' : ''} /> Làm mới
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          {error}
          <button onClick={() => setError('')} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      {/* Filter */}
      <div className="filter-row" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${filterStatus === '' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setFilterStatus(''); setPage(1) }}
        >Tất cả</button>
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setFilterStatus(s); setPage(1) }}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mã yêu cầu</th>
              <th>Booking</th>
              <th>Khách hàng</th>
              <th>Chuyến cũ → Mới</th>
              <th>Chênh lệch</th>
              <th>Lý do</th>
              <th>Ngày tạo</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Đang tải...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Không có yêu cầu nào</td></tr>
            ) : data.map(r => (
              <tr key={r.request_code}>
                <td>
                  <code style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{r.request_code}</code>
                </td>
                <td style={{ fontSize: 12 }}>{r.booking_code}</td>
                <td style={{ fontSize: 12 }}>
                  <div>{r.user_name || r.contact_name || '—'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.contact_email}</div>
                </td>
                <td style={{ fontSize: 12 }}>
                  <div>{r.old_flight_number} <span style={{ color: 'var(--text-muted)' }}>→</span> {r.new_flight_number}</div>
                </td>
                <td style={{ fontSize: 12, fontWeight: 700, color: Number(r.price_difference) > 0 ? '#ef4444' : Number(r.price_difference) < 0 ? '#16a34a' : 'var(--text-muted)' }}>
                  {fmtCurrency(r.price_difference)}
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 180, whiteSpace: 'normal' }}>
                  {r.reason ? r.reason.slice(0, 80) + (r.reason.length > 80 ? '…' : '') : '—'}
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDateTime(r.created_at)}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[r.status] || 'badge-muted'}`}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                  {r.processed_by_name && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>bởi {r.processed_by_name}</div>
                  )}
                </td>
                <td>
                  {r.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-success btn-xs"
                        disabled={actionLoading === r.request_code}
                        onClick={() => handleApprove(r.request_code)}
                        title="Duyệt"
                      >
                        <LuCheck size={13} /> Duyệt
                      </button>
                      <button
                        className="btn btn-danger btn-xs"
                        disabled={actionLoading === r.request_code}
                        onClick={() => handleReject(r.request_code)}
                        title="Từ chối"
                      >
                        <LuX size={13} /> Từ chối
                      </button>
                    </div>
                  )}
                  {r.admin_notes && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      Ghi chú: {r.admin_notes}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="pagination" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, justifyContent: 'center' }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <LuChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Trang {page} / {pagination.total_pages} · {pagination.total} yêu cầu
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= pagination.total_pages} onClick={() => setPage(p => p + 1)}>
            <LuChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Approve notes modal */}
      {notesModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setNotesModal(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <h3 className="modal-title">Xác nhận duyệt yêu cầu</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Mã: <strong>{notesModal}</strong>
            </p>
            <label className="form-label">Ghi chú admin (không bắt buộc)</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Ghi chú thêm về quyết định duyệt..."
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setNotesModal(null)}>Huỷ</button>
              <button className="btn btn-success" onClick={confirmApprove}>
                <LuCheck size={14} /> Xác nhận duyệt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setRejectModal(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <h3 className="modal-title">Từ chối yêu cầu đổi ngày</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Mã: <strong>{rejectModal}</strong>
            </p>
            <label className="form-label">Lý do từ chối <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Nhập lý do từ chối (tối thiểu 10 ký tự)..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRejectModal(null)}>Huỷ</button>
              <button
                className="btn btn-danger"
                onClick={confirmReject}
                disabled={rejectReason.trim().length < 10}
              >
                <LuX size={14} /> Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
