import { useState, useEffect } from 'react'
import { adminApi } from '../api'

export default function Newsletter() {
  const [subscribers, setSubscribers] = useState([])
  const [form, setForm]   = useState({ subject: '', title: '', body: '', ctaText: '', ctaUrl: '' })
  const [sending, setSending] = useState(false)
  const [result,  setResult]  = useState(null)
  const [tab,     setTab]     = useState('compose') // compose | subscribers

  useEffect(() => {
    adminApi.get('/newsletter/subscribers')
      .then(r => setSubscribers(r.data.data || []))
      .catch(() => {})
  }, [])

  const activeCount = subscribers.filter(s => s.is_active).length

  const handleSend = async () => {
    if (!form.subject || !form.title || !form.body) {
      alert('Vui lòng nhập Subject, Tiêu đề và Nội dung')
      return
    }
    if (!window.confirm(`Gửi email đến ${activeCount} subscriber đang active?`)) return
    setSending(true)
    setResult(null)
    try {
      const r = await adminApi.post('/newsletter/send', form)
      setResult(r.data)
    } catch (e) {
      setResult({ error: e?.response?.data?.error || 'Lỗi khi gửi' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page-content">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 className="page-title" style={{ margin:0 }}>Newsletter</h1>
          <p style={{ color:'var(--text-muted)', fontSize:13, margin:'4px 0 0' }}>
            {activeCount} subscriber đang active / {subscribers.length} tổng
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className={`btn btn-sm ${tab==='compose'?'btn-primary':'btn-secondary'}`} onClick={() => setTab('compose')}>Soạn email</button>
          <button className={`btn btn-sm ${tab==='subscribers'?'btn-primary':'btn-secondary'}`} onClick={() => setTab('subscribers')}>Danh sách</button>
        </div>
      </div>

      {tab === 'compose' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20 }}>
          {/* Form */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ margin:'0 0 20px', fontSize:15 }}>Soạn nội dung</h3>

            <label className="form-label">Subject (tiêu đề email) *</label>
            <input className="form-control" style={{ marginBottom:14 }} placeholder="VD: 🎁 Ưu đãi đặc biệt tháng 6!"
              value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} />

            <label className="form-label">Tiêu đề trong email *</label>
            <input className="form-control" style={{ marginBottom:14 }} placeholder="VD: Ưu đãi du lịch hè 2026"
              value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} />

            <label className="form-label">Nội dung *</label>
            <textarea className="form-control" rows={8} style={{ marginBottom:14, resize:'vertical' }}
              placeholder="Nội dung email gửi cho subscriber..."
              value={form.body} onChange={e => setForm(f => ({...f, body: e.target.value}))} />

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
              <div>
                <label className="form-label">Nút CTA (tuỳ chọn)</label>
                <input className="form-control" placeholder="VD: Đặt vé ngay"
                  value={form.ctaText} onChange={e => setForm(f => ({...f, ctaText: e.target.value}))} />
              </div>
              <div>
                <label className="form-label">Link CTA</label>
                <input className="form-control" placeholder="https://..."
                  value={form.ctaUrl} onChange={e => setForm(f => ({...f, ctaUrl: e.target.value}))} />
              </div>
            </div>

            <button className="btn btn-primary" style={{ width:'100%' }}
              disabled={sending || activeCount === 0} onClick={handleSend}>
              {sending ? '⏳ Đang gửi...' : `📨 Gửi đến ${activeCount} subscriber`}
            </button>

            {result && (
              <div style={{ marginTop:16, padding:'12px 16px', borderRadius:8,
                background: result.error ? 'rgba(220,38,38,0.1)' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${result.error ? '#dc2626' : '#22c55e'}`,
                color: result.error ? '#dc2626' : '#22c55e', fontSize:13 }}>
                {result.error
                  ? `❌ ${result.error}`
                  : `✅ Đã gửi ${result.sent}/${result.total} email${result.failed > 0 ? ` (${result.failed} lỗi)` : ''}`}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="card" style={{ padding:20 }}>
            <h3 style={{ margin:'0 0 16px', fontSize:14, color:'var(--text-muted)' }}>Preview</h3>
            <div style={{ background:'#f3f4f6', borderRadius:10, padding:20, fontSize:13 }}>
              <div style={{ background:'#1a56db', padding:'20px', borderRadius:'8px 8px 0 0', textAlign:'center', color:'#fff', fontWeight:700, fontSize:15 }}>
                {form.title || 'Tiêu đề email'}
              </div>
              <div style={{ background:'#fff', padding:16, borderRadius:'0 0 8px 8px', whiteSpace:'pre-wrap', color:'#374151', lineHeight:1.7 }}>
                {form.body || 'Nội dung email...'}
                {form.ctaText && (
                  <div style={{ textAlign:'center', marginTop:16 }}>
                    <span style={{ background:'#1a56db', color:'#fff', padding:'8px 20px', borderRadius:6, fontSize:13 }}>{form.ctaText}</span>
                  </div>
                )}
                <p style={{ color:'#9ca3af', fontSize:11, textAlign:'center', marginTop:16 }}>
                  Không muốn nhận email? <span style={{ color:'#6b7280', textDecoration:'underline' }}>Hủy đăng ký</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'subscribers' && (
        <div className="card" style={{ padding:20 }}>
          <table className="data-table" style={{ width:'100%' }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Trạng thái</th>
                <th>Ngày đăng ký</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map(s => (
                <tr key={s.id}>
                  <td>{s.email}</td>
                  <td>
                    <span style={{ display:'inline-block', padding:'2px 10px', borderRadius:20, fontSize:12, fontWeight:600,
                      background: s.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                      color: s.is_active ? '#22c55e' : '#6b7280' }}>
                      {s.is_active ? 'Active' : 'Unsubscribed'}
                    </span>
                  </td>
                  <td style={{ color:'var(--text-muted)', fontSize:13 }}>
                    {new Date(s.created_at).toLocaleDateString('vi-VN')}
                  </td>
                </tr>
              ))}
              {subscribers.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign:'center', color:'var(--text-muted)', padding:40 }}>Chưa có subscriber nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
