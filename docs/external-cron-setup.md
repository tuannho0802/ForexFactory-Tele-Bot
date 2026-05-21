# Hướng dẫn thiết lập Cron Jobs bên ngoài cho Vercel Hobby

Bot của bạn cần các cron jobs để quét tin tức, gửi bản tin sáng và cảnh báo. Vì Vercel Hobby giới hạn cron jobs 1 lần/ngày, chúng ta cần dùng dịch vụ bên ngoài để kích hoạt các API endpoints.

## Dịch vụ đề xuất: cron-job.org (Miễn phí)

1. Truy cập `https://cron-job.org` và đăng ký tài khoản miễn phí.
2. Thiết lập Timezone của tài khoản là **Asia/Ho_Chi_Minh** để các job chạy đúng giờ Việt Nam.
3. Tạo các cron jobs sau:

### Danh sách các Cron Jobs

| Job | Endpoint | Method | Header | Schedule (giờ VN) | Mục đích |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Full Daily Scan** | `/api/cron/scan` | POST | `x-cron-secret: YOUR_CRON_SECRET` | `0 1 * * *` (1:00 AM) | Cào toàn bộ lịch ngày hôm nay từ ForexFactory, lưu vào Supabase. |
| **Intraday Update Scan** | `/api/cron/scan` | POST | `x-cron-secret: YOUR_CRON_SECRET` | `0 */2 * * *` (Mỗi 2 giờ) | Kiểm tra và bổ sung các sự kiện mới xuất hiện trong ngày. |
| **User Morning Briefing** | `/api/cron/morning` | POST | `x-cron-secret: YOUR_CRON_SECRET` | `* * * * *` (Mỗi 1 phút) | Duyệt users, gửi bản tin sáng nếu đến giờ của họ (theo timezone). |
| **Pre-event Alerts** | `/api/cron/alerts` | POST | `x-cron-secret: YOUR_CRON_SECRET` | `* * * * *` (Mỗi 1 phút) | Kiểm tra sự kiện sắp diễn ra, gửi cảnh báo cho user phù hợp. |
| **Health Check** | `/api/health` | GET | (không cần) | `*/10 * * * *` | Giữ ấm serverless function, tránh cold start. |

## Cách hoạt động

- **Full Daily Scan**: Vào 1h sáng, hệ thống gọi API JSON/XML/HTML của ForexFactory, lấy toàn bộ sự kiện của tuần, lọc ra những sự kiện có ngày hôm nay, lưu vào DB. Các sự kiện mới sẽ tự động kích hoạt thông báo (nếu user đăng ký).
- **Intraday Update**: Cứ mỗi 2 giờ, hệ thống cũng gọi scan nhưng nhờ cơ chế caching và rate limiting, dữ liệu sẽ chỉ được tải về nếu chưa có trong cache, đồng thời phát hiện các sự kiện "đột xuất" được thêm vào giữa ngày.
- **Morning Briefing & Alerts**: Chỉ truy vấn Supabase, không gọi ra ngoài. Mỗi phút, hệ thống duyệt tất cả user đang active, kiểm tra xem có cần gửi bản tin sáng hay cảnh báo trước sự kiện không dựa trên timezone và cài đặt riêng.

## Lưu ý quan trọng
- Thay `YOUR_VERCEL_URL` bằng domain Vercel thực tế của bạn (ví dụ: `https://forex-factory-tele-bot.vercel.app`).
- Thay `YOUR_CRON_SECRET` bằng giá trị `CRON_SECRET` bạn đã đặt trong biến môi trường Vercel.
- Nếu `cron-job.org` giới hạn số lần chạy miễn phí, bạn có thể giảm tần suất của **Morning Briefing** và **Pre-event Alerts** xuống mỗi 5 phút (`*/5 * * * *`). Sai số này vẫn chấp nhận được đối với trải nghiệm người dùng.
