# Hệ thống Realtime & WebSockets API

Hệ thống Vibly sử dụng **[Socket.IO](https://socket.io/)** kế hợp với **Redis Adapter** để mở rộng (scale) đa máy chủ nhưng vẫn đảm bảo event được truyền tải thông suốt.

---

## 1. Phương Thức Kết Nối Tổng Quan (Connection)

- **Endpoint gốc**: `ws://<domain-backend>/`
- **Authentication**: Auth Header hoặc Token nhét ở `query / auth param`. Token hợp lệ mới cho phép giữ connection, bắt buộc dùng `Access_Token` dạng JWT chuẩn hóa.

---

## 2. Các Gateways (Endpoints WebSockets)

### 2.1. Presence Gateway (`/presence`)
Quản lý trạng thái Trực Tuyến của bạn bè (Online/Offline/Last Seen).

- **Client Emit Events**:
  - Tự động Tracking: Client không cần gửi gì, khi connect thành công Server tự set `isOnline = true`. Khi disconnect (đóng app, rớt mạng), Server sẽ đánh `lastSeenAt`.

- **Client Listen Events (Nhận từ Server)**:
  - `presence:status_changed`: Bắn về trạng thái bạn bè vừa thay đổi để UI sáng/tắt đèn xanh lá.
    - Payload: `{ userId: string, isOnline: boolean, lastSeenAt?: string }`.

### 2.2. Messages & Chat Gateway (`/messages` hoặc chung `/`)
Trái tim của tính năng Chat Realtime inbox.

- **Client Emit Events (Gửi lên Server)**:
  - `message:send`: Khi user bấm gửi tin. Payload: `{ conversationId: string, content: string }`.
  - `message:typing`: Báo đang gõ chữ. Payload: `{ conversationId: string, isTyping: true }`.
  - `message:read`: Đánh dấu đã đọc tới vị trí tin nhắn id đó.

- **Client Listen Events (Nhận từ Server)**:
  - `message:new`: Có tin nhắn mới bay tới.
  - `message:typing`: Hiển thị "User A đang gõ...".
  - `message:read_receipt`: Nhận báo cáo User kia "Đã xem".

### 2.3. Notifications Gateway (`/notifications`)
Quản lý đẩy quả chuông thông báo toàn cục trên Web/App.

- **Client Listen Events**:
  - `notification:new`: Khi có người thả tim, bình luận bài viết, gửi lời mời kết bạn.
    - Payload: `{ id, type, title, body, actorUserId, ... }`. UI tự động tăng số đếm quả chuông `+1`.

### 2.4. Calls RTC Signaling (`/calls`)
Phối hợp đồng thời rẽ nhánh cùng LiveKit Server. Websocket này chỉ dùng để "Mời gọi" và "Trạng thái điện thoại".

- **Client Emit Events**:
  - `call:initiate`: Xin cấp phép 1 token kết nối LiveKit và bắt đầu gọi.
  - `call:accept` / `call:reject`: Bắt máy / Từ chối (Tắt máy).

- **Client Listen Events**:
  - `call:incoming`: Hiện màn hình Pop-up có người đang rung chuông gọi đến.
  - `call:answered` / `call:ended`: Lắng nghe đối phương đã nhấc máy hay hủy cuộc gọi.

---

## 3. Kiến Trúc Phát Tán (Redis Pub/Sub)

Vì mạng xã hội đòi hỏi lưu lượng lớn, nếu chạy 5 con Server Node.js song song:
- User A kết nối Node 1. User B kết nối Node 2. 
- Khi A nhắn cho B qua Socket, Server 1 sẽ bắn Message Event vào **[Redis Pub/Sub]**.
- Node 2 quét thấy Event ở kênh của B, lập tức lấy dữ liệu và trả xuống Websocket của B.
=> Đây là mấu chốt của Hệ thống Chat Quy Mô Lớn (High Concurrency Chat).
