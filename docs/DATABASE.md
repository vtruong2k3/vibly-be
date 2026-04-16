# Tư Liệu Cấu Trúc Cơ Sở Dữ Liệu (Database Architecture)

Tài liệu Deep-dive mô tả toàn bộ Schema và mối quan hệ (Entity-Relationship) của hệ thống Vibly Backend, được vận hành bởi **PostgreSQL** thông qua **Prisma ORM**.

---

## 1. Module Tài Khoản & Bảo Mật (Identity & Security)

### `User` (Bảng trung tâm hệ thống)
Mọi thực thể trong hệ thống đều ràng buộc trực tiếp hoặc gián tiếp tới User.
- **Tính chất**: Cung cấp xác thực đăng nhập (username, email, passwordHash).
- **Ràng buộc**: Liên kết 1-1 với `Profile`, `UserPresence`, `UserPrivacySettings`, `UserNotificationSettings`, `UserSecuritySettings`. Liên kết 1-N tới `Session`, `Post`, `Comment`, `Message`.

### `Profile` (Hồ sơ người dùng định danh)
- Tách biệt khỏi Account để tránh tải dữ liệu xác thực khi chỉ cần hiển thị UI.
- File media (`avatarMediaId`, `coverMediaId`) trỏ khóa ngoại (FK) về `MediaAsset`.

### `Session` (Phiên làm việc & Bảo mật)
- **Cơ chế Dual-Token**: Sinh ra cặp Access-Token (tuổi thọ ngắn) & Refresh-Token (tuổi thọ dài).
- Refresh Token hash được lưu cứng ở bảng này. Cho phép **Forced Logout** từ xa nếu tài khoản bị tấn công hoặc người dùng ấn "Đăng xuất khỏi thiết bị khác".

---

## 2. Module Nội Dung (Newsfeed & Social Graph)

### `Post` & `Comment`
- Cấu trúc cây bình luận (Tree) thông qua `parentCommentId` Self-referencing (Bình luận trả lời bình luận gốc).
- `ReactionCount`, `CommentCount` được lưu dạng Materialized/Counter để cache siêu tốc, thay vì dùng `COUNT(*)` khi query.

### `PostReaction` & `CommentReaction`
- Bảng Pivot chứa cặp Khóa chính ghép (Composite Key): `[postId, userId]`. Một user chỉ được chọn 1 trạng thái reaction duy nhất (LIKE, LOVE, HAHA, WOW, SAD, ANGRY).

### `FeedEdge` (Thuật toán Newsfeed)
- Dữ liệu hiển thị không query trực tiếp từ `Post` (do chi phí siêu đắt trên hệ thống hàng triệu user).
- **Cơ chế Feed Fan-out**: Khi A đăng bài, Backend sinh ra bảng `FeedEdge` cho tất cả bạn bè của A theo Background Job, kết hợp chỉ số `rankScore` để hiện ở Trang Chủ, hỗ trợ Pagination Cursor bằng `createdAt`.

### `Friendship` & `FriendRequest`
- Lưu trữ quan hệ Bạn bè. `Friendship` đi theo 2 chiều (hoặc 1 chiều tùy logic).
- `UserBlock` ngăn cản mọi query hiển thị giữa 2 Users.

---

## 3. Module Nhắn Tin Thời Gian Thực (Chat & Inbox)

### `Conversation` & `ConversationMember`
- `ConversationType`: `DIRECT` (1-1) hoặc `GROUP` (Nhóm).
- `ConversationMember` theo dõi `lastReadMessageId` & `unreadCount` cho mỗi cá nhân. Cờ `isMuted` ngăn chặn push notifications.

### `Message` & `MessageRead`
- Có `replyToMessageId` để Rep tin nhắn.
- Tích hợp `MessageType` cho Text, Image, Video, File, và system actions (VD: "Ai đó đã đổi tên nhóm").

---

## 4. Module Video/Audio Call (LiveKit Integration)

### `CallSession`
- Trạng thái vòng đời cuộc gọi (`RINGING`, `ACCEPTED`, `ENDED`). 
- Chứa `roomName` cấp phát cho LiveKit Server kiểm soát.
- Mọi lịch sử thời lượng (`durationSeconds`) chốt hạ khi gọi xong.

### `CallParticipant` & `CallEvent`
- Lưu User nào vào User nào ra. Track event log chi tiết (Ai mute mic, Ai bật tắt camera) cho phân tích tính năng.

---

## 5. Module File & Lưu Trữ (AWS S3)

### `MediaAsset` & `MediaVariant`
- Vị trí tập trung toàn bộ các Object upload. 
- Không lưu URL cứng! Chỉ lưu `bucket` và `objectKey`. Khi API fetch dữ liệu, Server sẽ ký (Sign) URL Presigned và trả về JSON, giúp link ảnh bảo mật có thời hạn (expiring URLs).

---
*Lưu ý: Bạn có thể tự sinh một biểu đồ Entity-Relationship Database (ERD) dạng PDF hình ảnh bất kỳ lúc nào bằng thư viện `prisma-erd-generator`.*
