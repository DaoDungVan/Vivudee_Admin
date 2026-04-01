import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api'
import { useAuth } from '../context/AuthContext'
import LogoNav from '../assets/imgs/LogoNav.svg'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signin } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await login(form)
      const { token, user } = res.data
      if (user.role !== 'admin') {
        setError('Tài khoản không có quyền admin')
        return
      }
      signin(user, token)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-card">
        <div className="login-logo">
          <img src={LogoNav} alt="VivuDee" style={{ marginBottom: 16 }} />
          <div className="login-subtitle">Hệ thống quản lý đặt vé máy bay</div>
        </div>

        {error && <div className="alert alert-error">⚠ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">Email</label>
            <input
              className="form-control"
              type="email"
              placeholder="admin@example.com"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Mật khẩu</label>
            <input
              className="form-control"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              required
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} type="submit" disabled={loading}>
            {loading ? '⏳ Đang đăng nhập...' : '🔐 Đăng nhập'}
          </button>
        </form>

        <div className="text-muted" style={{ textAlign: 'center', marginTop: '20px' }}>
          Chỉ dành cho tài khoản Admin
        </div>
      </div>
    </div>
  )
}
