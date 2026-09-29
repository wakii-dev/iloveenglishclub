# Env matrix — SF-1 QA baseline (task 1: env-matrix-verify)

Worktree: `sf-1-qa-baseline` · Branch: `wakii-dev/sf-1-qa-baseline` · HEAD lúc verify: `dae8ffc`
Bootstrap: `.env.local` copy từ worktree primary + sửa `DATABASE_URL` → local `ilec` + thêm `ADMIN_EMAIL`/`ADMIN_PASSWORD` (generate). Gitignored — không commit.

## Bảng matrix

| Var | Trạng thái | Ghi chú |
|---|---|---|
| `DATABASE_URL` | ✅ OK | `postgresql://hoivu@localhost:5432/ilec` — DB local **ilec** đã migrated (12 bảng) + seeded (users 20 · units 15 · lessons 20 · attempts 26). Primary worktree trỏ Neon remote (`ep-delicate-morning-...neon.tech`) — SF-1 chạy local để e2e không mutate data Neon. |
| `AUTH_SECRET` | ✅ OK | copy từ primary (dev-only, cùng secret local). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✅ OK | `admin@ilec.dev` / password ≥ 8 (generate). `e2e/global-setup.ts` tự `upsertAdmin` vào DB từ env lúc e2e start — không cần chạy tay `admin:create`. |
| `NEXT_PUBLIC_SITE_URL` | ✅ OK | `http://localhost:3000` — khớp baseURL admin config (port 3000). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_SECRET` | ⚠️ THIẾU (ghi nhận, KHÔNG fail) | Không có local lẫn primary → **OAuth Google không test được local**. SF-3 (oauth-google task) cần probe creds dev — nếu không có sẽ ghi evidence limit tương tự. |
| `BLOB_READ_WRITE_TOKEN` | ⚠️ THIẾU (by design local) | `storageDriver()` → **local** (`public/uploads`). Upload/blob driver test thật cần token dev → SF-4 upload-edge probe. Upload local driver vẫn test được (dev only). |
| `VERCEL_OIDC_TOKEN` | ➖ có từ primary, không dùng local | Vercel-specific, vô hại local. |

## Drivers + lanes (đọc từ code/config, không đoán)

- **Storage driver local** (`src/lib/storage.ts`): client-safe — pure URL/path helpers, KHÔNG import `@vercel/blob`; server-only `storage-server.ts` giữ putAudio/deleteAudio (split bởi `3617eed`). Local playback: `/public` path (`resolveAudioUrl` → `/${path}`); blob driver: path = URL CDN đầy đủ.
- **Vitest lanes**: `vitest.config.ts` (unit, `npm test`) · `vitest.rls.config.ts` (18 test, cần DB migrated) · `vitest.audit.config.ts` (`npm run test:audit`). Test mới (task 4/8) phải rơi vào lane include hiện hữu.
- **Playwright lanes**: `playwright.admin.config.ts` — port **3000**, baseURL `http://localhost:3000`, `npm run dev`, globalSetup đọc `.env.local` · `playwright.config.ts` (dictation) — port **3110**, `npm run dev -- --port 3110`. Cả 2 `workers:1` shared-DB — chạy tuần tự, không song song 2 config (giành DB/port).
- **E2E deps**: `npm ci` OK (721 packages, lockfile `package-lock.json` → npm, không phải pnpm).

## Kết luận task 1

Env đủ cho mọi lane trừ OAuth Google + Blob driver thật (thiếu creds — ghi nhận ở trên, không fail mơ hồ). Không có blocker cho task 2..10.
