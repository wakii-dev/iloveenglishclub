# I Love English Club

Nền tảng luyện **nghe – chép chính tả (dictation)** theo sách **Cambridge Prepare**, giao diện song ngữ **Tiếng Việt / English**.

Học viên nghe audio từng câu, gõ lại những gì nghe được, hệ thống so khớp từng từ,
chấm điểm độ chính xác và cộng XP — kèm chuỗi ngày học (streak), bảng xếp hạng
tuần và tiến độ theo sách.

## Tính năng

- **Flow học dictation** — start-gate chống autoplay, điều khiển audio (tốc độ /
  seek), gõ + kiểm tra với word-diff trực quan (đúng / sai / thiếu / thừa), hint
  / skip, hai chế độ **strict / relaxed**, điều hướng part, màn kết quả kèm full
  transcript. Khách (guest) học được ngay — kết quả in-memory, đăng nhập giữa
  chừng để giữ điểm.
- **Chấm điểm & XP** — accuracy tính trên số từ của transcript, WPM theo thời
  lượng audio gốc, XP = `10 × accuracy × 0.8(nếu dùng hint) × 0.5(relaxed)`,
  chỉ tính cho lần làm đầu mỗi part. Điểm do **server tính** — client không tự gửi score.
- **Tiến độ & gamification** — XP, hoạt động theo ngày, **streak** theo múi giờ
  `Asia/Ho_Chi_Minh`, leaderboard tuần (ISO) + tất cả thời gian, trang `/me` với
  heatmap 12 tuần, tổng phút nghe và tiến độ theo sách.
- **Admin CMS** — nhập unit → lesson → dán script → tự tách câu (chỉnh tay được),
  bulk upload audio (trạng thái từng file, retry riêng, sort số học), publish
  gate, quản lý users & phân quyền.
- **SEO & i18n** — metadata theo locale, sitemap/robots, JSON-LD, OG image động,
  hreflang + canonical cặp locale, nội dung fallback `vi → en → raw`.

## Tech stack

| Lớp | Công nghệ |
|---|---|
| Framework | Next.js 15 (App Router) · React 19 · TypeScript |
| Database | Neon Postgres · Drizzle ORM · `postgres.js` |
| Auth | Auth.js v5 — email/password (bcrypt) + Google OAuth |
| Storage | Vercel Blob (audio) — driver `local` cho dev |
| i18n | next-intl (`en` / `vi`, messages per-namespace) |
| UI | Tailwind CSS 4 · shadcn/ui · Radix · Zustand · sonner |
| QA | Vitest · Playwright · Lighthouse (CI: lint / typecheck / test / build) |

## Chạy dự án

**Yêu cầu:** Node 22, Postgres local (DB tên `ilec`) — hoặc chuỗi kết nối Neon.

```bash
cp .env.example .env.local   # điền DATABASE_URL, AUTH_SECRET, ...
npm install
npm run db:migrate           # schema (drizzle SQL migrations)
npm run db:seed              # 7 sách Cambridge Prepare + bài demo có audio
npm run admin:create         # tạo admin đầu tiên (ADMIN_EMAIL/ADMIN_PASSWORD trong .env.local)
npm run dev                  # http://localhost:3000
```

### Biến môi trường

| Var | Ý nghĩa |
|---|---|
| `DATABASE_URL` | Postgres (local hoặc Neon pooled) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` khi chạy sau proxy/Vercel |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google (tuỳ chọn) |
| `NEXT_PUBLIC_SITE_URL` | domain thật — canonical/sitemap/OG |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — bỏ trống = ghi `public/uploads` (chỉ dev) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | chỉ local — dùng cho `admin:create` + e2e globalSetup |

Hướng dẫn deploy production (Vercel + Neon + Blob): [`docs/deploy.md`](docs/deploy.md).

## Scripts

| Lệnh | Việc gì |
|---|---|
| `npm run dev` / `build` / `start` | dev (turbopack) · build production · chạy build |
| `npm run lint` / `typecheck` | ESLint · `tsc --noEmit` |
| `npm test` | Vitest unit (218 tests — scoring, streak, seo, storage, i18n parity…) |
| `npm run test:rls` | 18 test semantics phân quyền (role guest/user/admin, XP/role protection) — cần DB local migrated+seeded |
| `npm run test:audit` | 13 test ngưỡng audit (Lighthouse thresholds) |
| `npm run test:e2e` | E2E admin (Playwright, port 3000, globalSetup admin) |
| `npm run test:e2e:dictation` | E2E dictation + progress + i18n (port 3110) |
| `npm run test:coverage` | Vitest + coverage (threshold siết `src/lib/dictation/**`) |
| `npm run db:generate` / `db:push` / `db:migrate` / `db:seed` | Drizzle schema + seed |

Scripts QA thêm: `scripts/lighthouse.mjs` (7 URL, median/3 runs, chỉ trên build
prod) · `scripts/security-scan.mjs` (secrets, exec-bits, allowlist npm audit).

## Cấu trúc

```
src/
├─ app/
│  ├─ (public)/[locale]/     # home, books, lesson, me, top-users, auth pages
│  ├─ (admin)/admin/         # dashboard, books, units, lessons, users
│  ├─ api/                   # auth/[...nextauth], admin/upload
│  └─ actions/               # server actions auth
├─ components/               # dictation/ · admin/ · gamification/ · content/ · layout/ · ui/
├─ lib/
│  ├─ dictation/             # diff, store (state machine) — pure, coverage 100%
│  ├─ gamification/          # streak (TZ), attempt-key, events
│  ├─ actions/               # submit-attempt (transaction), relaxed-mode, admin/*
│  ├─ content/               # queries, localize (fallback chain), split-sentences
│  ├─ seo/                   # jsonld, sitemap-data, site
│  └─ storage.ts / storage-server.ts  # client-safe helpers / server-only put·delete
├─ db/                       # schema (10 bảng + view leaderboard) + index
└─ i18n/                     # routing + request config
messages/{en,vi}/            # 8 namespace, parity key được test bảo vệ
```

## Tài liệu

- Deploy production: [`docs/deploy.md`](docs/deploy.md)
- Spec & story: `docs/superpowers/specs/`, `docs/superpowers/brackets/`
- Bằng chứng QA theo SF: `docs/superpowers/evidence/`, `docs/superpowers/audits/`
