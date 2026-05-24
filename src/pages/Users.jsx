import { useState, useEffect, useCallback, useRef } from 'react'
import { getUsers, getUserById, updateUserStatus, updateUserRole } from '../api'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { LuUsers, LuSearch, LuRefreshCw, LuEye, LuX, LuUser, LuChevronRight } from 'react-icons/lu'

const SEARCH_FETCH_LIMIT = 500

const matchesUserSearch = (user, keyword) => {
  const q = keyword.toLowerCase()
  return [user.id, user.full_name, user.email, user.phone]
    .some(value => String(value || '').toLowerCase().includes(q))
}

const ROLES    = ['customer', 'staff', 'admin']
const STATUSES = ['active', 'inactive', 'blocked']
const ROLE_BADGE   = { admin: 'badge-danger', staff: 'badge-warning', customer: 'badge-info' }
const STATUS_BADGE = { active: 'badge-success', inactive: 'badge-muted', blocked: 'badge-danger' }
const ROLE_LABEL   = { admin: 'Quản trị viên', staff: 'Nhân viên', customer: 'Khách hàng' }
const STATUS_LABEL = { active: 'Hoạt động', inactive: 'Không hoạt động', blocked: 'Bị khoá' }

export default function UsersPage() {
  const [data, setData]             = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 })
  const [page, setPage]             = useState(1)
  const [limit]                     = useState(15)
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [filterRole, setFilterRole]         = useState('')
  const [filterStatus, setFilterStatus]     = useState('')
  const [detail, setDetail]         = useState(null)
  const [detailLoading, setDetailLoading]   = useState(false)
  const requestIdRef                = useRef(0)
  const debouncedSearch             = useDebouncedValue(search)

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current
    const keyword = debouncedSearch.trim()
    const searching = keyword.length > 0

    setLoading(true)
    getUsers({
      page: searching ? 1 : page,
      limit: searching ? SEARCH_FETCH_LIMIT : limit,
      role: filterRole || undefined,
      status: filterStatus || undefined,
    })
      .then(r => {
        if (requestId !== requestIdRef.current) return
        const d = r.data
        const items = d.data || []

        if (searching) {
          const filtered = items.filter(item => matchesUserSearch(item, keyword))
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
  }, [page, limit, debouncedSearch, filterRole, filterStatus])

  useEffect(() => { load() }, [load])

  const openDetail = async (u) => {
    setDetail(u); setDetailLoading(true)
    try { const r = await getUserById(u.id); setDetail(r.data.data || r.data) }
    catch { setDetail(u) }
    finally { setDetailLoading(false) }
  }

  const handleStatus = async (id, status) => {
    try { await updateUserStatus(id, status); load(); if (detail?.id === id) setDetail(p => ({ ...p, status })) }
    catch (e) { alert(e.response?.data?.error || 'Lỗi') }
  }

  const handleRole = async (id, role) => {
    try { await updateUserRole(id, role); load(); if (detail?.id === id) setDetail(p => ({ ...p, role })) }
    catch (e) { alert(e.response?.data?.error || 'Lỗi') }
  }

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
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}><LuUsers size={18}/> Quản lý người dùng</div>
          <div className="page-subtitle">{total} tài khoản trong hệ thống</div>
        </div>
      </div>

      <div className="page-content">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon"><LuSearch size={16}/></span>
            <input placeholder="Tìm tên, email, SĐT..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="filter-select" value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1) }}>
            <option value="">Tất cả vai trò</option>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <select className="filter-select" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
            <option value="">Tất cả trạng thái</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm ml-auto" style={{ display:'flex', alignItems:'center', gap:5 }} onClick={load}><LuRefreshCw size={14}/> Làm mới</button>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : data.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><LuUsers size={36}/></div><div className="empty-text">Không tìm thấy người dùng</div></div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th><th>Họ tên</th><th>Email</th><th>SĐT</th>
                    <th>Vai trò</th><th>Trạng thái</th><th>Email xác thực</th><th>Ngày tạo</th><th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(u => (
                    <tr key={u.id}>
                      <td><span className="td-mono">#{u.id}</span></td>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{u.full_name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td style={{ fontSize: 12 }}>{u.phone || '—'}</td>
                      <td>
                        <select className="filter-select" style={{ padding: '4px 8px', fontSize: 12 }} value={u.role} onChange={e => handleRole(u.id, e.target.value)}>
                          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="filter-select" style={{ padding: '4px 8px', fontSize: 12 }} value={u.status} onChange={e => handleStatus(u.id, e.target.value)}>
                          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${u.email_verified ? 'badge-success' : 'badge-warning'}`}>
                          {u.email_verified ? '✓ Xác thực' : '! Chưa'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" style={{ display:'flex', alignItems:'center', gap:4 }} onClick={() => openDetail(u)}><LuEye size={13}/> Chi tiết</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <div className="pagination-info">Trang {page} / {total_pages} · Tổng {total} người dùng</div>
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

      {detail && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&setDetail(null)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display:'flex', alignItems:'center', gap:6 }}><LuUser size={16}/> Chi tiết người dùng #{detail.id}</div>
              <button className="modal-close" onClick={() => setDetail(null)}><LuX size={18}/></button>
            </div>
            {detailLoading ? <div className="loading-wrap"><div className="spinner" /></div> : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,var(--accent),#0052cc)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, margin: '0 auto 12px' }}>
                    {detail.full_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{detail.full_name}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{detail.email}</div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
                    <span className={`badge ${ROLE_BADGE[detail.role]||'badge-muted'}`}>{ROLE_LABEL[detail.role]||detail.role}</span>
                    <span className={`badge ${STATUS_BADGE[detail.status]||'badge-muted'}`}>{STATUS_LABEL[detail.status]||detail.status}</span>
                  </div>
                </div>
                {[
                  ['SĐT', detail.phone || '—'],
                  ['Email xác thực', detail.email_verified ? '✓ Đã xác thực' : '✕ Chưa'],
                  ['Đăng nhập gần nhất', detail.last_login_at ? new Date(detail.last_login_at).toLocaleString('vi-VN') : '—'],
                  ['Số lần đăng nhập sai', detail.failed_login_attempts ?? 0],
                  ['Khoá đến', detail.locked_until ? new Date(detail.locked_until).toLocaleString('vi-VN') : '—'],
                  ['Ngày tạo', detail.created_at ? new Date(detail.created_at).toLocaleString('vi-VN') : '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                    <span style={{ fontWeight: 500 }}>{String(v)}</span>
                  </div>
                ))}
                <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {STATUSES.filter(s => s !== detail.status).map(s => (
                    <button key={s} className={`btn btn-sm ${s==='blocked'?'btn-danger':s==='active'?'btn-success':'btn-secondary'}`} style={{ display:'flex', alignItems:'center', gap:4 }} onClick={() => handleStatus(detail.id, s)}><LuChevronRight size={13}/> {STATUS_LABEL[s] || s}</button>
                  ))}
                  {ROLES.filter(r => r !== detail.role).map(r => (
                    <button key={r} className="btn btn-secondary btn-sm" style={{ display:'flex', alignItems:'center', gap:4 }} onClick={() => handleRole(detail.id, r)}>Vai trò <LuChevronRight size={13}/> {ROLE_LABEL[r] || r}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
