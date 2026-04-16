<br />
<div align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
  <h1 align="center">Vibly Social Backend API</h1>
  <p align="center">
    <strong>Hệ thống Backend mạng xã hội thời gian thực (Real-time Social Network)</strong>
  </p>
  <p align="center">
    <i>Xây dựng trên nền tảng Node.js, NestJS, Prisma, PostgreSQL và LiveKit</i>
  </p>
</div>

---

## 📖 Giới thiệu Dự án (Introduction)

**Vibly** không chỉ là một ứng dụng REST API thông thường, mà là một nền tảng Back-end hoàn chỉnh phục vụ cho một mạng xã hội đa chức năng. Hệ thống được thiết kế theo hướng **Modular Monolith**, cho phép scale (mở rộng) dễ dàng và bảo trì mã nguồn chuẩn mực đáp ứng bài toán lượng truy cập lớn (high scalability).

Hệ thống cung cấp toàn bộ các nghiệp vụ phức tạp của một Social App bao gồm:
- **Tường nhà (Newsfeed) & Bài viết**: Hệ thống Newsfeed dùng Cursor Pagination siêu tốc, hỗ trợ Thả cảm xúc (Reactions) nhiều trạng thái và Bình luận đa tầng.
- **Tương tác Bạn Bè**: Kết bạn, hủy kết bạn, đồng ý/từ chối, Tracking Trạng thái Online (Presence) theo thời gian thực.
- **Chat Thời Gian Thực**: Hộp thoại Inbox (Direct & Group), chat Socket.IO với độ trễ thấp nhất.
- **Media RTC (Voice/Video Call)**: Hoạt động song song với hạ tầng LiveKit mạnh mẽ hỗ trợ gọi nhóm, gọi 1-1 giống Messenger/Discord.
- **Quản lý Tệp Quy Mô Lớn**: Tối ưu băng thông Server bằng cơ chế cấp quyền Direct Upload Presigned URL cho AWS S3. Bỏ qua hoàn toàn gánh nặng trung chuyển file.

---

## 🏗 Kiến Trúc Kỹ Thuật (Architecture & Tech Stack)

### Core Technologies
- **Framework**: [NestJS (v11)](https://nestjs.com/) - Framework Node.js TypeScript xịn sò nhất hiện tại.
- **Database**: **PostgreSQL** thông qua **[Prisma ORM](https://www.prisma.io/)** (Type-safe & Auto Migration).
- **Caching & Queue**: **Redis** (Pub/Sub cho Socket, lưu trữ Session & Tracking Presence).
- **RTC Engine**: **LiveKit Server** (Module điều phối WebRTC cho Video/Audio).
- **Storage**: **AWS S3 / R2** (Dùng AWS SDK v3 cho Object Storage).
- **Bảo mật**: JWT (JSON Web Token) kết hợp kiến trúc Access Token (Bearer) + Refresh Token (HttpOnly Cookie) chống CSRF và XSS. Throttler chống brute-force đăng nhập.

### Cấu Trúc Nguồn (`src/`)

```plaintext
src/
├── common/             # Tầng dùng chung không mang nghiệp vụ (Shared Layer)
│   ├── decorators/     # Custom Decorators (@CurrentUser, @Roles...)
│   ├── filters/        # Global Exception Filters (Quy chuẩn response lỗi)
│   ├── guards/         # RBAC, JWT Auth Guards chặn Request lạ
│   └── interceptors/   # Global Response Interceptors (Map data sang chuẩn { success, data })
├── config/             # Cấu hình biến môi trường và thiết lập chung
├── database/           # Prisma Client Service & Seed dữ liệu gốc
├── modules/            # Tầng Nghiệp vụ cốt lõi (Domain-Driven Design hards)
│   ├── auth/           # Đăng nhập, Cookie Session, Webhooks
│   ├── users/          # Truy xuất, tìm kiếm, sửa profile
│   ├── posts/          # Newsfeed algorithm, Reactions, Comments
│   ├── conversations/  # Luồng chat, Message Delivery
│   ├── calls/          # Trình kết nối LiveKit token cấp phát room
│   ├── media/          # Issue S3 Link và Verify File Ready
│   ├── notifications/  # Bell Notifications push 
│   ├── moderation/     # Report lạm dụng & Ban users dành cho Admin
│   └── admin/          # RBAC Admin Panel API
├── app.module.ts       # ROOT Module kết dính mọi DI Container
└── main.ts             # Điểm khởi chạy Bootstrap Server
```

---

## ⚙️ Yêu cầu trước khi Cài Đặt (Prerequisites)

Dự án yêu cầu máy tính của bạn phải có sẵn các phần mềm sau:
1. **Node.js**: Phiên bản `v20.x` hoặc `v22.x` (LTS khuyến nghị).
2. **PNPM**: Package Manager chính (`npm install -g pnpm`).
3. **Cơ sở dữ liệu**: PostgreSQL chạy ngầm ở localhost (Port 5432).
4. **Redis**: Redis server chạy local hoặc qua Docker (Port 6379).
5. *(Tùy chọn)* Tài khoản LiveKit Cloud / AWS S3 nếu muốn test mảng hình ảnh và Video Call.

---

## 🚀 Hướng Dẫn Cài Đặt (Step-by-Step Setup Local)

Làm theo đúng trình tự để có thể start được backend.

### 1. Cài đặt các gói phụ thuộc (Dependencies)
```bash
pnpm install
```

### 2. Cấu hình Biến Môi Trường (Environment Variables)
Sao chép file `.env.example` thành file `.env` chạy thật:

```bash
cp .env.example .env
```

**Mở file `.env` vừa sinh ra và điền thông số:**
- `DATABASE_URL`: Đường dẫn URL kết nối đến DB PostgreSQL của bạn.
  *(Ví dụ: `postgresql://postgres:123456@localhost:5432/vibly_db?schema=public`)*
- `REDIS_URL`: Chuỗi kết nối redis (Ví dụ: `redis://localhost:6379`).
- `JWT_ACCESS_SECRET` & `JWT_REFRESH_SECRET`: Tạo một dãy string dài bí mật cho Token.

### 3. Đồng bộ Database Schema (Prisma)

Sau khi config xong DATABASE_URL, bạn tạo Client types và ép Cấu trúc vào Database:

```bash
# 1. Tạo Node Module TypeScript cho Prisma Client
pnpm prisma generate

# 2. Đồng bộ các bảng (Tables) thẳng vào PostgreSQL Database của bạn
pnpm prisma db push
```
*(Nếu muốn dùng cơ chế lịch sử version db, hãy chạy: `pnpm prisma migrate run`)*

### 4. Khởi chạy Ứng dụng Backend

```bash
# Chạy ở chế độ dành cho Lập Trình Viên (Theo dõi và Tự reload khi lưu file code)
pnpm start:dev
```
Nếu Terminal in ra dòng `🚀 Vibly API running on...`, chúc mừng bạn đã dựng backend thành công. Server mặc định chạy tại: **`http://localhost:8000/api/v1`**.

---

## 📚 Tài Liệu API & Kiến Trúc Xuyên Sâu

Chúng tôi đã soạn thảo các tài liệu kỹ thuật ở cấp độ Architecture để bạn có thể xem xét:

- 📊 **[Cấu trúc Cơ Sở Dữ Liệu & Entity Relationship (ERD)](docs/DATABASE.md)**
- ⚡ **[Chi tiết Hệ thống Socket & Realtime Events](docs/REALTIME.md)**

Hệ thống cũng được cài cắm **OpenAPI 3.0 (Swagger)** tích hợp sẵn.
👉 Mở trình duyệt web ấn vào link: **[http://localhost:8000/api/docs](http://localhost:8000/api/docs)**

---

## 💻 Danh Sách Các Lệnh (Scripts Command)

Bảng các lệnh thường xuyên thao tác trong dự án:

| Câu lệnh (pnpm) | Chức năng (Description) |
|-----------------|--------------------------|
| `pnpm start:dev` | Bật Dev Server xem code reload trực tiếp. |
| `pnpm build`    | Dịch TypeScript qua JavaScript tĩnh đẩy vào `/dist`. |
| `pnpm start:prod`| Chạy server bằng Production Script lấy bản Build. |
| `pnpm lint`     | Quét lỗi code bằng ESLint nguyên dự án. |
| `pnpm format`   | Tự động làm đẹp lại code bằng Prettier cho toàn bộ. |

---

## 🤝 Hướng Dẫn Định Chuẩn (Coding Guidelines)

Nếu bạn là Lập Trình Viên vào đóng góp dự án, hãy tuân theo các quy tắc khắt khe của hệ thống:
1. **Validation Chặt Nhất Chứ Không Lỏng Lẻo**: Mọi request body phải đi qua 1 Object Class `Xxx.dto.ts` có gắn cờ Class Validator (`@IsString()`) để loại trừ Injection.
2. **Controller Siêu Mỏng (Thin Controllers)**: Không bao giờ viết Logic tính toán bên trong file `.controller.ts`. Chỉ bắt HTTP lấy Payload gọi sang `.service.ts` xử lý.
3. **Phản hồi Đồng Nhất**: Bạn chỉ việc `return` Output, Global Interceptor sẽ tự động vẩy JSON thành `{ success: true, data: Output }`.
4. **Throw Exception Có Chủ Đích**: Hãy chủ động `throw new BadRequestException('Lỗi chi tiết...')` thay vì để Prisma quăng System Alert lỗi 500 ra Client.

<br />
<p align="center">Made with ❤️ for the Vibly Open-Source Team</p>
