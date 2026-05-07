import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getChatConversations,
  getChatConversationById,
  sendChatReply,
  updateChatConversationStatus,
} from '../api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { createSocketConnection } from '../socket'
import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ICON_CATEGORIES,
  CHAT_ICON_PRESETS,
  createAttachmentsFromFiles,
  formatAttachmentSize,
  getMessageAttachments,
  isVisualAttachment,
} from '../utils/chatAttachments'

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'open', label: 'Sẵn sàng hỗ trợ' },
  { value: 'pending_admin', label: 'Chờ admin' },
  { value: 'pending_user', label: 'Chờ user' },
  { value: 'resolved', label: 'Đã xử lý' },
]

const STATUS_LABELS = {
  open: 'Sẵn sàng',
  pending_admin: 'Chờ admin',
  pending_user: 'Chờ user',
  resolved: 'Đã xử lý',
}

const emptyDetail = { conversation: null, messages: [] }
const DETAIL_CACHE_TTL = 15000

const cloneDetail = (detail) => ({
  conversation: detail?.conversation ? { ...detail.conversation } : null,
  messages: Array.isArray(detail?.messages) ? [...detail.messages] : [],
})

const buildAttachmentPreview = (attachments = []) => {
  if (!attachments.length) return ''
  if (attachments.length === 1) {
    const [attachment] = attachments
    if (attachment.type === 'sticker' || attachment.type === 'icon') return '[Icon]'
    if (attachment.type === 'image') return `[Hinh anh] ${attachment.name || ''}`.trim()
    return `[File] ${attachment.name || ''}`.trim()
  }
  return `[${attachments.length} tep dinh kem]`
}

const buildThreadPreview = (detail) => {
  const conversation = detail?.conversation || {}
  const messages = detail?.messages || []
  const lastMessage = messages[messages.length - 1]

  return {
    id: conversation.id,
    user: conversation.user,
    status: conversation.status,
    unread_count: conversation.unread_count ?? 0,
    last_message_preview:
      lastMessage?.preview ||
      lastMessage?.content ||
      conversation.last_message_preview ||
      '',
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

  if (!text.trim()) {
    return null
  }

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

function MessageAttachments({ message, onMediaLoad }) {
  const attachments = getMessageAttachments(message)

  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="chat-attachment-list">
      {attachments.map((attachment, index) => {
        const key = attachment.id || `${attachment.type}-${index}`

        if (isVisualAttachment(attachment)) {
          return (
            <a
              key={key}
              className={`chat-image-attachment${
                attachment.type === 'sticker' || attachment.type === 'icon'
                  ? ' chat-sticker-attachment'
                  : ''
              }`}
              href={attachment.data_url}
              download={attachment.name || undefined}
              target="_blank"
              rel="noreferrer"
            >
              <img src={attachment.data_url} alt={attachment.label || attachment.name || 'attachment'} onLoad={onMediaLoad} />
            </a>
          )
        }

        return (
          <a
            key={key}
            className="chat-file-attachment"
            href={attachment.data_url}
            download={attachment.name || undefined}
            target="_blank"
            rel="noreferrer"
          >
            <div className="chat-file-attachment-title">{attachment.name || 'File dinh kem'}</div>
            <div className="chat-file-attachment-meta">
              <span>{attachment.mime_type || 'file'}</span>
              <span>{formatAttachmentSize(attachment.size)}</span>
            </div>
            <span className="chat-file-attachment-link">Tai file</span>
          </a>
        )
      })}
    </div>
  )
}

function AttachmentPreviewList({ attachments, onRemove }) {
  if (!attachments.length) {
    return null
  }

  return (
    <div className="chat-composer-preview-list">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="chat-composer-preview-item">
          {isVisualAttachment(attachment) ? (
            <img
              className={`chat-composer-preview-thumb${
                attachment.type === 'sticker' || attachment.type === 'icon' ? ' sticker' : ''
              }`}
              src={attachment.data_url}
              alt={attachment.label || attachment.name || 'attachment'}
            />
          ) : (
            <div className="chat-composer-preview-file">{attachment.name?.slice(0, 2).toUpperCase() || 'FI'}</div>
          )}
          <div className="chat-composer-preview-meta">
            <strong>{attachment.label || attachment.name}</strong>
            <span>{attachment.type === 'file' ? formatAttachmentSize(attachment.size) : attachment.type}</span>
          </div>
          <button
            type="button"
            className="chat-composer-preview-remove"
            onClick={() => onRemove(attachment.id)}
            aria-label="Xoa dinh kem"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export default function ChatPage() {
  const [threads, setThreads] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [detail, setDetail] = useState(emptyDetail)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [reply, setReply] = useState('')
  const [attachments, setAttachments] = useState([])
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false)
  const [stickerCategory, setStickerCategory] = useState('all')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)

  const debouncedSearch = useDebouncedValue(search, 300)
  const messagesRef = useRef(null)
  const fileInputRef = useRef(null)
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
        setError(err.response?.data?.error || 'Không tải được danh sách hội thoại')
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
      setAttachments([])
      setIsStickerPickerOpen(false)
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
        setError(err.response?.data?.error || 'Không tải được nội dung hội thoại')
      }
    } finally {
      if (!silent && detailRequestIdRef.current === requestId) {
        setLoadingDetail(false)
      }
    }
  }, [cacheConversationDetail])
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

  const handleAttachmentFileChange = async (event) => {
    const files = event.target.files
    if (!files?.length) {
      return
    }

    try {
      const nextAttachments = await createAttachmentsFromFiles(files, attachments.length)
      setAttachments((previous) => [...previous, ...nextAttachments])
      setError('')
    } catch (attachmentError) {
      setError(attachmentError?.message || 'Không tải được tệp đính kèm')
    } finally {
      event.target.value = ''
    }
  }

  const handleSendStickerDirectly = async (sticker) => {
    if (sending || !activeId) return

    const conversationId = activeId
    const optimisticMessage = {
      id: `optimistic-icon-${Date.now()}`,
      content: sticker.emoji,
      preview: sticker.emoji,
      created_at: new Date().toISOString(),
      sender_name: 'Admin',
      sender_role: 'admin',
      meta: { attachments: [] },
    }

    setSending(true)
    setIsStickerPickerOpen(false)
    setError('')
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

    try {
      const res = await sendChatReply(conversationId, { message: sticker.emoji })
      const nextDetail = res.data?.data || emptyDetail
      cacheConversationDetail(conversationId, nextDetail)
      syncThreadFromDetail(nextDetail, { promote: true })
      if (Number(activeIdRef.current) === Number(conversationId)) {
        setDetail(nextDetail)
      }
      loadThreads({ silent: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Không gửi được biểu tượng')
      loadConversation(conversationId, { silent: true, force: true })
    } finally {
      setSending(false)
    }
  }

  const handleRemoveAttachment = (attachmentId) => {
    setAttachments((previous) => previous.filter((attachment) => attachment.id !== attachmentId))
  }

  const handleSend = async () => {
    const message = reply.trim()
    const outgoingAttachments = attachments

    if ((!message && outgoingAttachments.length === 0) || !activeId || sending) {
      return
    }

    const conversationId = activeId
    const optimisticMessage = {
      id: `optimistic-${Date.now()}`,
      content: message,
      preview: message || buildAttachmentPreview(outgoingAttachments),
      created_at: new Date().toISOString(),
      sender_name: 'Admin',
      sender_role: 'admin',
      meta: {
        attachments: outgoingAttachments,
      },
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
    setAttachments([])
    setIsStickerPickerOpen(false)

    try {
      const res = await sendChatReply(conversationId, {
        message,
        attachments: outgoingAttachments,
      })
      const nextDetail = res.data?.data || emptyDetail

      cacheConversationDetail(conversationId, nextDetail)
      syncThreadFromDetail(nextDetail, { promote: true })

      if (Number(activeIdRef.current) === Number(conversationId)) {
        setDetail(nextDetail)
      }

      loadThreads({ silent: true })
    } catch (err) {
      setReply(message)
      setAttachments(outgoingAttachments)
      setError(err.response?.data?.error || 'Không gửi được phản hồi')
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
      setError(err.response?.data?.error || 'Không cập nhật được trạng thái')
      loadConversation(conversationId, { silent: true, force: true })
    }
  }

  const handleReplyKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  const handleMediaLoad = useCallback(() => {
    const element = messagesRef.current
    if (!element) return

    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120
    if (isNearBottom) {
      element.scrollTop = element.scrollHeight
    }
  }, [])

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Hộp thư hỗ trợ</div>
          <div className="page-subtitle">Danh sách cuộc trò chuyện bên trái — nội dung chat bên phải</div>
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
                  placeholder="Tìm user theo tên, email..."
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
                <div className="empty-text">Chưa có hội thoại hỗ trợ nào</div>
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
                      {detail.conversation?.user?.full_name || detail.conversation?.user?.email || 'Hội thoại hỗ trợ'}
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
                          <MessageAttachments message={message} onMediaLoad={handleMediaLoad} />
                          <ExpandableMessageText content={message.content} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {showJumpToLatest && (
                    <button
                      type="button"
                      className="chat-jump-latest"
                      aria-label="Xuống tin nhắn mới nhất"
                      onClick={() => {
                        shouldStickToBottomRef.current = true
                        scrollMessagesToBottom()
                        setShowJumpToLatest(false)
                      }}
                    >
                      ↓
                    </button>
                  )}
                </div>

                <div className="chat-composer">
                  <div className="chat-composer-main">
                    <AttachmentPreviewList attachments={attachments} onRemove={handleRemoveAttachment} />

                    <div className="chat-composer-tools">
                      <button
                        type="button"
                        className="chat-tool-button"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        📎 Ảnh / File
                      </button>
                      <button
                        type="button"
                        className={`chat-tool-button${isStickerPickerOpen ? ' active' : ''}`}
                        onClick={() => setIsStickerPickerOpen((previous) => !previous)}
                      >
                        🙂 Biểu tượng
                      </button>
                    </div>

                    {isStickerPickerOpen && (
                      <div className="chat-sticker-picker">
                        <div className="chat-sticker-categories">
                          {CHAT_ICON_CATEGORIES.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              className={`chat-sticker-category-btn${stickerCategory === cat.id ? ' active' : ''}`}
                              onClick={() => setStickerCategory(cat.id)}
                              title={cat.label}
                            >
                              {cat.icon}
                            </button>
                          ))}
                        </div>
                        <div className="chat-sticker-grid">
                          {CHAT_ICON_PRESETS
                            .filter((s) => stickerCategory === 'all' || s.category === stickerCategory)
                            .map((sticker) => (
                              <button
                                key={sticker.id}
                                type="button"
                                className="chat-sticker-button"
                                onClick={() => handleSendStickerDirectly(sticker)}
                                title={sticker.label}
                              >
                                <img src={sticker.dataUrl} alt={sticker.label} />
                              </button>
                            ))}
                        </div>
                      </div>
                    )}

                    <textarea
                      className="form-control"
                      rows={3}
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      onKeyDown={handleReplyKeyDown}
                      placeholder="Nhập phản hồi cho user..."
                    />
                    <input
                      ref={fileInputRef}
                      className="chat-hidden-input"
                      type="file"
                      accept={CHAT_ATTACHMENT_ACCEPT}
                      multiple
                      onChange={handleAttachmentFileChange}
                    />
                  </div>

                  <button className="btn btn-primary" onClick={handleSend} disabled={sending || (!reply.trim() && attachments.length === 0)}>
                    {sending ? '⏳ Đang gửi...' : '↗ Gửi'}
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
