# Đóng gói CardNest thành App Android (.apk)

## ⚠️ Giới hạn quan trọng cần hiểu trước

CardNest là một **ứng dụng web server-rendered** (Next.js App Router, server actions, kết nối trực tiếp tới PostgreSQL). Nó **không thể** đóng gói thành một file `.apk` chạy offline hoàn toàn trên điện thoại — vì app cần một server Node.js đang chạy + kết nối được tới database để hoạt động (giống hệt lý do bạn không thể "đóng gói" một trang web WordPress thành app chạy offline).

Cách làm đúng — và cũng là cách hầu hết app quản trị nội bộ (admin dashboard) làm khi cần bản mobile — là dùng **Capacitor để bọc một "vỏ" ứng dụng Android (WebView) trỏ vào địa chỉ đang chạy CardNest**, y hệt như mở app trong trình duyệt nhưng có icon, tên riêng, chạy full màn hình như app thật.

Nghĩa là: **bạn vẫn cần chạy CardNest ở đâu đó mà điện thoại truy cập được**, ví dụ:

| Cách host | Điện thoại truy cập được khi nào | Độ khó |
|---|---|---|
| Máy tính chạy `npm run dev`/`npm run start`, cùng mạng Wi-Fi | Chỉ khi cùng Wi-Fi với máy tính | Dễ nhất, phù hợp dùng thử nội bộ |
| VPS/cloud (DigitalOcean, Render, v.v.) | Mọi lúc, mọi nơi có mạng | Cần biết deploy Node.js + Postgres |
| Vercel + Postgres cloud (Neon/Supabase) | Mọi lúc, mọi nơi có mạng | Dễ deploy nhưng cần chỉnh session cookie cho phù hợp môi trường serverless |

Hướng dẫn bên dưới dùng phương án đầu tiên (LAN) để bạn dựng bản demo nhanh nhất. Khi đã có domain/VPS thật, chỉ cần đổi 1 dòng `server.url` trong `capacitor.config.ts`.

Tên app hiển thị trên điện thoại đã được cấu hình sẵn: **`CardNest-quanly`** (xem `capacitor.config.ts`).

---

## Bước 0 — Yêu cầu cài đặt trên máy build APK

- **Node.js** (đã có sẵn vì bạn đang chạy CardNest).
- **Android Studio** (bắt buộc — dùng để build APK và cấp Android SDK): tải tại https://developer.android.com/studio
- Sau khi cài Android Studio, mở nó ít nhất 1 lần để nó tự tải Android SDK (Settings → Languages & Frameworks → Android SDK, đảm bảo có ít nhất 1 SDK Platform + Android SDK Build-Tools).
- **JDK 17** — Android Studio thường đã kèm sẵn (Android Studio → Embedded JDK), không cần cài riêng.

## Bước 1 — Cài các gói Capacitor

Các gói `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` đã có sẵn trong `package.json` (mục `devDependencies`). Chỉ cần:

```bash
npm install
```

## Bước 2 — File cấu hình đã có sẵn

Hai file sau đã được tạo sẵn trong project, không cần chạy `npx cap init`:

- **`capacitor.config.ts`** (ở thư mục gốc) — cấu hình `appId`, `appName: "CardNest-quanly"`, và `server.url` (địa chỉ CardNest đang chạy).
- **`www/index.html`** — trang placeholder bắt buộc phải có (Capacitor yêu cầu 1 thư mục web assets tồn tại), nhưng thực chất app sẽ tải thẳng từ `server.url`, không dùng nội dung trong `www/`.

**Việc bạn cần làm:** mở `capacitor.config.ts`, sửa `server.url` thành địa chỉ IP LAN thật của máy đang chạy CardNest.

Tìm IP LAN của máy (Windows PowerShell):

```powershell
ipconfig | Select-String "IPv4"
```

Ví dụ ra `192.168.1.50` → sửa trong `capacitor.config.ts`:

```ts
server: {
  url: "http://192.168.1.50:3000",
  cleartext: true, // chỉ cần khi dùng http:// (LAN); bỏ khi đã có https://
},
```

Đảm bảo CardNest đang chạy và lắng nghe trên mọi network interface (không chỉ `localhost`):

```bash
npm run dev -- -H 0.0.0.0
# hoặc bản production:
npm run build && npm run start -- -H 0.0.0.0
```

## Bước 3 — Thêm nền tảng Android vào project

```bash
npx cap add android
```

Lệnh này tạo ra thư mục `android/` (project Android native đầy đủ) trong CardNestPJ. Thư mục này khá lớn — đã được thêm sẵn vào `.gitignore` không cần commit nếu dùng git.

## Bước 4 — Đồng bộ cấu hình vào project Android

Chạy lại lệnh này **mỗi khi bạn sửa `capacitor.config.ts`** (ví dụ đổi `server.url` sau khi deploy domain thật):

```bash
npm run cap:sync
```

## Bước 5 — Mở project trong Android Studio và build APK

```bash
npm run cap:open:android
```

Lệnh này mở thư mục `android/` bằng Android Studio. Đợi Gradle sync xong lần đầu (vài phút), sau đó:

1. Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
2. Đợi build xong, Android Studio hiện thông báo "APK(s) generated successfully" kèm link **locate** — bấm vào để mở thư mục chứa file `.apk`.
3. File nằm ở: `android/app/build/outputs/apk/debug/app-debug.apk`.

**Không cần Android Studio (build qua dòng lệnh):** nếu đã cài Android SDK/JDK, có thể chạy trực tiếp:

```bash
cd android
./gradlew assembleDebug
```

APK debug này **đủ dùng để cài và test trên điện thoại của bạn** (không cần đăng ký gì thêm). Nếu sau này muốn phát hành lên Google Play, cần tạo bản `release` có ký số (signing) — Android Studio có wizard **Build → Generate Signed Bundle / APK** hướng dẫn từng bước.

## Bước 6 — Cài APK lên điện thoại Android

1. Copy file `app-debug.apk` vào điện thoại (qua USB, email, Zalo gửi cho chính mình, Google Drive...).
2. Trên điện thoại: Cài đặt → cho phép "Cài đặt ứng dụng không rõ nguồn gốc" (Install unknown apps) cho ứng dụng bạn dùng để mở file (VD: Files, Zalo).
3. Mở file `.apk` → **Cài đặt**.
4. Mở app **CardNest-quanly** vừa cài — nó sẽ tải CardNest từ `server.url` đã cấu hình. Điện thoại **phải cùng Wi-Fi** với máy chạy CardNest (nếu dùng cách LAN) hoặc có mạng internet (nếu đã deploy lên VPS/domain thật).

---

## Khi đã có domain/VPS thật (khuyến nghị cho dùng lâu dài)

1. Deploy CardNest (Next.js + PostgreSQL) lên VPS hoặc dịch vụ hosting, có HTTPS (bắt buộc để trình duyệt/WebView không cảnh báo, và để bảo vệ mật khẩu đăng nhập khi truyền qua mạng).
2. Sửa `capacitor.config.ts`:
   ```ts
   server: {
     url: "https://cardnest.yourdomain.com",
     // bỏ dòng cleartext — không cần nữa vì đã dùng https
   },
   ```
3. Chạy lại `npm run cap:sync`, build lại APK theo Bước 5.
4. Vì đây là công cụ quản trị nội bộ có dữ liệu tài chính, nên cân nhắc thêm: giới hạn truy cập bằng VPN nội bộ, whitelist IP, hoặc ít nhất bật HTTPS + đổi `SESSION_SECRET`/mật khẩu admin mạnh — tuyệt đối không để trang đăng nhập lộ ra internet công khai mà không có lớp bảo vệ nào khác ngoài mật khẩu.
