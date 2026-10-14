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

## 5. Giá thị trường theo TCGplayer (tự động)

Mỗi sản phẩm (Sealed và thẻ Raw) được tự khớp với sản phẩm tương ứng trên TCGplayer và lấy **Market Price** (USD) quy đổi sang VND theo tỷ giá trực tiếp. Không cần API key.

- Nguồn: tìm kiếm + giá trực tiếp của marketplace TCGplayer; nếu không truy cập được thì dùng bản dump hằng ngày của TCGplayer qua TCGcsv (`tcgcsv.com`).
- Trang Inventory tự khớp và cập nhật giá khi mở và mỗi 5 phút; nút **Cập nhật giá TCGplayer** chạy ngay. Sản phẩm nào khớp chưa chắc chắn sẽ có nhãn "khớp gần đúng, kiểm tra" — mở Sửa để đổi sang đúng sản phẩm hoặc bỏ liên kết và nhập giá tay.
- Chạy khi không ai mở app: `vercel.json` có cron hằng ngày gọi `/api/market-prices/refresh`. Cần đặt biến môi trường **`CRON_SECRET`** (chuỗi ngẫu nhiên) trên Vercel — Vercel tự gửi nó trong header `Authorization: Bearer …`. Gói Hobby chỉ cho cron tối đa 1 lần/ngày.
- Tuỳ chọn: `USD_VND_RATE` (mặc định 25000) là tỷ giá dự phòng khi không lấy được tỷ giá trực tiếp.
- Trang Inventory chạy server action tối đa 60 giây (`maxDuration`) để khớp một lượt nhiều sản phẩm.
- Mọi giá TCGplayer là giá **thị trường United States (USD)** — Market Price từ các giao dịch gần đây tại Mỹ (hoặc trung vị tin đang bán khi chưa có giao dịch), quy đổi VND chỉ để hiển thị. Vùng được cố định ở `TCG_MARKET` trong `src/lib/tcgplayer/constants.ts` và giao diện có nhãn "US Market".
- Cách khớp: Sealed khớp theo tên set + loại box (sửa được lỗi gõ như "Bunlde", hiểu "Special/Premium Collection" là loại đặc biệt, và số thứ tự set như `Riftbound - 02 - ...` = set thứ 2). Thẻ lẻ khớp theo **mã set + số thẻ + bản in** (ví dụ `OP05` + `119` + `Manga`, hay `Treasure cup`, `Serial`, `SP`) nên tên viết tắt như "Luffy" vẫn ra đúng `Monkey.D.Luffy`.
- Khi bộ khớp được nâng cấp (hằng số `MATCHER_VERSION` trong `src/lib/tcgplayer/constants.ts`), những sản phẩm trước đó chưa khớp được sẽ **tự khớp lại ngay** ở lần mở trang Inventory đầu tiên sau khi deploy — không cần bấm gì. Migration thêm cột `priceMatcherVersion` được `vercel-build` tự áp.
- Thẻ chưa ai mua gần đây (không có Market Price) dùng **trung vị giá các tin đang bán** và hiện nhãn "giá niêm yết, chưa có giao dịch". Thẻ đúng sản phẩm nhưng TCGplayer chưa có giá nào (ví dụ giải thưởng Treasure Cup hiếm) vẫn được liên kết, hiện "Chưa có giá" và tự có giá khi TCGplayer có.
- Thẻ **graded (slab PSA/BGS...)** không được tự định giá vì TCGplayer không bán/định giá slab: nhập giá tay ở mục Sửa.

## 6. Tin Nhắn Page (Facebook Messenger)

Trang **Tin Nhắn Page** gom hội thoại của Fanpage vào web quản lý, kèm thanh tra cứu kho để gửi thông tin thẻ / báo giá cho khách.

1. Trong [Meta for Developers] tạo App (loại Business), thêm sản phẩm **Messenger**, liên kết Fanpage và lấy **Page Access Token**.
2. Mở trang Tin Nhắn Page → **Kết nối Page**: dán Page Access Token và App Secret (hệ thống kiểm tra token và tự điền Page ID).
3. Ở mục Webhooks của Meta: dán **Callback URL** (`https://<domain>/api/messenger/webhook`) và **Verify Token** hiển thị trong hộp thoại, đăng ký trường `messages` cho Page. Callback URL phải là https công khai (bản Vercel); khi chạy máy local cần tunnel.
4. Webhook chỉ nhận tin có chữ ký `X-Hub-Signature-256` hợp lệ (cần App Secret). Tin nhắn mới hiện sau tối đa vài giây (danh sách tự làm mới).
5. Tuỳ chọn: đặt `FB_PAGE_ACCESS_TOKEN` / `FB_APP_SECRET` trong biến môi trường Vercel để không lưu token trong database (biến môi trường được ưu tiên).
6. Meta chỉ cho trả lời trong 24 giờ kể từ tin nhắn gần nhất của khách; ngoài khung đó tin sẽ hiện "gửi lỗi".
7. Chưa kết nối Page vẫn dùng thử được bằng **Mô phỏng khách nhắn** (tin chỉ lưu nội bộ, đánh dấu "chỉ lưu nội bộ").

Báo giá chỉ dùng giá thị trường hoặc giá bạn nhập; **giá vốn không bao giờ được đưa vào tin nhắn hay API tra cứu**.

**Cách đơn giản, không cần tạo App Meta:** không kết nối Page, chỉ mở Tin Nhắn Page → ô **Tra cứu kho**, tìm SKU/tên thẻ rồi bấm **Sao chép báo giá** (hoặc **Sao chép thông tin**) và dán vào Messenger / Zalo / Meta Business Suite. Dùng được ngay trên điện thoại.
