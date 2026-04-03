import axios from 'axios'

const BASE = 'https://backend-log-function-2.onrender.com/api'

const api = axios.create({ baseURL: BASE })

// Attach token
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Auto-logout on 401
api.interceptors.response.use(
  res => res,
  err => Promise.reject(err)
)

// ─── Auth ──────────────────────────────────────────────────────────────────
export const login = (data) => api.post('/auth/login', data)

// ─── Flights ───────────────────────────────────────────────────────────────
export const getFlights      = (params) => api.get('/admin/flights', { params })
export const createFlight    = (data)   => api.post('/admin/flights', data)
export const updateFlight    = (id, data) => api.put(`/admin/flights/${id}`, data)
export const updateFlightStatus = (id, status) => api.patch(`/admin/flights/${id}/status`, { status })
export const toggleFlightVisibility = (id) => api.patch(`/admin/flights/${id}/visibility`)

// ─── Airports ──────────────────────────────────────────────────────────────
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
