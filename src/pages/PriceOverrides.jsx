import { useState, useEffect, useCallback } from 'react'
import {
  getPriceOverrides, createPriceOverride, updatePriceOverride,
  deletePriceOverride, bulkCreatePriceOverrides,
} from '../api'
import {
  LuTrendingUp, LuRefreshCw, LuPencil, LuTrash2, LuX,
  LuTriangleAlert, LuHourglass, LuSave, LuCopyPlus, LuCheck, LuBan,
} from 'react-icons/lu'

const now = new Date()
const CURRENT_YEAR = now.getFullYear()
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2]

const emptyForm = { date: '', multiplier: '', reason: '', reason_en: '', is_active: true }
const emptyBulkForm = { from_date: '', to_date: '', multiplier: '', reason: '' }

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

const toDateKey = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const buildDateRange = (from, to) => {
  const dates = []
  const cur = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (cur <= end) {
    dates.push(toDateKey(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export default function PriceOverridesPage() {
  const [data, setData]     = useState([])
  const [total, setTotal]   = useState(0)
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const [year, setYear]     = useState(CURRENT_YEAR)
  const [activeFilter, setActiveFilter] = useState('all') // all | true | false
  const [loading, setLoading] = useState(false)
  const [modal, setModal]   = useState(null) // create | edit | bulk
  const [editData, setEditData] = useState(null)
  const [form, setForm]     = useState(emptyForm)
  const [bulkForm, setBulkForm] = useState(emptyBulkForm)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const params = { month, year }
    if (activeFilter !== 'all') params.active = activeFilter
    getPriceOverrides(params)
      .then(r => {
        setData(r.data?.data || [])
        setTotal(r.data?.total || 0)
      })
      .catch(() => { setData([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [month, year, activeFilter])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm(emptyForm); setError(''); setEditData(null); setModal('create') }
  const openEdit = (o) => {
    setEditData(o)
    setForm({
      date: o.date ? o.date.slice(0, 10) : '',
      multiplier: o.multiplier ?? '',
      reason: o.reason || '',
      reason_en: o.reason_en || '',
      is_active: o.is_active,
    })
    setError('')
    setModal('edit')
  }
  const openBulk = () => { setBulkForm(emptyBulkForm); setError(''); setModal('bulk') }

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setBulkField = (k, v) => setBulkForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (modal === 'create') {
        await createPriceOverride({
          date: form.date,
          multiplier: Number(form.multiplier),
          reason: form.reason,
          reason_en: form.reason_en,
          is_active: form.is_active,
        })
      } else {
        await updatePriceOverride(editData.id, {
          multiplier: Number(form.multiplier),
          reason: form.reason,
          reason_en: form.reason_en,
          is_active: form.is_active,
        })
      }
      setModal(null); load()
    } catch (e) { setError(e.response?.data?.error || 'Lỗi khi lưu') }
    finally { setSaving(false) }
  }

  const handleBulkSave = async () => {
    setError('')
    if (!bulkForm.from_date || !bulkForm.to_date || !bulkForm.multiplier) {
      setError('Vui lòng nhập đủ khoảng ngày và hệ số nhân'); return
    }
    if (bulkForm.from_date > bulkForm.to_date) {
      setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc'); return
    }

    setSaving(true)
    try {
      const dates = buildDateRange(bulkForm.from_date, bulkForm.to_date)
      const overrides = dates.map(date => ({
        date, multiplier: Number(bulkForm.multiplier), reason: bulkForm.reason,
      }))
      const r = await bulkCreatePriceOverrides({ overrides })
      if (r.data?.failed) {
        setError(`Đã tạo ${r.data.created}/${overrides.length} ngày, ${r.data.failed} lỗi`)
      }
      setModal(null); load()
    } catch (e) { setError(e.response?.data?.error || 'Lỗi khi tạo hàng loạt') }
    finally { setSaving(false) }
  }

  const handleToggleActive = async (o) => {
    try { await updatePriceOverride(o.id, { is_active: !o.is_active }); load() }
    catch (e) { alert(e.response?.data?.error || 'Lỗi') }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Xác nhận xoá price override này?')) return
    try { await deletePriceOverride(id); load() }
    catch (e) { alert(e.response?.data?.error || 'Lỗi') }
  }

  const bulkDayCount = (bulkForm.from_date && bulkForm.to_date && bulkForm.from_date <= bulkForm.to_date)
    ? buildDateRange(bulkForm.from_date, bulkForm.to_date).length
    : 0

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}><LuTrendingUp size={18}/> Điều chỉnh giá theo ngày</div>
          <div className="page-subtitle">{total} override trong tháng {month}/{year}</div>
        </div>
        <div className="header-right" style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={openBulk} style={{ display:'flex', alignItems:'center', gap:6 }}><LuCopyPlus size={15}/> Thêm hàng loạt</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Thêm override</button>
        </div>
      </div>

      <div className="page-content">
        <div className="toolbar">
          <div className="form-group" style={{ minWidth: 120 }}>
            <select className="form-control" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map(m => <option key={m} value={m}>Tháng {m}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 100 }}>
            <select className="form-control" value={year} onChange={e => setYear(Number(e.target.value))}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 140 }}>
            <select className="form-control" value={activeFilter} onChange={e => setActiveFilter(e.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="true">Đang bật</option>
              <option value="false">Đang tắt</option>
            </select>
          </div>
          <button className="btn btn-secondary btn-sm ml-auto" style={{ display:'flex', alignItems:'center', gap:5 }} onClick={load}><LuRefreshCw size={14}/> Làm mới</button>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : data.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><LuTrendingUp size={36}/></div><div className="empty-text">Không có override nào trong tháng này</div></div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Hệ số nhân</th>
                  <th>Lý do</th>
                  <th>Trạng thái</th>
                  <th>Tạo bởi</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {data.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{fmtDate(o.date)}</td>
                    <td>
                      <span className={`badge ${parseFloat(o.multiplier) >= 1.2 ? 'badge-warning' : parseFloat(o.multiplier) < 1 ? 'badge-info' : 'badge-muted'}`}>
                        ×{parseFloat(o.multiplier).toFixed(2)}
                      </span>
                    </td>
                    <td>{o.reason || '—'}</td>
                    <td>
                      {o.is_active
                        ? <span className="badge badge-success" style={{ display:'inline-flex', alignItems:'center', gap:4 }}><LuCheck size={12}/> Bật</span>
                        : <span className="badge badge-muted" style={{ display:'inline-flex', alignItems:'center', gap:4 }}><LuX size={12}/> Tắt</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{o.created_by_email || '—'}</td>
                    <td>
                      <div className="action-btns">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(o)}><LuPencil size={14}/></button>
                        <button
                          className="btn btn-sm"
                          style={{ background: o.is_active ? 'var(--warning-bg)' : 'var(--success-bg)', color: o.is_active ? 'var(--warning)' : 'var(--success)', border: '1px solid currentColor' }}
                          onClick={() => handleToggleActive(o)}
                        >
                          {o.is_active ? <LuBan size={14}/> : <LuCheck size={14}/>}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(o.id)}><LuTrash2 size={14}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title" style={{ display:'flex', alignItems:'center', gap:6 }}>{modal === 'create' ? '+ Thêm override' : <><LuPencil size={15}/> Cập nhật override</>}</div>
              <button className="modal-close" onClick={() => setModal(null)}><LuX size={18}/></button>
            </div>

            {error && <div className="alert alert-error" style={{ display:'flex', alignItems:'center', gap:6 }}><LuTriangleAlert size={15}/> {error}</div>}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Ngày *</label>
                <input className="form-control" type="date" value={form.date} disabled={modal === 'edit'}
                  onChange={e => setField('date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Hệ số nhân *</label>
                <input className="form-control" type="number" step="0.01" min="0.01" value={form.multiplier}
                  onChange={e => setField('multiplier', e.target.value)} placeholder="1.30" />
              </div>
              <div className="form-group full">
                <label className="form-label">Lý do</label>
                <input className="form-control" value={form.reason} onChange={e => setField('reason', e.target.value)} placeholder="Lễ 30/4 - 1/5" />
              </div>
              <div className="form-group full">
                <label className="form-label">Lý do (English)</label>
                <input className="form-control" value={form.reason_en} onChange={e => setField('reason_en', e.target.value)} placeholder="Apr 30 - May 1 holiday" />
              </div>
              <div className="form-group full">
                <label className="form-label" style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setField('is_active', e.target.checked)} />
                  Kích hoạt override này
                </label>
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

      {modal === 'bulk' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title" style={{ display:'flex', alignItems:'center', gap:6 }}><LuCopyPlus size={15}/> Thêm override hàng loạt</div>
              <button className="modal-close" onClick={() => setModal(null)}><LuX size={18}/></button>
            </div>

            {error && <div className="alert alert-error" style={{ display:'flex', alignItems:'center', gap:6 }}><LuTriangleAlert size={15}/> {error}</div>}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Từ ngày *</label>
                <input className="form-control" type="date" value={bulkForm.from_date} onChange={e => setBulkField('from_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Đến ngày *</label>
                <input className="form-control" type="date" value={bulkForm.to_date} onChange={e => setBulkField('to_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Hệ số nhân *</label>
                <input className="form-control" type="number" step="0.01" min="0.01" value={bulkForm.multiplier}
                  onChange={e => setBulkField('multiplier', e.target.value)} placeholder="1.30" />
              </div>
              <div className="form-group">
                <label className="form-label">Lý do</label>
                <input className="form-control" value={bulkForm.reason} onChange={e => setBulkField('reason', e.target.value)} placeholder="Cao điểm Tết Nguyên Đán" />
              </div>
              {bulkDayCount > 0 && (
                <div className="form-group full" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Sẽ áp dụng cho <b>{bulkDayCount}</b> ngày (từ {fmtDate(bulkForm.from_date)} đến {fmtDate(bulkForm.to_date)}).
                  Override đã có ở các ngày này sẽ bị ghi đè.
                </div>
              )}
            </div>

            <div className="form-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn btn-primary" onClick={handleBulkSave} disabled={saving}>
                {saving ? <><LuHourglass size={14}/> Đang lưu...</> : <><LuSave size={14}/> Tạo hàng loạt</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
