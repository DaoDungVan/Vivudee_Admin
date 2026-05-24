import { useState, useEffect, useCallback, useRef } from 'react'
import { getAirports, createAirport, updateAirport, updateAirportStatus } from '../api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { LuBuilding2, LuSearch, LuRefreshCw, LuPencil, LuCheck, LuLock, LuX, LuTriangleAlert, LuHourglass, LuSave } from 'react-icons/lu'

const empty = { code: '', name: '', city: '', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' }
const SEARCH_FETCH_LIMIT = 500

const matchesAirportSearch = (airport, keyword) => {
  const q = keyword.toLowerCase()
  return [airport.code, airport.name, airport.city, airport.country, airport.timezone]
    .some(value => String(value || '').toLowerCase().includes(q))
}

export default function AirportsPage() {
  const [data, setData]           = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 })
  const [page, setPage]           = useState(1)
  const [limit]                   = useState(15)
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [modal, setModal]         = useState(null)
  const [editItem, setEditItem]   = useState(null)
  const [form, setForm]           = useState(empty)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const requestIdRef              = useRef(0)
  const debouncedSearch           = useDebouncedValue(search)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    const keyword = debouncedSearch.trim()
    const searching = keyword.length > 0

    setLoading(true)
    getAirports({
      page: searching ? 1 : page,
      limit: searching ? SEARCH_FETCH_LIMIT : limit,
    })
      .then(r => {
        if (requestId !== requestIdRef.current) return
        const d = r.data
        const items = d.data || []

        if (searching) {
          const filtered = items.filter(item => matchesAirportSearch(item, keyword))
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
  }, [page, limit, debouncedSearch])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm(empty); setError(''); setModal('create'); setEditItem(null) }
  const openEdit   = (a) => { setEditItem(a); setForm({ code: a.code, name: a.name, city: a.city, country: a.country, timezone: a.timezone }); setError(''); setModal('edit') }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (modal === 'create') await createAirport(form)
      else await updateAirport(editItem.id, form)
      setModal(null); load()
    } catch (e) { setError(e.response?.data?.error || 'Lỗi khi lưu') }
    finally { setSaving(false) }
  }

  const toggleStatus = async (a) => {
    try { await updateAirportStatus(a.id, !a.is_active); load() }
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
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}><LuBuilding2 size={18}/> Quản lý sân bay</div>
          <div className="page-subtitle">{total} sân bay trong hệ thống</div>
        </div>
        <div className="header-right">
          <button className="btn btn-primary" onClick={openCreate}>+ Thêm sân bay</button>
        </div>
      </div>

      <div className="page-content">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon"><LuSearch size={16}/></span>
            <input placeholder="Tìm theo tên, mã, thành phố..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <button className="btn btn-secondary btn-sm ml-auto" style={{ display:'flex', alignItems:'center', gap:5 }} onClick={load}><LuRefreshCw size={14}/> Làm mới</button>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : data.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><LuBuilding2 size={36}/></div><div className="empty-text">Không tìm thấy sân bay</div></div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Mã IATA</th><th>Tên sân bay</th><th>Thành phố</th><th>Quốc gia</th><th>Múi giờ</th><th>Trạng thái</th><th>Hành động</th></tr>
                </thead>
                <tbody>
                  {data.map(a => (
                    <tr key={a.id}>
                      <td><span className="td-mono">{a.code}</span></td>
                      <td style={{ fontWeight: 500 }}>{a.name}</td>
                      <td>{a.city}</td>
                      <td>{a.country}</td>
                      <td><span className="text-mono" style={{ fontSize: 12 }}>{a.timezone}</span></td>
                      <td><span className={`badge ${a.is_active ? 'badge-success' : 'badge-danger'}`} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>{a.is_active ? <><LuCheck size={12}/> Hoạt động</> : <><LuX size={12}/> Dừng</>}</span></td>
                      <td>
                        <div className="action-btns">
                          <button className="btn btn-secondary btn-sm" style={{ display:'flex', alignItems:'center', gap:4 }} onClick={() => openEdit(a)}><LuPencil size={13}/> Sửa</button>
                          <button className={`btn btn-sm ${a.is_active ? 'btn-danger' : 'btn-success'}`} style={{ display:'flex', alignItems:'center', gap:4 }} onClick={() => toggleStatus(a)}>
                            {a.is_active ? <><LuLock size={13}/> Dừng</> : <><LuCheck size={13}/> Kích hoạt</>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <div className="pagination-info">Trang {page} / {total_pages} · Tổng {total} sân bay</div>
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
              <div className="modal-title" style={{ display:'flex', alignItems:'center', gap:6 }}>{modal==='create'?'+ Thêm sân bay':<><LuPencil size={15}/> Cập nhật sân bay</>}</div>
              <button className="modal-close" onClick={() => setModal(null)}><LuX size={18}/></button>
            </div>
            {error && <div className="alert alert-error" style={{ display:'flex', alignItems:'center', gap:6 }}><LuTriangleAlert size={15}/> {error}</div>}
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Mã IATA *</label><input className="form-control" value={form.code} onChange={e=>sf('code',e.target.value.toUpperCase())} placeholder="SGN" maxLength={10} /></div>
              <div className="form-group"><label className="form-label">Tên sân bay *</label><input className="form-control" value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="Tân Sơn Nhất" /></div>
              <div className="form-group"><label className="form-label">Thành phố *</label><input className="form-control" value={form.city} onChange={e=>sf('city',e.target.value)} placeholder="Hồ Chí Minh" /></div>
              <div className="form-group"><label className="form-label">Quốc gia</label><input className="form-control" value={form.country} onChange={e=>sf('country',e.target.value)} placeholder="Vietnam" /></div>
              <div className="form-group full"><label className="form-label">Múi giờ</label><input className="form-control" value={form.timezone} onChange={e=>sf('timezone',e.target.value)} placeholder="Asia/Ho_Chi_Minh" /></div>
            </div>
            <div className="form-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Huỷ</button>
              <button className="btn btn-primary" style={{ display:'flex', alignItems:'center', gap:6 }} onClick={handleSave} disabled={saving}>{saving?<><LuHourglass size={14}/> Đang lưu...</>:<><LuSave size={14}/> Lưu</>}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
