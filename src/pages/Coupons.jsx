import { useState, useEffect, useCallback, useRef } from 'react'
import { getCoupons, createCoupon, updateCoupon, deleteCoupon, toggleCoupon } from '../api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { LuTag, LuSearch, LuRefreshCw, LuPencil, LuBan, LuCheck, LuTrash2, LuX, LuTriangleAlert, LuHourglass, LuSave } from 'react-icons/lu'

const DISCOUNT_TYPES = ['percent', 'fixed']
const DISCOUNT_LABEL = { percent: 'Phần trăm (%)', fixed: 'Cố định (VNĐ)' }

const emptyCoupon = {
  code: '', type: 'percent', value: '',
  min_order: '', usage_limit: '', expiry_at: '', description: '',
}
const SEARCH_FETCH_LIMIT = 500

const matchesCouponSearch = (coupon, keyword) => {
  const q = keyword.toLowerCase()
  return [coupon.code, coupon.description, coupon.discount_type]
    .some(value => String(value || '').toLowerCase().includes(q))
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
  const requestIdRef            = useRef(0)
  const debouncedSearch         = useDebouncedValue(search)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    const keyword = debouncedSearch.trim()
    const searching = keyword.length > 0

    setLoading(true)
    getCoupons({ page: searching ? 1 : page, limit: searching ? SEARCH_FETCH_LIMIT : limit })
      .then(r => {
        if (requestId !== requestIdRef.current) return
        const d = r.data
        const items = d.data || d.coupons || (Array.isArray(d) ? d : [])

        if (searching) {
          const filtered = items.filter(item => matchesCouponSearch(item, keyword))
          const total = filtered.length
          const totalPages = Math.max(1, Math.ceil(total / limit))
          const safePage = Math.min(page, totalPages)

          setData(filtered.slice((safePage - 1) * limit, safePage * limit))
          setPagination({ total, total_pages: totalPages, page: safePage })

          if (safePage !== page) setPage(safePage)
          return
        }

        setData(items)
        setPagination(d.pagination || { total: 0, total_pages: 1 })
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false)
      })
  }, [page, debouncedSearch])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm(emptyCoupon); setError(''); setEditData(null); setModal('create') }
  const openEdit = (c) => {
    setEditData(c)
    setForm({
      code: c.code,
      type: c.type || 'percent',
      value: c.value ?? '',
      min_order: c.min_order ?? '',
      usage_limit: c.usage_limit ?? '',
      expiry_at: c.expiry_at ? c.expiry_at.slice(0, 10) : '',
      description: c.description || '',
    })
    setError('')
    setModal('edit')
  }

  const sanitizeForm = (f) => ({
    code: f.code.trim().toUpperCase(),
    type: f.type,
    value: f.value !== '' ? Number(f.value) : null,
    min_order: f.min_order !== '' ? Number(f.min_order) : null,
    usage_limit: f.usage_limit !== '' ? Number(f.usage_limit) : null,
    expiry_at: f.expiry_at || null,
    description: f.description || '',
  })

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const payload = sanitizeForm(form)
      if (modal === 'create') await createCoupon(payload)
      else await updateCoupon(editData.id, payload)
      setModal(null); load()
    } catch (e) { setError(e.response?.data?.error || 'Lỗi khi lưu') }
    finally { setSaving(false) }
  }

  const handleToggle = async (id, isActive) => {
    try { await toggleCoupon(id, isActive); load() } catch (e) { alert(e.response?.data?.error || 'Lỗi') }
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
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}><LuTag size={18}/> Quản lý Coupon</div>
          <div className="page-subtitle">{pagination.total} coupon trong hệ thống</div>
        </div>
        <div className="header-right">
          <button className="btn btn-primary" onClick={openCreate}>+ Thêm coupon</button>
        </div>
      </div>

      <div className="page-content">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon"><LuSearch size={16}/></span>
            <input placeholder="Tìm mã coupon..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <button className="btn btn-secondary btn-sm ml-auto" style={{ display:'flex', alignItems:'center', gap:5 }} onClick={load}><LuRefreshCw size={14}/> Làm mới</button>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : data.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><LuTag size={36}/></div><div className="empty-text">Không có coupon nào</div></div>
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
                      <td><span className="badge badge-info">{DISCOUNT_LABEL[c.type] || c.type}</span></td>
                      <td style={{ fontWeight: 600 }}>
                        {c.type === 'percent'
                          ? `${c.value}%`
                          : fmtCurrency(c.value)}
                      </td>
                      <td>{c.min_order ? fmtCurrency(c.min_order) : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          {c.used_count ?? 0} / {c.usage_limit ?? '∞'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {c.expiry_at ? new Date(c.expiry_at).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td>
                        <span className={`badge ${c.is_active !== false ? 'badge-success' : 'badge-danger'}`} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                          {c.is_active !== false ? <><LuCheck size={12}/> Hoạt động</> : <><LuX size={12}/> Vô hiệu</>}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}><LuPencil size={14}/></button>
                          <button
                            className="btn btn-sm"
                            style={{ background: c.is_active !== false ? 'var(--warning-bg)' : 'var(--success-bg)', color: c.is_active !== false ? 'var(--warning)' : 'var(--success)', border: '1px solid currentColor' }}
                            onClick={() => handleToggle(c.id, c.is_active)}
                          >
                            {c.is_active !== false ? <LuBan size={14}/> : <LuCheck size={14}/>}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}><LuTrash2 size={14}/></button>
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
              <div className="modal-title" style={{ display:'flex', alignItems:'center', gap:6 }}>{modal === 'create' ? '+ Thêm coupon' : <><LuPencil size={15}/> Cập nhật coupon</>}</div>
              <button className="modal-close" onClick={() => setModal(null)}><LuX size={18}/></button>
            </div>

            {error && <div className="alert alert-error" style={{ display:'flex', alignItems:'center', gap:6 }}><LuTriangleAlert size={15}/> {error}</div>}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Mã coupon *</label>
                <input className="form-control" value={form.code} onChange={e => setField('code', e.target.value.toUpperCase())} placeholder="SUMMER20" />
              </div>
              <div className="form-group">
                <label className="form-label">Loại giảm giá *</label>
                <select className="form-control" value={form.type} onChange={e => setField('type', e.target.value)}>
                  {DISCOUNT_TYPES.map(t => <option key={t} value={t}>{DISCOUNT_LABEL[t]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Giá trị giảm *</label>
                <input className="form-control" type="number" value={form.value} onChange={e => setField('value', e.target.value)}
                  placeholder={form.type === 'percent' ? '20 (%)' : '50000 (VNĐ)'} />
              </div>
              <div className="form-group">
                <label className="form-label">Đơn hàng tối thiểu (VNĐ)</label>
                <input className="form-control" type="number" value={form.min_order} onChange={e => setField('min_order', e.target.value)} placeholder="500000" />
              </div>
              <div className="form-group">
                <label className="form-label">Số lần dùng tối đa</label>
                <input className="form-control" type="number" value={form.usage_limit} onChange={e => setField('usage_limit', e.target.value)} placeholder="100" />
              </div>
              <div className="form-group">
                <label className="form-label">Ngày hết hạn</label>
                <input className="form-control" type="date" value={form.expiry_at} onChange={e => setField('expiry_at', e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">Mô tả</label>
                <textarea className="form-control" value={form.description} onChange={e => setField('description', e.target.value)} placeholder="Mô tả coupon..." />
              </div>
            </div>

            <div className="form-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><LuHourglass size={14}/> Đang lưu...</> : <><LuSave size={14}/> Lưu</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
