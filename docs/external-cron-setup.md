# Hướng dẫn thiết lập Cron Jobs bên ngoài cho Vercel Hobby

Bot của bạn cần các cron jobs để quét tin tức, gửi bản tin sáng và cảnh báo. Vì Vercel Hobby giới hạn cron jobs 1 lần/ngày, chúng ta cần dùng dịch vụ bên ngoài.

## Dịch vụ đề xuất: cron-job.org (Miễn phí)

1. Truy cập `https://cron-job.org` và đăng ký tài khoản miễn phí.
2. Tạo các cron jobs sau:

### Job 1: Quét tin tức (Mỗi 15 phút)
- URL: `https://YOUR_VERCEL_URL.vercel.app/api/cron/scan`
- Method: GET (hoặc POST tùy cấu hình Controller)
- Header: `x-cron-secret: YOUR_CRON_SECRET`
- Schedule: Every 15 minutes

### Job 2: Bản tin sáng (8:00 AM hàng ngày)
- URL: `https://YOUR_VERCEL_URL.vercel.app/api/cron/morning`
- Method: GET
- Header: `x-cron-secret: YOUR_CRON_SECRET`
- Schedule: 0 8 * * *

### Job 3: Cảnh báo trước sự kiện (Mỗi 5 phút)
- URL: `https://YOUR_VERCEL_URL.vercel.app/api/cron/alerts`
- Method: GET
- Header: `x-cron-secret: YOUR_CRON_SECRET`
- Schedule: Every 5 minutes

### Job 4: Health check (Mỗi 10 phút, giữ ấm ứng dụng)
- URL: `https://YOUR_VERCEL_URL.vercel.app/api/health`
- Method: GET
- Schedule: Every 10 minutes

## Lưu ý
- Thay `YOUR_VERCEL_URL` bằng domain Vercel thực tế của bạn.
- Thay `YOUR_CRON_SECRET` bằng giá trị `CRON_SECRET` bạn đã đặt trong biến môi trường Vercel.
- Đảm bảo Controller của bạn hỗ trợ Method tương ứng (mặc định các ví dụ trên dùng GET).
