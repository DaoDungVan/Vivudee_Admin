# VivuDee Admin UI

Giao diện quản trị cho hệ thống đặt vé máy bay VivuDee.

## Yêu cầu

- Node.js >= 18
- Backend đang chạy tại `http://localhost:3000`

## Cài đặt & Chạy

```bash
# Cài dependencies
npm install

# Chạy development server
npm run dev
```

Mở trình duyệt: http://localhost:5173

## Build production

```bash
npm run build
npm run preview
```

## Tính năng

| Module | Chức năng |
|--------|-----------|
| 📊 Dashboard | Thống kê tổng quan, biểu đồ theo kỳ |
| ✈️ Chuyến bay | CRUD, đổi trạng thái, ẩn/hiện |
| 🏢 Sân bay | CRUD, kích hoạt/dừng |
| 🛫 Hãng bay | CRUD, logo, kích hoạt/dừng |
| 👥 Người dùng | Xem danh sách, filter, đổi role/status |
| 🎫 Đặt vé | Xem chi tiết, cập nhật trạng thái booking |

## Cấu hình API

File `vite.config.js` đã cấu hình proxy:
- `/api` → `http://localhost:3000`

Nếu backend chạy cổng khác, sửa trong `vite.config.js`.

## Đăng nhập

Dùng tài khoản admin có `role = 'admin'` trong database.
Tạo admin bằng script: `node scripts/seedAdmin.js` (từ thư mục backend).
