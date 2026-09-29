# Plan — SF-1 Foundation (VU-16) — I Love English Club

**Spec slice:** `docs/superpowers/contexts/sf-1.md` · **Spec gốc:** `docs/superpowers/specs/2026-09-28-iloveenglishclub-design.md`
**Worktree:** `sf-1-foundation` (branch `sf-1-foundation`, fork từ `story-vu15-iloveenglishclub`)

## Pivot kiến trúc (user quyết định 2026-09-28, mid-run — supersedes spec §3 một phần)

| Hạng mục | Spec gốc | Pivot CHỐT (user + AskUserQuestion) |
|---|---|---|
| Database | Supabase Postgres | **Neon Postgres** (connection string user cung cấp) — Drizzle ORM + postgres.js |
| Auth | Supabase Auth | **Auth.js v5 (next-auth@beta)**: Credentials (bcrypt) + Google OAuth + JWT session; bảng users/accounts/sessions trên Neon |
| Storage audio | Supabase Storage bucket | **lib/storage.ts abstraction: dev = `public/uploads/`, prod = Vercel Blob** (`@vercel/blob`) |
| Deploy | Vercel + Supabase | **Vercel + Neon** |

Hệ quả: RLS policies (spec §4) → authorization app-level (server-only DB + Server Action role re-check); leaderboard view SQL giữ nguyên được trên Neon; trigger locale → register action set trực tiếp. Sửa spec epic VU-15 cần note (REQUIREMENT-GAP).

## Ràng buộc PM (mid-turn note)

1. Ưu tiên task KHÔNG-visual trước: scaffold / db / auth / i18n / middleware / CI / .env
2. KHÔNG tự chọn màu/theme/layout — chờ design hand-off tại `docs/superpowers/designs/` (CSS vars tương thích shadcn) rồi mới final tokens + layout
3. Skeleton layout trung tính shadcn-default chỉ để test acceptance (locale switch, theme toggle, user menu) — re-skin khi hand-off land

## Tasks (thứ tự thực thi)

- [x] T1. Scaffold Next.js 15.5 + TS + Tailwind 4 + ESLint (create-next-app, merge vào worktree)
- [x] T2. shadcn/ui init + add 14 component (button input textarea dialog select progress tabs tooltip dropdown-menu sonner badge card skeleton label separator) — Tier 2 chỉ import
- [x] T3. i18n: next-intl routing (`/en` default, `/vi`, `/` → `/en`) + per-namespace messages `messages/{en,vi}/{common,home,auth,lesson,admin,gamification}.json` + request loader merge namespace
- [x] T4. DB: Drizzle + Neon (postgres.js, pooled, `prepare:false`) + schema Auth.js (users/accounts/sessions/verification_tokens) + `profiles` (locale/role/relaxed_mode/display_name) + generate migration + push lên Neon thật
- [x] T5. Auth: Auth.js v5 config edge-split (auth.config.ts / auth.ts) + Credentials (bcryptjs) + Google + JWT callbacks (role/locale vào session) + events.createUser profile + `/api/auth/[...nextauth]` route + register Server Action (set profiles.locale theo route)
- [x] T6. Trang `/[locale]/login` + `/[locale]/register` (form chức năng, trung tính) + user-menu (login/logout state)
- [x] T7. Middleware gộp: next-intl routing + exclude `/admin` + `/api` + chặn `/admin` chưa login (JWT edge-safe); role-check admin ở `src/app/admin/layout.tsx` (server, DB) + admin placeholder page UI tiếng Việt
- [x] T8. lib/storage.ts: put/delete, driver dev `public/uploads/` ⇄ prod Vercel Blob (env-switch), path key tương đối tương thích 2 driver
- [x] T9. Layout skeleton trung tính: header (logo, nav, user menu, locale switch, theme toggle) + footer + theme provider (next-themes, persist) + Home placeholder hero (i18n strings)
- [x] T10. [GATE] Design hand-off `docs/superpowers/designs/` → áp tokens + structure + behavior notes vào layout/header/footer/globals.css (nếu hand-off chưa land trước cuối run: giữ skeleton trung tính, ghi rõ trong report)
- [x] T11. Tests Vitest: routing config + messages parity EN⇄VI (mọi namespace) + storage path builder
- [x] T12. CI: `.github/workflows/ci.yml` lint + typecheck + test + build; `.env.example` đầy đủ var mới (DATABASE_URL, AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET, NEXT_PUBLIC_SITE_URL, BLOB_READ_WRITE_TOKEN)
- [x] T13. Verify: ACCEPTANCE từng dòng (browser 3 tầng) + code-reviewer độc lập + evidence + audit log

## ACCEPTANCE (từ context pack)

- Mở `/en` và `/vi` cùng layout, switch ngôn ngữ đổi UI strings; `/` redirect `/en`
- Đăng ký email → đăng nhập được (verify trên Neon thật); Google OAuth: code complete, E2E cần GOOGLE_CLIENT_ID/SECRET (REQUIREMENT-GAP); register xong `profiles.locale` = locale route
- `/admin` chưa login/chưa admin → chặn (redirect login, không lộ UI)
- Theme light/dark toggle + persist
- CI xanh (file + local run tất cả step; GitHub run cần remote — repo chưa có origin)

## Test strategy

Vitest (node env): routing config, messages parity, storage path builder. Auth E2E = browser thật (dev server + Neon thật). Playwright: SF-4+.

## Verification hooks

- `npm run build` xanh KHÔNG cần secrets (CI không có env thật)
- Evidence: `docs/superpowers/evidence/sf-1-foundation/test-run.txt` (HEAD hash + `tdd:` line)
- Reviewer: comment VERDICT trên VU-16 kèm CHECKLIST-4Q
