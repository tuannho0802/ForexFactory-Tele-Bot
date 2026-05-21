# Workflow History

> **Lưu ý:** File này được cập nhật theo nguyên tắc append-only. Mỗi khi có thay đổi lớn, hãy thêm một mục mới ở **đầu danh sách** (ngay dưới dòng này) với định dạng `## YYYY-MM-DD – Tiêu đề`.

---

## 2026-05-21 – Tối ưu hóa Cron Jobs

- **Tách biệt Cron chung và Cron riêng:** Phân chia rõ ràng giữa việc quét dữ liệu (external API) và gửi thông báo cho user (internal DB).
- **Full Daily Scan:** Chạy lúc 1:00 AM (giờ VN) để lấy dữ liệu toàn bộ ngày.
- **Intraday Update Scan:** Chạy mỗi 2 giờ để cập nhật các sự kiện phát sinh.
- **User Alerts (Morning/Pre-event):** Tăng tần suất lên mỗi phút (hoặc 5 phút) để đảm bảo độ chính xác của thông báo.
- **Cập nhật tài liệu:** Đồng bộ hóa kiến trúc mới vào [docs/external-cron-setup.md](file:///d:/Works/Forex-Bot-Tele/docs/external-cron-setup.md).

---

## 2026-05-21 – Fix Vercel Deployment & External Cron Jobs

- **Xác định nguyên nhân deploy fail:** Vercel Hobby giới hạn cron jobs 1 lần/ngày và tối đa 2 jobs.
- **Loại bỏ toàn bộ `crons` khỏi `vercel.json`:** Chuyển sang mô hình API-driven cron.
- **Tạo hướng dẫn thiết lập cron jobs bên ngoài:** [docs/external-cron-setup.md](file:///d:/Works/Forex-Bot-Tele/docs/external-cron-setup.md) hướng dẫn dùng `cron-job.org`.
- **Cấu hình Vercel Route:** Cập nhật route `/api/cron/(.*)` để cho phép truy cập các endpoint cron.
- Build thành công: `npm run build` – 0 lỗi.

---

## 2026-05-21 – Tạo Tài liệu Dự án

- Tạo thư mục `docs/` và file `workflows.md` ghi lại lịch sử phát triển.
- Viết lại `README.md` hoàn chỉnh: mô tả dự án, tính năng, tech stack, hướng dẫn cài đặt, triển khai, bảng lệnh bot.

---

## 2026-05-21 – Fix RangeError: Invalid time value trong isEventOnDate

- **Nguyên nhân:** Database lưu `event_time` dạng `HH:mm:ss` (ví dụ: `00:30:00`). Hàm `getEventDateTimeInTimezone` ghép thêm `:00Z` tạo ra chuỗi sai `2026-05-21T00:30:00:00Z`.
- **Sửa lỗi trong `time.util.ts`:**
  - `getEventDateTimeInTimezone`: Strip seconds nếu `event_time` dài hơn 5 ký tự; trả về `null` nếu input thiếu hoặc sai.
  - `isEventOnDate`: Trả `false` an toàn nếu `eventDate` hoặc `eventTime` là `null/undefined`; bọc trong `try/catch` để tránh crash.
- **Cải thiện `/today` handler:** Thêm log cảnh báo cho events có `event_date` hoặc `event_time` bị null trong DB trước khi filter.
- Build thành công: `npm run build` – 0 lỗi.

---

## 2026-05-21 – Timezone Integration

- **Thêm cột `timezone`** vào bảng `user_settings` (mặc định: `Asia/Ho_Chi_Minh`).
- **Cập nhật TypeScript models:**
  - `UserSettings` interface trong `users.types.ts` thêm `timezone: string`.
  - `users.repository.ts`: `upsertSettings` và `ensureDefaultSettings` hỗ trợ timezone.
- **Timezone utility helpers** trong `time.util.ts`:
  - `getTodayInTimezone(tz)`: Lấy ngày hôm nay theo múi giờ người dùng.
  - `getEventDateTimeInTimezone(date, time, tz)`: Chuyển UTC date/time sang Date object theo timezone.
  - `isEventOnDate(date, time, targetDate, tz)`: Kiểm tra event có rơi vào ngày target trong timezone hay không.
- **Lệnh `/settimezone`:** Validate IANA timezone bằng `Intl.DateTimeFormat`, lưu vào `user_settings`.
- **Lệnh `/today` cải tiến:**
  - Fetch events cho `yesterdayUtc`, `todayUtc`, `tomorrowUtc` để bao phủ cross-midnight events.
  - Filter bằng `isEventOnDate` theo timezone người dùng.
- **`/settings`:** Hiển thị timezone hiện tại và hướng dẫn `/settimezone`.
- **Multi-date query:** Thêm `getEventsByDates(dates)` vào `events.repository.ts` và `events.service.ts`.
- **Cron jobs timezone-aware:**
  - `sendMorningBriefing()`: Gửi bản tin sáng đúng giờ local của user, idempotency key theo ngày local.
  - `sendPreEventAlerts()`: Cảnh báo trước sự kiện X phút, idempotency key theo user+event.
  - `handleMorning()` / `handleAlerts()` trong `cron.service.ts`.
  - Endpoints `/api/cron/morning` và `/api/cron/alerts` trong `cron.controller.ts`.
- Build thành công: `npm run build` – 0 lỗi.

---

## 2026-05-20 – Multi-Impact, Multi-Currency & Core Bot Features

- **`/setimpact`:** Chấp nhận nhiều giá trị (ví dụ: `/setimpact High Medium`).
- **`/setcurrency`:** Hỗ trợ nhiều đồng tiền hoặc `all` (ví dụ: `/setcurrency USD EUR GBP`).
- **`/subscribe` và `/start` tách biệt:** `/start` đăng ký user ở trạng thái inactive, `/subscribe` kích hoạt nhận thông báo.
- **Scraper 3-layer fallback:** JSON → XML → HTML scraping từ ForexFactory.
- **Logging chi tiết:** Thêm log cho toàn bộ pipeline: fetch → parse → store → query → filter.
- **Notification system:**
  - `notifyNewEvents`: Gửi thông báo sự kiện mới cho user theo filter.
  - `notifyActualUpdates`: Gửi cập nhật khi có số liệu thực tế (actual).
  - Idempotency keys để tránh gửi trùng.
- **Cron scan endpoint:** `/api/cron/scan` với distributed lock qua `scan_log` table.
- **Admin alerts:** Gửi cảnh báo lỗi scan cho admin qua Telegram.
- **Rate limiting config:** Hỗ trợ cấu hình qua biến môi trường.

---

## 2026-05-19 – Khởi tạo Dự án

- Khởi tạo dự án NestJS với TypeScript.
- Cấu hình Supabase (PostgreSQL) làm database.
- Tích hợp Telegraf cho Telegram bot.
- Cấu hình Vercel deployment với `vercel.json`.
- Tạo cấu trúc module: `telegram`, `events`, `scraper`, `users`, `notification`, `cron`, `supabase`, `common`.
