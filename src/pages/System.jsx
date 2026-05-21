import { useState } from 'react'
import { runLoyaltyRecalc, runExpiredBookings, runCronJob } from '../api'

export default function SystemPage() {
  const [cronLoading, setCronLoading] = useState('')
  const [cronMsg, setCronMsg]         = useState('')

  const runCron = async (label, fn) => {
    setCronLoading(label)
    setCronMsg('')
    try {
      const res = await fn()
      setCronMsg({ ok: true, text: `✓ ${label}: ${res.data?.message || 'Thành công'}` })
    } catch (e) {
      setCronMsg({ ok: false, text: `✗ ${label}: ${e.response?.data?.error || e.response?.data?.message || 'Lỗi'}` })
    } finally {
      setCronLoading('')
      setTimeout(() => setCronMsg(''), 8000)
    }
  }

  const tools = [
    {
      icon: '🏅',
      title: 'Đồng bộ hạng thành viên',
      badge: 'An toàn — chạy bất kỳ lúc nào',
      badgeColor: '#16a34a',
      desc: 'Kiểm tra và sửa lại hạng (Member / Silver / Gold / Platinum) cho toàn bộ thành viên dựa theo điểm tích lũy hiện tại. Không trừ hay cộng điểm, chỉ cập nhật hạng nếu đang bị sai.',
      when: 'Dùng khi: phát hiện thành viên có hạng không khớp với điểm, sau khi fix bug liên quan đến điểm.',
      label: 'Chạy đồng bộ',
      fn: runLoyaltyRecalc,
    },
    {
      icon: '⌛',
      title: 'Hủy booking quá hạn thanh toán',
      badge: 'An toàn — chạy bất kỳ lúc nào',
      badgeColor: '#16a34a',
      desc: 'Tự động hủy (expire) các đơn đặt vé đang chờ thanh toán mà đã quá thời hạn giữ chỗ. Bình thường hệ thống tự xử lý, dùng nút này khi cần cập nhật ngay lập tức.',
      when: 'Dùng khi: thấy có booking "chờ thanh toán" đã hết hạn nhưng chưa bị hủy tự động.',
      label: 'Chạy ngay',
      fn: runExpiredBookings,
    },
    {
      icon: '▶',
      title: 'Chạy cả 2 tác vụ trên cùng lúc',
      badge: 'An toàn — chạy bất kỳ lúc nào',
      badgeColor: '#16a34a',
      desc: 'Thực hiện đồng thời: đồng bộ hạng thành viên + hủy booking quá hạn. Không bao gồm reset điểm hàng năm (tác vụ đó chỉ chạy tự động vào 1/1).',
      when: 'Dùng khi: muốn làm sạch dữ liệu nhanh mà không cần chạy từng tác vụ một.',
      label: 'Chạy cả 2',
      fn: () => runCronJob('all'),
    },
    {
      icon: '⚠️',
      title: 'Reset điểm hạng hàng năm (1/1)',
      badge: 'Cẩn thận — chỉ dùng khi thật sự cần',
      badgeColor: '#d97706',
      desc: 'Trừ 20% điểm hạng của toàn bộ thành viên — đây là tác vụ đánh giá cuối năm. Hệ thống tự động chạy vào lúc 00:00 ngày 1/1. Chỉ chạy thủ công khi được yêu cầu cụ thể.',
      when: '⚠️ KHÔNG chạy bừa — sẽ trừ điểm tất cả thành viên ngay lập tức.',
      label: 'Chạy reset',
      fn: () => runCronJob('loyalty_annual_reset'),
    },
  ]

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-title">⚙️ Công cụ hệ thống</div>
          <div className="page-subtitle">Quản lý các tác vụ nền và tính toán lại dữ liệu hệ thống</div>
        </div>
      </div>

      {cronMsg && (
        <div className={`alert ${cronMsg.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: 24, fontSize: 14 }}>
          {cronMsg.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tools.map((tool) => (
          <div key={tool.label} className="card" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1 }}>
              <div style={{ fontSize: 26, lineHeight: 1, flexShrink: 0, paddingTop: 3 }}>{tool.icon}</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{tool.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: tool.badgeColor, background: `${tool.badgeColor}18`, border: `1px solid ${tool.badgeColor}40`, borderRadius: 20, padding: '1px 8px' }}>
                    {tool.badge}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>{tool.desc}</div>
                <div style={{ fontSize: 12, color: tool.badgeColor, fontWeight: 500 }}>{tool.when}</div>
              </div>
            </div>
            <button
              className={`btn btn-sm ${tool.badgeColor === '#d97706' ? 'btn-warning' : 'btn-secondary'}`}
              style={{ flexShrink: 0, minWidth: 110, marginTop: 2 }}
              disabled={!!cronLoading}
              onClick={() => runCron(tool.title, tool.fn)}
            >
              {cronLoading === tool.title ? 'Đang chạy...' : tool.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
