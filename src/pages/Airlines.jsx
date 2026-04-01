import { useState, useEffect, useCallback } from 'react'
import { getAirlines, createAirline, updateAirline, updateAirlineStatus } from '../api'

const empty = { code: '', name: '', logo_url: '' }

export default function AirlinesPage() {
  const [data, setData]             = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 })
  const [page, setPage]             = useState(1)
  const [limit]                     = useState(15)
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [modal, setModal]           = useState(null)
  const [editItem, setEditItem]     = useState(null)
  const [form, setForm]             = useState(empty)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const load = useCallback(() => {
    setLoading(true)
    getAirlines({ page, limit, search: search || undefined })
      .then(r => {
        const d = r.data
        setData(d.data || [])
        setPagination(d.pagination || { total: 0, total_pages: 1 })
      })
      .catch(() => {}).finally(() => setLoading(false))
  }, [page, limit, search])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm(empty); setError(''); setModal('create'); setEditItem(null) }
  const openEdit   = (a) => { setEditItem(a); setForm({ code: a.code, name: a.name, logo_url: a.logo_url || '' }); setError(''); setModal('edit') }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (modal === 'create') await createAirline(form)
      else await updateAirline(editItem.id, form)
      setModal(null); load()
    } catch (e) { setError(e.response?.data?.error || 'Lỗi khi lưu') }
    finally { setSaving(false) }
  }

  const toggleStatus = async (a) => {
    try { await updateAirlineStatus(a.id, !a.is_active); load() }
    catch (e) { alert(e.response?.data?.error || 'Lỗi') }
  }

  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const { total, total_pages } = pagination

  const pageButtons = () => {
    if (total_pages <= 7) return Array.from({ length: total_pages }, (_, i) => i + 1)
    const start = Math.max(1, Math.min(page - 3, total_pages - 6))
    return Array.from({ length: Math.min(7, total_pages) }, (_, i) => start + i)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">🛫 Quản lý hãng bay</div>
          <div className="page-subtitle">{total} hãng bay trong hệ thống</div>
        </div>
        <div className="header-right">
          <button className="btn btn-primary" onClick={openCreate}>+ Thêm hãng bay</button>
        </div>
      </div>

      <div className="page-content">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input placeholder="Tìm hãng bay..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <button className="btn btn-secondary btn-sm ml-auto" onClick={load}>↺ Làm mới</button>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : data.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🛫</div><div className="empty-text">Không tìm thấy hãng bay</div></div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Logo</th><th>Mã hãng</th><th>Tên hãng bay</th><th>Ngày tạo</th><th>Trạng thái</th><th>Hành động</th></tr>
                </thead>
                <tbody>
                  {data.map(a => (
                    <tr key={a.id}>
                      <td>
                        {a.logo_url
                          ? <img src={a.logo_url} alt={a.code} style={{ height: 28, objectFit: 'contain', borderRadius: 4 }} onError={e => e.target.style.display='none'} />
                          : <div style={{ width: 40, height: 28, background: 'var(--bg-input)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>N/A</div>
                        }
                      </td>
                      <td><span className="td-mono">{a.code}</span></td>
                      <td style={{ fontWeight: 500 }}>{a.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.created_at ? new Date(a.created_at).toLocaleDateString('vi-VN') : '—'}</td>
                      <td><span className={`badge ${a.is_active ? 'badge-success' : 'badge-danger'}`}>{a.is_active ? '✓ Hoạt động' : '✕ Dừng'}</span></td>
                      <td>
                        <div className="action-btns">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(a)}>✏️ Sửa</button>
                          <button className={`btn btn-sm ${a.is_active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleStatus(a)}>
                            {a.is_active ? '🔒 Dừng' : '✓ Kích hoạt'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <div className="pagination-info">Trang {page} / {total_pages} · Tổng {total} hãng bay</div>
              <div className="pagination-btns">
                <button className="page-btn" disabled={page===1} onClick={() => setPage(1)}>«</button>
                <button className="page-btn" disabled={page===1} onClick={() => setPage(p=>p-1)}>‹</button>
                {pageButtons().map(p => <button key={p} className={`page-btn${p===page?' active':''}`} onClick={() => setPage(p)}>{p}</button>)}
                <button className="page-btn" disabled={page>=total_pages} onClick={() => setPage(p=>p+1)}>›</button>
                <button className="page-btn" disabled={page>=total_pages} onClick={() => setPage(total_pages)}>»</button>
              </div>
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{modal==='create'?'+ Thêm hãng bay':'✏️ Cập nhật hãng bay'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            {error && <div className="alert alert-error">⚠ {error}</div>}
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Mã hãng *</label><input className="form-control" value={form.code} onChange={e=>sf('code',e.target.value.toUpperCase())} placeholder="VN" maxLength={10} /></div>
              <div className="form-group"><label className="form-label">Tên hãng bay *</label><input className="form-control" value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="Vietnam Airlines" /></div>
              <div className="form-group full"><label className="form-label">URL Logo</label><input className="form-control" value={form.logo_url} onChange={e=>sf('logo_url',e.target.value)} placeholder="https://..." /></div>
              {form.logo_url && <div className="form-group full" style={{ textAlign: 'center' }}><img src={form.logo_url} alt="preview" style={{ height: 50, objectFit: 'contain' }} onError={e=>e.target.style.display='none'} /></div>}
            </div>
            <div className="form-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'⏳ Đang lưu...':'💾 Lưu'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
