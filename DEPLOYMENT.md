# Deploy CardNest lên Vercel + Neon

Hướng dẫn đưa app từ local lên production, dùng **Neon** (PostgreSQL serverless) làm database và **Vercel** để host.

## 1. Tạo database trên Neon

1. Vào [neon.tech](https://neon.tech), tạo tài khoản (free tier là đủ dùng) và tạo một **Project** mới (region nên chọn gần Việt Nam nhất, ví dụ Singapore).
2. Vào tab **Connection Details** của project, lấy **2 connection string**:
   - **Pooled connection** (host có dạng `...-pooler.<region>.aws.neon.tech`) → dùng cho `DATABASE_URL`.
   - **Direct connection** (host không có `-pooler`) → dùng cho `DIRECT_URL`.
3. Thêm `?sslmode=require` vào cuối cả hai, và thêm `&pgbouncer=true` riêng cho `DATABASE_URL` (vì pooler của Neon chạy PgBouncer ở chế độ transaction — Prisma cần biết để không dùng prepared statements sai cách). Ví dụ:

   ```
   DATABASE_URL="postgresql://<user>:<password>@<project>-pooler.<region>.aws.neon.tech/<db>?sslmode=require&pgbouncer=true"
   DIRECT_URL="postgresql://<user>:<password>@<project>.<region>.aws.neon.tech/<db>?sslmode=require"
   ```

Repo đã cấu hình sẵn `directUrl` trong `prisma/schema.prisma` để dùng đúng 2 biến này — không cần sửa code.

## 2. Import repo vào Vercel

1. Vào [vercel.com/new](https://vercel.com/new), chọn **Import Git Repository** → chọn repo `Vinhky9999/CNquanly`.
2. Framework Preset: Vercel tự nhận diện **Next.js**, không cần chỉnh Build Command / Output Directory thủ công (repo đã có sẵn script `vercel-build` — Vercel sẽ tự ưu tiên chạy script này thay vì `build`).
3. Ở bước **Environment Variables**, thêm đầy đủ:

   | Key | Giá trị |
   |---|---|
   | `DATABASE_URL` | Pooled connection string từ Neon (bước 1) |
   | `DIRECT_URL` | Direct connection string từ Neon (bước 1) |
   | `SESSION_SECRET` | Chuỗi ngẫu nhiên ≥ 32 ký tự (tạo bằng `openssl rand -hex 32` hoặc bất kỳ password generator nào) |
   | `SEED_ADMIN_USERNAME` | Tên đăng nhập admin, ví dụ `admin` |
   | `SEED_ADMIN_PASSWORD` | Mật khẩu admin ban đầu (chỉ dùng để seed 1 lần, xem bước 4) |

4. Bấm **Deploy**. Vercel sẽ chạy `vercel-build` = `prisma generate && prisma migrate deploy && next build` — tự động áp toàn bộ migration lên database Neon rồi build app. Lần deploy đầu sẽ tạo sẵn schema, nhưng **chưa có tài khoản admin** (khác với `migrate dev` ở local, `migrate deploy` không tự chạy seed).

## 3. Tạo tài khoản admin trên database Neon (chỉ làm 1 lần)

Từ máy local, trỏ tạm `DATABASE_URL`/`DIRECT_URL` sang Neon rồi seed:

```bash
# PowerShell — thay bằng connection string thật của bạn
$env:DATABASE_URL="postgresql://<user>:<password>@<project>-pooler.<region>.aws.neon.tech/<db>?sslmode=require&pgbouncer=true"
$env:DIRECT_URL="postgresql://<user>:<password>@<project>.<region>.aws.neon.tech/<db>?sslmode=require"
$env:SEED_ADMIN_USERNAME="admin"
$env:SEED_ADMIN_PASSWORD="<mật khẩu bạn muốn>"
npm run db:seed
```

Chạy lại lệnh này bất cứ lúc nào cũng an toàn (dùng `upsert`) — dùng để đổi mật khẩu admin sau này nếu cần.

## 4. Các lần deploy sau

Mỗi lần push code (có thêm migration mới hay không) lên nhánh `main`, Vercel tự build và tự chạy `prisma migrate deploy` lại — migration nào đã áp rồi sẽ được bỏ qua, chỉ migration mới chưa từng chạy mới được áp thêm. Không cần thao tác thủ công gì thêm, trừ khi migration đó có thay đổi lớn (đổi kiểu dữ liệu, xoá cột đang có dữ liệu...) thì nên kiểm tra kỹ trước khi merge vào `main`.

## Lưu ý

- Free tier của Neon có giới hạn số connection đồng thời — pooled connection (`DATABASE_URL`) là bắt buộc cho runtime của Vercel (serverless, có thể chạy hàng chục instance cùng lúc), không dùng direct connection ở đây.
- Domain mặc định Vercel cấp dạng `*.vercel.app` dùng được ngay; muốn gắn domain riêng thì vào Project Settings → Domains.
- `SESSION_SECRET` phải giữ bí mật và **khác** với secret dùng ở local.
