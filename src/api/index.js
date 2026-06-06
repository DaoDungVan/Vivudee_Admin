import axios from 'axios'

const BASE = 'https://backend-log-function-2.onrender.com/api'
export const SOCKET_BASE_URL = BASE.replace(/\/api\/?$/, '')

const api = axios.create({ baseURL: BASE })

// Attach access token vào mỗi request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Silent token refresh ──────────────────────────────────────────────────────
// Khi access token hết hạn (401): thử refresh bằng refresh_token.
// Nếu refresh thành công → cập nhật token + retry request gốc, admin không bị out.
// Nếu refresh_token cũng hết hạn (30 ngày) → clear session + về login.

let isRefreshing = false
let pendingQueue = [] // các request đang chờ refresh hoàn tất

const flushQueue = (newToken, error) => {
  pendingQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(newToken))
  pendingQueue = []
}

const clearSession = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  if (!window.location.pathname.startsWith('/login')) {
    window.location.replace('/login')
  }
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config

    // Bỏ qua nếu không phải 401, hoặc đây chính là request refresh (tránh loop)
    if (err.response?.status !== 401 || original._isRefreshCall) {
      return Promise.reject(err)
    }

    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) {
      clearSession()
      return Promise.reject(err)
    }

    // Nếu đang refresh rồi → xếp hàng chờ
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject })
      }).then(newToken => {
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      })
    }

    isRefreshing = true
    original._retry = true

    try {
      // Dùng axios thuần để tránh interceptor tự gọi lại
      const res = await axios.post(
        `${BASE}/auth/refresh`,
        { refresh_token: refreshToken },
        { _isRefreshCall: true }
      )
      const { token: newToken, refresh_token: newRefresh } = res.data

      localStorage.setItem('token', newToken)
      if (newRefresh) localStorage.setItem('refresh_token', newRefresh)

      flushQueue(newToken, null)
      original.headers.Authorization = `Bearer ${newToken}`
      return api(original)
    } catch (refreshErr) {
      flushQueue(null, refreshErr)
      clearSession()
      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  }
)

// ─── Auth ──────────────────────────────────────────────────────────────────
export const login = (data) => api.post('/auth/login', data)

// ─── Flights ───────────────────────────────────────────────────────────────
export const getFlights      = (params) => api.get('/admin/flights', { params })
export const createFlight    = (data)   => api.post('/admin/flights', data)
export const updateFlight    = (id, data) => api.put(`/admin/flights/${id}`, data)
export const updateFlightStatus = (id, status) => api.patch(`/admin/flights/${id}/status`, { status })
export const toggleFlightVisibility = (id) => api.patch(`/admin/flights/${id}/visibility`)

// ─── Flight Schedules ──────────────────────────────────────────────────────
export const getSchedules           = (params) => api.get('/admin/schedules', { params })
export const createSchedule         = (data)   => api.post('/admin/schedules', data)
export const updateScheduleStatus   = (id, is_active) => api.patch(`/admin/schedules/${id}/status`, { is_active })
export const deleteSchedule         = (id)     => api.delete(`/admin/schedules/${id}`)
export const triggerGenerateFlights = ()       => api.post('/admin/schedules/generate')

// ─── Auto Multi-Airline Flight Generator ───────────────────────────────────
export const getAutoFlightStatus = ()     => api.get('/admin/auto-flights/status')
export const getAutoFlightConfig = ()     => api.get('/admin/auto-flights/config')
export const saveAutoFlightConfig = (data) => api.put('/admin/auto-flights/config', data)
export const runAutoFlightBatch  = (batch_size) => api.post('/admin/auto-flights/run', { batch_size })
export const runAutoFlightAll    = ()            => api.post('/admin/auto-flights/run-all')
export const runFromAirport     = (data)         => api.post('/admin/auto-flights/from-airport', data, { timeout: 300000 })
export const runFromAirportBg      = (data) => api.post('/admin/auto-flights/from-airport-bg', data)
export const getBgJobStatus        = ()     => api.get('/admin/auto-flights/bg-status')
export const setAirportJob         = (data) => api.post('/admin/auto-flights/set-airport-job', data)
export const getAirportJobStatus   = ()     => api.get('/admin/auto-flights/airport-job-status')

// ─── Airports ──────────────────────────────────────────────────────────────
export const getAirportCountries = () => api.get('/public/airport-countries')
export const getAirports     = (params) => api.get('/admin/airports', { params })
export const createAirport   = (data)   => api.post('/admin/airports', data)
export const updateAirport   = (id, data) => api.put(`/admin/airports/${id}`, data)
export const updateAirportStatus = (id, is_active) => api.patch(`/admin/airports/${id}/status`, { is_active })

// ─── Airlines ──────────────────────────────────────────────────────────────
export const getAirlines     = (params) => api.get('/admin/airlines', { params })
export const createAirline   = (data)   => api.post('/admin/airlines', data)
export const updateAirline   = (id, data) => api.put(`/admin/airlines/${id}`, data)
export const updateAirlineStatus = (id, is_active) => api.patch(`/admin/airlines/${id}/status`, { is_active })

// ─── Users ─────────────────────────────────────────────────────────────────
export const getUsers        = (params) => api.get('/admin/users', { params })
export const getUserById     = (id)     => api.get(`/admin/users/${id}`)
export const updateUserStatus = (id, status) => api.patch(`/admin/users/${id}/status`, { status })
export const updateUserRole  = (id, role) => api.patch(`/admin/users/${id}/role`, { role })

// ─── Bookings ──────────────────────────────────────────────────────────────
export const getBookings     = (params) => api.get('/admin/bookings', { params })
export const getBookingById  = (id)     => api.get(`/admin/bookings/${id}`)
export const updateBookingStatus = (id, status) => api.patch(`/admin/bookings/${id}/status`, { status })

// ─── Statistics ────────────────────────────────────────────────────────────
export const getStatistics   = (params) => api.get('/admin/statistics', { params })

// ─── Coupons ───────────────────────────────────────────────────────────────
export const getCoupons      = (params)   => api.get('/admin/coupons', { params })
export const createCoupon    = (data)     => api.post('/admin/coupons', data)
export const updateCoupon    = (id, data) => api.put(`/admin/coupons/${id}`, data)
export const deleteCoupon    = (id)       => api.delete(`/admin/coupons/${id}`)
export const toggleCoupon    = (id, isActive) => api.patch(`/admin/coupons/${id}/status`, { is_active: !isActive })

// ─── Cronjob ───────────────────────────────────────────────────────────────
export const runCronJob           = (type) => api.post('/admin/cron/run', { type })
export const runLoyaltyRecalc     = ()     => api.post('/admin/loyalty/recalculate')
export const runExpiredBookings   = ()     => api.post('/admin/cron/expired-bookings')

// ─── Refunds ───────────────────────────────────────────────────────────────
export const getAdminRefunds      = (params) => api.get('/admin/refunds', { params })
export const approveRefund        = (code, adminNotes = '') => api.post(`/admin/refunds/${code}/approve`, { admin_notes: adminNotes })
export const completeRefund       = (code) => api.post(`/admin/refunds/${code}/complete`, {})
export const rejectRefund         = (code, reason) => api.post(`/admin/refunds/${code}/reject`, { reason })

// ─── Date Changes ──────────────────────────────────────────────────────────
export const getAdminDateChanges  = (params) => api.get('/admin/date-changes', { params })
export const approveDateChange    = (code, adminNotes = '') => api.post(`/admin/date-changes/${code}/approve`, { admin_notes: adminNotes })
export const rejectDateChange     = (code, reason) => api.post(`/admin/date-changes/${code}/reject`, { reason })

// Chat support
export const getChatConversations = (params) => api.get('/admin/chat/conversations', { params })
export const getChatConversationById = (id) => api.get(`/admin/chat/conversations/${id}`)
export const sendChatReply = (id, data) => api.post(`/admin/chat/conversations/${id}/message`, data)
export const updateChatConversationStatus = (id, status) => api.patch(`/admin/chat/conversations/${id}/status`, { status })
