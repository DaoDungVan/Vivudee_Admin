import { useState, useEffect, useCallback } from 'react'
import { getCoupons, createCoupon, updateCoupon, deleteCoupon, toggleCoupon } from '../api'

const DISCOUNT_TYPES = ['percentage', 'fixed']
const DISCOUNT_LABEL = { percentage: 'Phần trăm (%)', fixed: 'Cố định (VNĐ)' }

const emptyCoupon = {
  code: '', discount_type: 'percentage', discount_value: '',
  min_order_value: '', max_uses: '', expires_at: '', description: '',
}

const fmtCurrency = (n) =>
  n == null ? '—' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n)

export default function CouponsPage() {
  const [data, setData]     = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 })
  const [page, setPage]     = useState(1)
  const limit = 10
  const [loading, setLoading]   = useState(false)
  const [search, setSearch]     = useState('')
  const [modal, setModal]       = useState(null)
  const [editData, setEditData] = useState(null)
  const [form, setForm]         = useState(emptyCoupon)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const load = useCallback(() => {
    setLoading(true)
    getCoupons({ page, limit, code: search || undefined })
      .then(r => {
        const d = r.data
        setData(d.data || d.coupons || (Array.isArray(d) ? d : []))
        setPagination(d.pagination || { total: 0, total_pages: 1 })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm(emptyCoupon); setError(''); setEditData(null); setModal('create') }
  const openEdit = (c) => {
    setEditData(c)
    setForm({
      code: c.code,
      discount_type: c.discount_type || 'percentage',
      discount_value: c.discount_value ?? '',
      min_order_value: c.min_order_value ?? '',
      max_uses: c.max_uses ?? '',
      expires_at: c.expires_at ? c.expires_at.slice(0, 10) : '',
      description: c.description || '',
    })
    setError('')
    setModal('edit')
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (modal === 'create') await createCoupon(form)
      else await updateCoupon(editData.id, form)
      setModal(null); load()
    } catch (e) { setError(e.response?.data?.error || 'Lỗi khi lưu') }
    finally { setSaving(false) }
  }

  const handleToggle = async (id) => {
    try { await toggleCoupon(id); load() } catch (e) { alert(e.response?.data?.error || 'Lỗi') }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Xác nhận xoá coupon này?')) return
    try { await deleteCoupon(id); load() } catch (e) { alert(e.response?.data?.error || 'Lỗi') }
  }

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const { total, total_pages: totalPages } = pagination

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">🏷️ Quản lý Coupon</div>
          <div className="page-subtitle">{pagination.total} coupon trong hệ thống</div>
        </div>
        <div className="header-right">
          <button className="btn btn-primary" onClick={openCreate}>+ Thêm coupon</button>
        </div>
      </div>

      <div className="page-content">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input placeholder="Tìm mã coupon..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <button className="btn btn-secondary btn-sm ml-auto" onClick={load}>↺ Làm mới</button>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : data.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🏷️</div><div className="empty-text">Không có coupon nào</div></div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Mã coupon</th>
                    <th>Loại giảm</th>
                    <th>Giá trị</th>
                    <th>Đơn tối thiểu</th>
                    <th>Đã dùng / Tối đa</th>
                    <th>Hết hạn</th>
                    <th>Trạng thái</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(c => (
                    <tr key={c.id}>
                      <td><span className="td-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{c.code}</span></td>
                      <td><span className="badge badge-info">{DISCOUNT_LABEL[c.discount_type] || c.discount_type}</span></td>
                      <td style={{ fontWeight: 600 }}>
                        {c.discount_type === 'percentage'
                          ? `${c.discount_value}%`
                          : fmtCurrency(c.discount_value)}
                      </td>
                      <td>{c.min_order_value ? fmtCurrency(c.min_order_value) : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          {c.used_count ?? 0} / {c.max_uses ?? '∞'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {c.expires_at ? new Date(c.expires_at).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td>
                        <span className={`badge ${c.is_active !== false ? 'badge-success' : 'badge-danger'}`}>
                          {c.is_active !== false ? '✓ Hoạt động' : '✕ Vô hiệu'}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>✏️</button>
                          <button
                            className="btn btn-sm"
                            style={{ background: c.is_active !== false ? 'var(--warning-bg)' : 'var(--success-bg)', color: c.is_active !== false ? 'var(--warning)' : 'var(--success)', border: '1px solid currentColor' }}
                            onClick={() => handleToggle(c.id)}
                          >
                            {c.is_active !== false ? '🚫' : '✓'}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <div className="pagination-info">Trang {page} / {totalPages} · Tổng {total} coupon</div>
              <div className="pagination-btns">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                  return <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                })}
                <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
              </div>
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{modal === 'create' ? '+ Thêm coupon' : '✏️ Cập nhật coupon'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>

            {error && <div className="alert alert-error">⚠ {error}</div>}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Mã coupon *</label>
                <input className="form-control" value={form.code} onChange={e => setField('code', e.target.value.toUpperCase())} placeholder="SUMMER20" />
              </div>
              <div className="form-group">
                <label className="form-label">Loại giảm giá *</label>
                <select className="form-control" value={form.discount_type} onChange={e => setField('discount_type', e.target.value)}>
                  {DISCOUNT_TYPES.map(t => <option key={t} value={t}>{DISCOUNT_LABEL[t]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Giá trị giảm *</label>
                <input className="form-control" type="number" value={form.discount_value} onChange={e => setField('discount_value', e.target.value)}
                  placeholder={form.discount_type === 'percentage' ? '20 (%)' : '50000 (VNĐ)'} />
              </div>
              <div className="form-group">
                <label className="form-label">Đơn hàng tối thiểu (VNĐ)</label>
                <input className="form-control" type="number" value={form.min_order_value} onChange={e => setField('min_order_value', e.target.value)} placeholder="500000" />
              </div>
              <div className="form-group">
                <label className="form-label">Số lần dùng tối đa</label>
                <input className="form-control" type="number" value={form.max_uses} onChange={e => setField('max_uses', e.target.value)} placeholder="100" />
              </div>
              <div className="form-group">
                <label className="form-label">Ngày hết hạn</label>
                <input className="form-control" type="date" value={form.expires_at} onChange={e => setField('expires_at', e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">Mô tả</label>
                <textarea className="form-control" value={form.description} onChange={e => setField('description', e.target.value)} placeholder="Mô tả coupon..." />
              </div>
            </div>

            <div className="form-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Đang lưu...' : '💾 Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
