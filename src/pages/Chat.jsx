import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getChatConversations,
  getChatConversationById,
  sendChatReply,
  updateChatConversationStatus,
} from '../api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { createSocketConnection } from '../socket'

const STATUS_OPTIONS = [
  { value: '', label: 'Tat ca trang thai' },
  { value: 'open', label: 'San sang ho tro' },
  { value: 'pending_admin', label: 'Cho admin' },
  { value: 'pending_user', label: 'Cho user' },
  { value: 'resolved', label: 'Da xu ly' },
]

const STATUS_LABELS = {
  open: 'San sang ho tro',
  pending_admin: 'Cho admin',
  pending_user: 'Cho user',
  resolved: 'Da xu ly',
}

const emptyDetail = { conversation: null, messages: [] }
const DETAIL_CACHE_TTL = 15000

const cloneDetail = (detail) => ({
  conversation: detail?.conversation ? { ...detail.conversation } : null,
  messages: Array.isArray(detail?.messages) ? [...detail.messages] : [],
})

const buildThreadPreview = (detail) => {
  const conversation = detail?.conversation || {}
  const messages = detail?.messages || []
  const lastMessage = messages[messages.length - 1]

  return {
    id: conversation.id,
    user: conversation.user,
    status: conversation.status,
    unread_count: conversation.unread_count ?? 0,
    last_message_preview: lastMessage?.content || conversation.last_message_preview || '',
    last_message_at: lastMessage?.created_at || conversation.last_message_at || null,
  }
}

const MESSAGE_COLLAPSE_CHAR_LIMIT = 280
const MESSAGE_COLLAPSE_LINE_LIMIT = 4

const shouldCollapseMessage = (content) => {
  const text = String(content || '')
  return text.length > MESSAGE_COLLAPSE_CHAR_LIMIT || text.split(/\r?\n/).length > MESSAGE_COLLAPSE_LINE_LIMIT
}

function ExpandableMessageText({ content }) {
  const [expanded, setExpanded] = useState(false)
  const text = String(content || '')
  const canCollapse = shouldCollapseMessage(text)

  return (
    <>
      <p className={`chat-message-text${canCollapse && !expanded ? ' collapsed' : ''}`}>{text}</p>
      {canCollapse && (
        <button
          type="button"
          className="chat-message-toggle"
          onClick={() => setExpanded((previous) => !previous)}
        >
          {expanded ? 'Thu gon' : 'Xem them'}
        </button>
      )}
    </>
  )
}

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
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)

  const debouncedSearch = useDebouncedValue(search, 300)
  const messagesRef = useRef(null)
  const activeIdRef = useRef(null)
  const shouldStickToBottomRef = useRef(true)
  const pendingScrollToLatestRef = useRef(false)
  const detailRequestIdRef = useRef(0)
  const threadRequestIdRef = useRef(0)
  const selectedConversationRef = useRef(null)
  const detailCacheRef = useRef(new Map())
  const detailLoadedAtRef = useRef(new Map())
  const threadsRefreshTimerRef = useRef(null)
  const detailRefreshTimerRef = useRef(null)
  const loadThreadsRef = useRef(null)
  const loadConversationRef = useRef(null)

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const scrollMessagesToBottom = useCallback((behavior = 'smooth') => {
    const element = messagesRef.current
    if (!element) return

    if (typeof element.scrollTo === 'function') {
      element.scrollTo({ top: element.scrollHeight, behavior })
      return
    }

    element.scrollTop = element.scrollHeight
  }, [])

  const handleMessagesScroll = useCallback(() => {
    const element = messagesRef.current
    if (!element) return

    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80
    shouldStickToBottomRef.current = isNearBottom
    setShowJumpToLatest(!isNearBottom && (detail.messages?.length || 0) > 0)
  }, [detail.messages])

  const syncThreadFromDetail = useCallback((nextDetail, { promote = false } = {}) => {
    const preview = buildThreadPreview(nextDetail)
    if (!preview.id) return

    setThreads((currentThreads) => {
      const nextThreads = [...currentThreads]
      const index = nextThreads.findIndex((item) => Number(item.id) === Number(preview.id))

      if (index >= 0) {
        nextThreads[index] = { ...nextThreads[index], ...preview }
        if (promote) {
          const [item] = nextThreads.splice(index, 1)
          nextThreads.unshift(item)
        }
        return nextThreads
      }

      return promote ? [preview, ...nextThreads] : nextThreads
    })
  }, [])

  const cacheConversationDetail = useCallback((conversationId, nextDetail) => {
    if (!conversationId) return

    detailCacheRef.current.set(Number(conversationId), cloneDetail(nextDetail))
    detailLoadedAtRef.current.set(Number(conversationId), Date.now())
  }, [])

  const loadThreads = useCallback(async ({ silent = false } = {}) => {
    const requestId = threadRequestIdRef.current + 1
    threadRequestIdRef.current = requestId

    if (!silent) {
      setLoadingList(true)
    }

    try {
      const res = await getChatConversations({
        page: 1,
        limit: 50,
        search: debouncedSearch.trim() || undefined,
        status: status || undefined,
      })

      if (threadRequestIdRef.current !== requestId) {
        return
      }

      const nextThreads = res.data?.data || []
      setThreads(nextThreads)
      setError('')

      setActiveId((previousActiveId) => {
        if (!previousActiveId && nextThreads[0]) {
          return nextThreads[0].id
        }

        if (previousActiveId && !nextThreads.find((item) => Number(item.id) === Number(previousActiveId))) {
          return nextThreads[0]?.id || null
        }

        return previousActiveId
      })
    } catch (err) {
      if (!silent) {
        setError(err.response?.data?.error || 'Khong tai duoc danh sach hoi thoai')
      }
    } finally {
      if (!silent && threadRequestIdRef.current === requestId) {
        setLoadingList(false)
      }
    }
  }, [debouncedSearch, status])
  loadThreadsRef.current = loadThreads

  const loadConversation = useCallback(async (conversationId, options = {}) => {
    const { silent = false, force = false } = options

    if (!conversationId) {
      selectedConversationRef.current = null
      setDetail(emptyDetail)
      setLoadingDetail(false)
      return
    }

    selectedConversationRef.current = conversationId
    const requestId = detailRequestIdRef.current + 1
    detailRequestIdRef.current = requestId

    const cacheKey = Number(conversationId)
    const cachedDetail = detailCacheRef.current.get(cacheKey)
    const loadedAt = detailLoadedAtRef.current.get(cacheKey) || 0
    const isFresh = Date.now() - loadedAt < DETAIL_CACHE_TTL

    if (!silent) {
      setReply('')
      if (cachedDetail) {
        setDetail(cloneDetail(cachedDetail))
        setLoadingDetail(false)
      } else {
        setLoadingDetail(true)
        setDetail((previousDetail) =>
          previousDetail.conversation?.id === conversationId ? previousDetail : emptyDetail
        )
      }
    }

    if (!force && cachedDetail && isFresh) {
      return
    }

    try {
      const res = await getChatConversationById(conversationId)

      if (
        detailRequestIdRef.current !== requestId ||
        Number(selectedConversationRef.current) !== Number(conversationId)
      ) {
        return
      }

      const nextDetail = res.data?.data || emptyDetail
      cacheConversationDetail(conversationId, nextDetail)
      setDetail(nextDetail)
      setError('')
    } catch (err) {
      if (!silent && detailRequestIdRef.current === requestId) {
        setError(err.response?.data?.error || 'Khong tai duoc noi dung hoi thoai')
      }
    } finally {
      if (!silent && detailRequestIdRef.current === requestId) {
        setLoadingDetail(false)
      }
    }
  }, [cacheConversationDetail, syncThreadFromDetail])
  loadConversationRef.current = loadConversation

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

    const scheduleThreadsRefresh = () => {
      if (threadsRefreshTimerRef.current) return

      threadsRefreshTimerRef.current = window.setTimeout(() => {
        threadsRefreshTimerRef.current = null
        loadThreadsRef.current?.({ silent: true })
      }, 250)
    }

    const scheduleDetailRefresh = (conversationId) => {
      if (!conversationId || detailRefreshTimerRef.current) return

      detailRefreshTimerRef.current = window.setTimeout(() => {
        detailRefreshTimerRef.current = null
        loadConversationRef.current?.(conversationId, { silent: true, force: true })
      }, 200)
    }

    const socket = createSocketConnection(token)

    const handleSupportUpdated = (payload = {}) => {
      scheduleThreadsRefresh()

      const currentActiveId = activeIdRef.current
      if (currentActiveId && Number(payload.conversationId) === Number(currentActiveId)) {
        scheduleDetailRefresh(currentActiveId)
      }
    }

    socket.on('admin:support_updated', handleSupportUpdated)

    return () => {
      if (threadsRefreshTimerRef.current) {
        window.clearTimeout(threadsRefreshTimerRef.current)
        threadsRefreshTimerRef.current = null
      }

      if (detailRefreshTimerRef.current) {
        window.clearTimeout(detailRefreshTimerRef.current)
        detailRefreshTimerRef.current = null
      }

      socket.off('admin:support_updated', handleSupportUpdated)
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!activeId) {
      setShowJumpToLatest(false)
      return
    }

    pendingScrollToLatestRef.current = true
    shouldStickToBottomRef.current = true
    setShowJumpToLatest(false)
  }, [activeId])

  useEffect(() => {
    const element = messagesRef.current
    if (!element) return

    if (pendingScrollToLatestRef.current || shouldStickToBottomRef.current) {
      scrollMessagesToBottom(pendingScrollToLatestRef.current ? 'auto' : 'smooth')
      pendingScrollToLatestRef.current = false
      shouldStickToBottomRef.current = true
      setShowJumpToLatest(false)
      return
    }

    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80
    setShowJumpToLatest(!isNearBottom && (detail.messages?.length || 0) > 0)
  }, [detail.messages, scrollMessagesToBottom])

  const handleSelectThread = (conversationId) => {
    if (!conversationId || Number(conversationId) === Number(activeIdRef.current)) {
      return
    }

    const cachedDetail = detailCacheRef.current.get(Number(conversationId))
    if (cachedDetail) {
      setDetail(cloneDetail(cachedDetail))
      setLoadingDetail(false)
    }

    setActiveId(conversationId)
  }

  const handleSend = async () => {
    const message = reply.trim()
    if (!message || !activeId || sending) {
      return
    }

    const conversationId = activeId
    const optimisticMessage = {
      id: `optimistic-${Date.now()}`,
      content: message,
      created_at: new Date().toISOString(),
      sender_name: 'Admin',
      sender_role: 'admin',
    }

    setSending(true)
    pendingScrollToLatestRef.current = true
    shouldStickToBottomRef.current = true
    setDetail((currentDetail) => {
      const nextDetail = {
        conversation: currentDetail.conversation,
        messages: [...(currentDetail.messages || []), optimisticMessage],
      }

      cacheConversationDetail(conversationId, nextDetail)
      syncThreadFromDetail(nextDetail, { promote: true })
      return nextDetail
    })
    setReply('')

    try {
      const res = await sendChatReply(conversationId, { message })
      const nextDetail = res.data?.data || emptyDetail

      cacheConversationDetail(conversationId, nextDetail)
      syncThreadFromDetail(nextDetail, { promote: true })

      if (Number(activeIdRef.current) === Number(conversationId)) {
        setDetail(nextDetail)
      }

      loadThreads({ silent: true })
    } catch (err) {
      setReply(message)
      setError(err.response?.data?.error || 'Khong gui duoc phan hoi')
      loadConversation(conversationId, { silent: true, force: true })
    } finally {
      setSending(false)
    }
  }

  const handleStatusChange = async (nextStatus) => {
    if (!activeId) {
      return
    }

    const conversationId = activeId

    setDetail((currentDetail) => {
      if (!currentDetail.conversation) return currentDetail

      const nextDetail = {
        ...currentDetail,
        conversation: {
          ...currentDetail.conversation,
          status: nextStatus,
        },
      }

      cacheConversationDetail(conversationId, nextDetail)
      syncThreadFromDetail(nextDetail)
      return nextDetail
    })

    try {
      const res = await updateChatConversationStatus(conversationId, nextStatus)
      const nextDetail = res.data?.data || emptyDetail

      cacheConversationDetail(conversationId, nextDetail)
      syncThreadFromDetail(nextDetail)

      if (Number(activeIdRef.current) === Number(conversationId)) {
        setDetail(nextDetail)
      }

      loadThreads({ silent: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Khong cap nhat duoc trang thai')
      loadConversation(conversationId, { silent: true, force: true })
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
          <div className="page-title">💬 Hop thu ho tro</div>
          <div className="page-subtitle">User o ben trai, chat box o ben phai theo luong support</div>
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
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tim user theo ten, email..."
                />
              </div>
              <select className="filter-select" value={status} onChange={(event) => setStatus(event.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {loadingList ? (
              <div className="loading-wrap"><div className="spinner" /></div>
            ) : threads.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💬</div>
                <div className="empty-text">Chua co hoi thoai support nao</div>
              </div>
            ) : (
              <div className="chat-thread-list">
                {threads.map((thread) => (
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
                    <div className="chat-thread-preview">{thread.last_message_preview || 'Chua co tin nhan'}</div>
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
                <div className="empty-text">Chon mot user de xem cuoc tro chuyen</div>
              </div>
            ) : loadingDetail ? (
              <div className="loading-wrap"><div className="spinner" /></div>
            ) : (
              <>
                <div className="chat-detail-header">
                  <div>
                    <div className="chat-detail-title">
                      {detail.conversation?.user?.full_name || detail.conversation?.user?.email || 'Hoi thoai support'}
                    </div>
                    <div className="chat-detail-subtitle">
                      {detail.conversation?.user?.email} {detail.conversation?.user?.phone ? `· ${detail.conversation.user.phone}` : ''}
                    </div>
                  </div>

                  <div className="chat-detail-actions">
                    <select
                      className="filter-select"
                      value={detail.conversation?.status || 'open'}
                      onChange={(event) => handleStatusChange(event.target.value)}
                    >
                      {STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="chat-message-area">
                  <div className="chat-message-list" ref={messagesRef} onScroll={handleMessagesScroll}>
                    {(detail.messages || []).map((message) => (
                      <div
                        key={message.id}
                        className={`chat-message-row${message.sender_role === 'admin' ? ' mine' : ''}`}
                      >
                        <div className={`chat-message-bubble${message.sender_role === 'assistant' ? ' chat-ai-bubble' : ''}`}>
                          <div className="chat-message-meta">
                            <span>{message.sender_name || (message.sender_role === 'admin' ? 'Admin' : 'User')}</span>
                            <span>{new Date(message.created_at).toLocaleString('vi-VN')}</span>
                          </div>
                          <ExpandableMessageText content={message.content} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {showJumpToLatest && (
                    <button
                      type="button"
                      className="chat-jump-latest"
                      onClick={() => {
                        shouldStickToBottomRef.current = true
                        scrollMessagesToBottom()
                        setShowJumpToLatest(false)
                      }}
                    >
                      Ve tin nhan moi nhat
                    </button>
                  )}
                </div>

                <div className="chat-composer">
                  <textarea
                    className="form-control"
                    rows={3}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    onKeyDown={handleReplyKeyDown}
                    placeholder="Nhap phan hoi cho user..."
                  />
                  <button className="btn btn-primary" onClick={handleSend} disabled={sending || !reply.trim()}>
                    {sending ? 'Dang gui...' : 'Gui phan hoi'}
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
