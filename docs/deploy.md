# Deploy Guide — I Love English Club (VU-15 / SF-8)

Stack đã chốt (SF-1 pivot): **Next.js 15 (Vercel) + Neon Postgres + Auth.js v5 + Vercel Blob**.
Tài liệu này đủ để deploy lần đầu; các mục **REQUIREMENT-GAP** là thứ SF-8 KHÔNG tự làm được
(chưa có infra — đã comment trên VU-23 + VU-15, chờ người sở hữu project cung cấp).

## 0. Pre-req — REQUIREMENT-GAP (thứ cần có trước khi deploy)

| # | Thứ cần | Ai cung cấp | Ghi chú |
|---|---|---|---|
| 1 | **Git remote + push nhánh `story-vu15-iloveenglishclub`** | chủ repo | repo hiện KHÔNG có origin — Vercel import cần remote (GitHub/GitLab/Bitbucket) |
| 2 | **Vercel project** (import từ remote trên) | chủ account Vercel | framework Next.js auto-detect; KHÔNG cần cấu hình build đặc biệt |
| 3 | **Neon project + prod branch** → `DATABASE_URL` (pooled) | chủ account Neon | region gần VN; connection string dạng `…-pooler.…neon.tech/…?sslmode=require` |
| 4 | `AUTH_SECRET` | tự sinh | `openssl rand -base64 32` — set trên Vercel |
| 5 | Google OAuth `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | chủ Google Cloud project | Redirect URI: `{SITE_URL}/api/auth/callback/google` |
| 6 | `BLOB_READ_WRITE_TOKEN` | tạo Blob store trên Vercel | bỏ trống = audio ghi vào `public/uploads` (chỉ dev, KHÔNG dùng prod) |
| 7 | Domain + `NEXT_PUBLIC_SITE_URL` | chủ domain | ⚠ thiếu var này → canonical/hreflang/sitemap/OG rơi localhost (SF-7 đã surface) |

## 1. Env vars trên Vercel (Project → Settings → Environment Variables)

```
DATABASE_URL=<Neon pooled connection string>     # —
AUTH_SECRET=<openssl rand -base64 32>            # —
AUTH_TRUST_HOST=true                             # cho phép host Vercel/preview
GOOGLE_CLIENT_ID=…            GOOGLE_CLIENT_SECRET=…
NEXT_PUBLIC_SITE_URL=https://<domain-thật>       # KHÔNG có dấu / cuối
BLOB_READ_WRITE_TOKEN=<từ Blob store>            # —
```
`ADMIN_EMAIL`/`ADMIN_PASSWORD` **KHÔNG set trên Vercel** — chỉ dùng lúc tạo admin (mục 4).

`.env.example` trong repo là bản đối chiếu đầy đủ (SF-8 đã đồng bộ +admin creds).

## 2. Migrations + seed lên prod DB

Chạy LOCAL trỏ thẳng vào Neon prod branch (drizzle-kit không chạy trên Vercel):

```bash
DATABASE_URL="<neon-pooled-url>" npm run db:migrate   # schema (drizzle/ SQL files)
DATABASE_URL="<neon-pooled-url>" npm run db:seed      # 7 books Cambridge Prepare
```

## 3. Deploy app

Vercel import project → deploy nhánh đích. Build command mặc định (`next build`), không cần
vercel.json (xem mục 6). Sau deploy kiểm tra ngay: `/en`, `/vi` mở được; `/sitemap.xml`,
`/robots.txt` có domain thật trong canonical.

## 4. Tạo admin đầu tiên

```bash
ADMIN_EMAIL=<admin@…> ADMIN_PASSWORD=<≥8 ký tự> DATABASE_URL="<neon-pooled-url>" npm run admin:create
```
Chạy local một lần; creds không lưu vào Vercel env. Đăng nhập `/admin` để nhập unit/lesson.

## 5. Post-deploy smoke checklist (chạy lại audit trên prod URL)

1. [ ] `/en` + `/vi` mở được, browse books → units → lessons (AC #1)
2. [ ] Lighthouse trên prod URL — a11y ≥95, perf mobile ≥85 (median/3 runs — protocol như SF-8; local là xấp xỉ tối ưu, prod có thể thấp hơn do network/TTFB thật)
3. [ ] Học 1 bài end-to-end: đăng ký → học L3-U1-L1 → thấy XP/streak ở `/me` (AC #6)
4. [ ] Admin tạo + publish 1 lesson → bài hiện trên site + sitemap (AC #5 context pack)
5. [ ] Smoke E2E trỏ baseURL prod: dictation + progress + i18n + admin 4 suite
6. [ ] Security: `node scripts/security-scan.mjs` + `npm run test:rls` với `DATABASE_URL` prod

## 6. vercel.json — quyết định KHÔNG cần

Next.js 15 App Router trên Vercel là **zero-config**: middleware, ISR/revalidateTag,
route handlers, OG image (next/og) đều chạy native. Không có cron job, không custom header,
không region pin, không rewrite đáng kể. Thêm vercel.json rỗng chỉ tăng bề mặt cấu hình
lệch giữa docs và thực chạy — không thêm gì. Reconsider khi: cần cron (top-users snapshot?),
cần header bảo mật tùy chỉnh (CSP), hoặc tách region DB/app.
