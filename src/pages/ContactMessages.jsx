import { useState, useEffect, useCallback } from 'react'
import { getContactMessages, updateContactStatus, replyContactMessage } from '../api'
import { LuRefreshCw, LuChevronLeft, LuChevronRight, LuMail, LuMailOpen, LuReply, LuX, LuCheck } from 'react-icons/lu'

const STATUS_LABEL = { new: 'Mới', read: 'Đã đọc', replied: 'Đã trả lời' }
const STATUS_BADGE = { new: 'badge-warning', read: 'badge-info', replied: 'badge-success' }

// Giá trị của <select> chủ đề bên trang khách
const SUBJECT_LABEL = {
  booking: 'Đặt vé',
  payment: 'Thanh toán',
  cancel:  'Huỷ / hoàn vé',
  coupon:  'Mã giảm giá',
  other:   'Khác',
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export default function ContactMessagesPage() {
  const [data, setData]         = useState([])
  const [stats, setStats]       = useState({ total: 0, new: 0, replied: 0 })
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 })
  const [page, setPage]         = useState(1)
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const [replyModal, setReplyModal] = useState(null)  // message đang trả lời
  const [replyText, setReplyText]   = useState('')
  const [sending, setSending]       = useState(false)

  const limit = 15

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit }
      if (filterStatus) params.status = filterStatus
      const r = await getContactMessages(params)
      setData(r.data.data || [])
      setPagination(r.data.pagination || { total: 0, total_pages: 1 })
      setStats(r.data.stats || { total: 0, new: 0, replied: 0 })
      setError('')
    } catch (e) {
      setError(e.response?.data?.error || 'Không tải được danh sách tin nhắn')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [page, filterStatus])

  useEffect(() => { load() }, [load])

  const markRead = async (msg) => {
    // Chỉ đánh dấu tin 'new' — không ghi đè trạng thái 'replied'
    if (msg.status !== 'new') return
    try {
      await updateContactStatus(msg.id, 'read')
      setData(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'read' } : m))
      setStats(s => ({ ...s, new: Math.max(0, s.new - 1) }))
    } catch { /* không chặn thao tác đọc nếu lỗi */ }
  }

  const openReply = (msg) => {
    setReplyModal(msg)
    setReplyText('')
    markRead(msg)
  }

  const submitReply = async () => {
    if (!replyText.trim()) return
    setSending(true)
    setError('')
    try {
      await replyContactMessage(replyModal.id, replyText.trim())
      setReplyModal(null)
      setReplyText('')
      load()
    } catch (e) {
      setError(e.response?.data?.error || 'Không gửi được email trả lời')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Mail phản hồi</div>
          <div className="page-subtitle">
            Tin nhắn khách gửi từ trang Liên hệ — {stats.new} chưa đọc / {stats.total} tổng
          </div>
        </div>
      </div>

      <div className="page-content">

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            {error}
            <button onClick={() => setError('')} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
              <LuX size={15} />
            </button>
          </div>
        )}

        <div className="toolbar">
          <div className="tabs" style={{ margin: 0 }}>
            <div className={`tab${filterStatus === '' ? ' active' : ''}`} onClick={() => { setFilterStatus(''); setPage(1) }}>Tất cả</div>
            {['new', 'read', 'replied'].map(s => (
              <div key={s} className={`tab${filterStatus === s ? ' active' : ''}`} onClick={() => { setFilterStatus(s); setPage(1) }}>
                {STATUS_LABEL[s]}
              </div>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm ml-auto" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={load} disabled={loading}>
            {loading ? '...' : <><LuRefreshCw size={14} /> Làm mới</>}
          </button>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Người gửi</th>
                <th>Chủ đề</th>
                <th>Nội dung</th>
                <th>Ngày gửi</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>Đang tải...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Chưa có tin nhắn nào</td></tr>
              ) : data.map(m => (
                <tr key={m.id} style={m.status === 'new' ? { fontWeight: 600 } : undefined}>
                  <td style={{ color: m.status === 'new' ? '#d97706' : 'var(--text-muted)' }}>
                    {m.status === 'new' ? <LuMail size={16} /> : <LuMailOpen size={16} />}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.email}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{SUBJECT_LABEL[m.subject] || m.subject || '—'}</td>
                  <td style={{ fontSize: 12, maxWidth: 360 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.message}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(m.created_at)}</td>
                  <td><span className={`badge ${STATUS_BADGE[m.status]}`}>{STATUS_LABEL[m.status]}</span></td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      onClick={() => openReply(m)}
                    >
                      <LuReply size={13} /> {m.status === 'replied' ? 'Trả lời lại' : 'Trả lời'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.total_pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <LuChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Trang {page} / {pagination.total_pages} ({pagination.total} tin nhắn)
            </span>
            <button className="btn btn-secondary btn-sm" disabled={page >= pagination.total_pages} onClick={() => setPage(p => p + 1)}>
              <LuChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Modal trả lời */}
      {replyModal && (
        <div className="modal-overlay" onClick={() => !sending && setReplyModal(null)}>
          <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Trả lời {replyModal.name}</div>
              <button className="modal-close" onClick={() => !sending && setReplyModal(null)}><LuX size={18} /></button>
            </div>

            <div>
              <div style={{ background: 'rgba(100,130,160,0.08)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {replyModal.email} · {SUBJECT_LABEL[replyModal.subject] || replyModal.subject || 'Không có chủ đề'} · {fmtDate(replyModal.created_at)}
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{replyModal.message}</div>
              </div>

              {replyModal.reply_body && (
                <div style={{ borderLeft: '3px solid var(--border)', paddingLeft: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Đã trả lời {fmtDate(replyModal.replied_at)}:
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{replyModal.reply_body}</div>
                </div>
              )}

              <label className="form-label">Nội dung trả lời *</label>
              <textarea
                className="form-control"
                rows={7}
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                placeholder="Nhập nội dung phản hồi gửi tới khách..."
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
                autoFocus
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                Email sẽ được gửi tới <strong>{replyModal.email}</strong> kèm lại tin nhắn gốc.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setReplyModal(null)} disabled={sending}>Huỷ</button>
              <button
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={submitReply}
                disabled={sending || !replyText.trim()}
              >
                {sending ? 'Đang gửi...' : <><LuCheck size={14} /> Gửi email</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
