import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getChatConversations,
  getChatConversationById,
  sendChatReply,
  updateChatConversationStatus,
} from '../api'
import { createSocketConnection } from '../socket'

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'open', label: 'Sẵn sàng hỗ trợ' },
  { value: 'pending_admin', label: 'Chờ admin' },
  { value: 'pending_user', label: 'Chờ user' },
  { value: 'resolved', label: 'Đã xử lý' },
]

const STATUS_LABELS = {
  open: 'Sẵn sàng hỗ trợ',
  pending_admin: 'Chờ admin',
  pending_user: 'Chờ user',
  resolved: 'Đã xử lý',
}

const emptyDetail = { conversation: null, messages: [] }

export default function ChatPage() {
  const [threads, setThreads] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [detail, setDetail] = useState(emptyDetail)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [reply, setReply] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const messagesRef = useRef(null)
  const activeIdRef = useRef(null)
  const detailRequestIdRef = useRef(0)
  const selectedConversationRef = useRef(null)

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const loadThreads = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingList(true)
    }

    try {
      const res = await getChatConversations({
        page: 1,
        limit: 50,
        search: search || undefined,
        status: status || undefined,
      })

      const nextThreads = res.data?.data || []
      setThreads(nextThreads)
      setError('')

      setActiveId(previousActiveId => {
        if (!previousActiveId && nextThreads[0]) {
          return nextThreads[0].id
        }

        if (previousActiveId && !nextThreads.find(item => item.id === previousActiveId)) {
          return nextThreads[0]?.id || null
        }

        return previousActiveId
      })
    } catch (err) {
      if (!silent) {
        setError(err.response?.data?.error || 'Không tải được danh sách hội thoại')
      }
    } finally {
      if (!silent) {
        setLoadingList(false)
      }
    }
  }, [search, status])

  const loadConversation = useCallback(async (conversationId, { silent = false } = {}) => {
    if (!conversationId) {
      selectedConversationRef.current = null
      setDetail(emptyDetail)
      setLoadingDetail(false)
      return
    }

    selectedConversationRef.current = conversationId
    const requestId = detailRequestIdRef.current + 1
    detailRequestIdRef.current = requestId

    if (!silent) {
      setLoadingDetail(true)
      setReply('')
      setDetail(previousDetail =>
        previousDetail.conversation?.id === conversationId ? previousDetail : emptyDetail
      )
    }

    try {
      const res = await getChatConversationById(conversationId)

      if (
        detailRequestIdRef.current !== requestId ||
        Number(selectedConversationRef.current) !== Number(conversationId)
      ) {
        return
      }

      setDetail(res.data?.data || emptyDetail)
      setError('')
    } catch (err) {
      if (!silent && detailRequestIdRef.current === requestId) {
        setError(err.response?.data?.error || 'Không tải được nội dung hội thoại')
      }
    } finally {
      if (!silent && detailRequestIdRef.current === requestId) {
        setLoadingDetail(false)
      }
    }
  }, [])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  useEffect(() => {
    loadConversation(activeId)
  }, [activeId, loadConversation])

  useEffect(() => {
    const token = localStorage.getItem('token')

    if (!token) {
      return undefined
    }

    const socket = createSocketConnection(token)

    const handleSupportUpdated = (payload = {}) => {
      loadThreads({ silent: true })

      const currentActiveId = activeIdRef.current
      if (!currentActiveId || Number(payload.conversationId) === Number(currentActiveId)) {
        loadConversation(currentActiveId || payload.conversationId, { silent: true })
      }
    }

    socket.on('admin:support_updated', handleSupportUpdated)

    return () => {
      socket.off('admin:support_updated', handleSupportUpdated)
      socket.disconnect()
    }
  }, [loadConversation, loadThreads])

  useEffect(() => {
    if (!messagesRef.current) {
      return
    }

    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [detail.messages])

  const handleSelectThread = (conversationId) => {
    if (!conversationId || Number(conversationId) === Number(activeIdRef.current)) {
      return
    }

    setActiveId(conversationId)
  }

  const handleSend = async () => {
    const message = reply.trim()
    if (!message || !activeId || sending) {
      return
    }

    const conversationId = activeId
    setSending(true)

    try {
      const res = await sendChatReply(conversationId, { message })

      if (Number(activeIdRef.current) === Number(conversationId)) {
        setDetail(res.data?.data || emptyDetail)
        setReply('')
      }

      await loadThreads({ silent: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Không gửi được phản hồi')
    } finally {
      setSending(false)
    }
  }

  const handleStatusChange = async (nextStatus) => {
    if (!activeId) {
      return
    }

    const conversationId = activeId

    try {
      const res = await updateChatConversationStatus(conversationId, nextStatus)

      if (Number(activeIdRef.current) === Number(conversationId)) {
        setDetail(res.data?.data || emptyDetail)
      }

      await loadThreads({ silent: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Không cập nhật được trạng thái')
    }
  }

  const handleReplyKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">💬 Hộp thư hỗ trợ</div>
          <div className="page-subtitle">User ở bên trái, chat box ở bên phải theo luồng support</div>
        </div>
      </div>

      <div className="page-content">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="chat-admin-layout">
          <aside className="chat-thread-panel">
            <div className="chat-thread-toolbar">
              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Tìm user theo tên, email..."
                />
              </div>
              <select className="filter-select" value={status} onChange={event => setStatus(event.target.value)}>
                {STATUS_OPTIONS.map(option => (
                  <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {loadingList ? (
              <div className="loading-wrap"><div className="spinner" /></div>
            ) : threads.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💬</div>
                <div className="empty-text">Chưa có hội thoại support nào</div>
              </div>
            ) : (
              <div className="chat-thread-list">
                {threads.map(thread => (
                  <button
                    key={thread.id}
                    type="button"
                    className={`chat-thread-item${thread.id === activeId ? ' active' : ''}`}
                    onClick={() => handleSelectThread(thread.id)}
                  >
                    <div className="chat-thread-head">
                      <strong>{thread.user?.full_name || thread.user?.email || `User #${thread.user?.id}`}</strong>
                      {thread.unread_count > 0 && <span className="chat-unread-badge">{thread.unread_count}</span>}
                    </div>
                    <div className="chat-thread-email">{thread.user?.email}</div>
                    <div className="chat-thread-preview">{thread.last_message_preview || 'Chưa có tin nhắn'}</div>
                    <div className="chat-thread-foot">
                      <span className={`badge ${thread.status === 'resolved' ? 'badge-success' : thread.status === 'pending_admin' ? 'badge-danger' : 'badge-info'}`}>
                        {STATUS_LABELS[thread.status] || thread.status}
                      </span>
                      <span>{thread.last_message_at ? new Date(thread.last_message_at).toLocaleString('vi-VN') : '—'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <section className="chat-detail-panel">
            {!activeId ? (
              <div className="empty-state">
                <div className="empty-icon">🗂️</div>
                <div className="empty-text">Chọn một user để xem cuộc trò chuyện</div>
              </div>
            ) : loadingDetail ? (
              <div className="loading-wrap"><div className="spinner" /></div>
            ) : (
              <>
                <div className="chat-detail-header">
                  <div>
                    <div className="chat-detail-title">
                      {detail.conversation?.user?.full_name || detail.conversation?.user?.email || 'Hội thoại support'}
                    </div>
                    <div className="chat-detail-subtitle">
                      {detail.conversation?.user?.email} {detail.conversation?.user?.phone ? `· ${detail.conversation.user.phone}` : ''}
                    </div>
                  </div>

                  <div className="chat-detail-actions">
                    <select
                      className="filter-select"
                      value={detail.conversation?.status || 'open'}
                      onChange={event => handleStatusChange(event.target.value)}
                    >
                      {STATUS_OPTIONS.filter(option => option.value).map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="chat-message-list" ref={messagesRef}>
                  {(detail.messages || []).map(message => (
                    <div
                      key={message.id}
                      className={`chat-message-row${message.sender_role === 'admin' ? ' mine' : ''}`}
                    >
                      <div className={`chat-message-bubble${message.sender_role === 'assistant' ? ' chat-ai-bubble' : ''}`}>
                        <div className="chat-message-meta">
                          <span>{message.sender_name || (message.sender_role === 'admin' ? 'Admin' : 'User')}</span>
                          <span>{new Date(message.created_at).toLocaleString('vi-VN')}</span>
                        </div>
                        <p>{message.content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="chat-composer">
                  <textarea
                    className="form-control"
                    rows={3}
                    value={reply}
                    onChange={event => setReply(event.target.value)}
                    onKeyDown={handleReplyKeyDown}
                    placeholder="Nhập phản hồi cho user..."
                  />
                  <button className="btn btn-primary" onClick={handleSend} disabled={sending || !reply.trim()}>
                    {sending ? 'Đang gửi...' : 'Gửi phản hồi'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
