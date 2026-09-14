# CardNest — Internal TCG Admin Dashboard

Công cụ quản trị nội bộ dành cho chủ shop kinh doanh/đầu cơ TCG. Không có giao diện bán hàng, chỉ dùng nội bộ.

## Tech stack

Next.js (App Router, TypeScript) · Prisma · PostgreSQL · shadcn/ui · TanStack Table · react-hook-form + Zod · iron-session

## Chạy lần đầu

1. Copy file môi trường và chỉnh `SESSION_SECRET` (chuỗi ngẫu nhiên ≥ 32 ký tự) + tài khoản admin seed:

   ```bash
   cp .env.example .env
   ```

2. Khởi động PostgreSQL local — chọn 1 trong 2 cách:

   **Cách A — Docker (nếu máy đã cài Docker Desktop):**

   ```bash
   docker compose up -d
   ```

   **Cách B — PostgreSQL cài trực tiếp bằng winget (không cần Docker/WSL2):**

   ```powershell
   winget install --id PostgreSQL.PostgreSQL.17 --accept-source-agreements --accept-package-agreements --silent
   ```

   Sau khi cài, PostgreSQL chạy như Windows Service (`postgresql-x64-17`), mật khẩu superuser mặc định là `postgres`. Tạo role + database khớp với `.env`:

   ```powershell
   $env:PGPASSWORD="postgres"
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "CREATE ROLE cardnest LOGIN PASSWORD 'cardnest';"
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE cardnest OWNER cardnest ENCODING 'UTF8';"
   ```

3. Cài dependencies (nếu chưa):

   ```bash
   npm install
   ```

4. Chạy migration (tự động seed dữ liệu mẫu theo cấu hình trong `package.json`):

   ```bash
   npm run db:migrate
   ```

5. Chạy dev server:

   ```bash
   npm run dev
   ```

6. Mở http://localhost:3000, đăng nhập bằng `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` đã đặt trong `.env`.

## Các lệnh khác

- `npm run db:seed` — chạy lại seed thủ công (không xoá dữ liệu cũ, dùng `upsert` cho phần lookup).
- `npm run db:studio` — mở Prisma Studio để xem/sửa dữ liệu trực tiếp.
- `npm run typecheck` — kiểm tra type TypeScript.

## Ghi chú kiến trúc

- Mọi thao tác ghi dữ liệu (create/update/delete, ghi nhận mua/bán, điều chỉnh tiền mặt) dùng **Server Actions** (`src/server/actions/`).
- Ba bảng dữ liệu cần lọc/sort/phân trang theo thời gian thực (Sealed, Singles, Customers) dùng **Route Handlers** (`src/app/api/**/route.ts`) để phục vụ TanStack Table.
- `src/middleware.ts` bảo vệ toàn bộ route trong `(dashboard)` bằng session cookie mã hoá (iron-session).
