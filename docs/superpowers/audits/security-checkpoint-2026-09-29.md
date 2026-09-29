# Security Checkpoint — SF-8 Production + audit (VU-23)

Date: 2026-09-29 | Story: VU-15 | Worktree: `sf-8-production-audit` | HEAD khi audit: xem evidence
Contract: epic spec §3 trust boundary + §10 M6 · Pivot epic-level: "Supabase production/RLS" = Neon + Auth.js + **app-level authorization semantics** (REQUIREMENT-GAP chốt từ SF-1/2 — không có DB-level RLS; verdict nguồn = code-read action + `test:rls` assert semantics)
Phương pháp: mỗi mục = lệnh/grep + **code-read** (không tin grep một mình) + verdict. Bằng chứng tái chạy được: `node scripts/security-scan.mjs` + `npm run test:rls`.

## Kết luận nhanh

**9/9 mục có verdict: 7 PASS · 2 ACCEPTED (có lý do ghi rõ) · 0 FAIL.** 1 gap phát hiện trong quá trình audit (thiếu assert xp/role-protection trong `test:rls`) → **đã đóng** bằng test mới (meta-test mutation RED→GREEN, commit xem evidence). Deploy prod thật chờ infra (REQUIREMENT-GAP riêng trên VU-23/VU-15) — checkpoint này phủ codebase + DB local; **chưa phủ cấu hình prod (env vars/Vercel/Neon)** — mục đó thuộc post-deploy checklist trong `docs/deploy.md`.

## Checklist — verdict từng mục

### 1. Role-check MỌI Server Action — **PASS**

Inventory tự động (`node scripts/security-scan.mjs` — 8 files, 22 actions). Code-read từng file:

| File | Actions | Kiểm soát truy cập | Verdict |
|---|---|---|---|
| `src/app/actions/auth.ts` | loginAction, registerAction | **Public-by-design** (entry auth). Validate: EMAIL_RE, bcrypt hash cost 10, `locale` whitelist (`parseLocale` chỉ nhận "vi"/mặc định "en"), `next` redirect chỉ nhận path bắt đầu `/` (chống open-redirect) | PASS |
| `src/lib/actions/relaxed-mode.ts` | readRelaxedMode, updateRelaxedMode | `auth()` server-side — KHÔNG nhận userId từ client; `updateRelaxedMode` `.set({relaxedMode})` **column-whitelist**; no-session → `{ok:false}` | PASS |
| `src/lib/actions/admin/lessons.ts` | create/update/delete/publish/unpublish (5) | `assertAdmin()` mỗi action (role re-check DB qua guards — không tin JWT) | PASS |
| `src/lib/actions/admin/parts.ts` | add/updateText/move/split/mergeDown/insertEmpty/delete (7) | `assertAdmin()` mỗi action | PASS |
| `src/lib/actions/admin/units.ts` | create/update/delete (3) | `assertAdmin()` mỗi action | PASS |
| `src/lib/actions/admin/users.ts` | changeUserRoleAction (1) | `assertAdmin()` + **runtime validate** role enum (chống crafted payload — review P2 cũ) + **chặn đổi role chính mình** | PASS |
| `src/lib/actions/my-stats.ts` | readMyStats | Session-scoped: `auth()` → userId từ session, không param từ client | PASS |
| `src/lib/actions/submit-attempt.ts` | submitAttempt | `auth()` → unauthorized sớm; validate input (MAX_TYPED_LEN, UUID_RE cho clientAttemptId); userId từ session | PASS |

`assertAdmin` (`lib/content/guards`): session → DB `profiles.role` — role re-check DB mỗi lần gọi (đã có test assertAdmin DENY user/guest, ALLOW admin — `test:rls`).

### 2. Trust boundary §3 (client không gửi score) — **PASS**

`submitAttempt(input)` interface: `{partId, typedText, usedHint, clientAttemptId}` — **không có** accuracy/wpm/xp. Scoring server-side: `scoreAttempt({transcript: part.text (từ DB), typed: typedText, …})` (`submit-attempt.ts:127`). Client chỉ gợi ý preview (pure module dùng chung) — giá trị lưu là do server tính.

### 3. XP protection + service-role atomic — **PASS** (gap đã đóng)

- `submitAttempt` chạy trong 1 transaction: upsert attempts (ON CONFLICT target `[userId, partId, clientAttemptId]` — chống double-submit) + XP chỉ lần đầu (`isFirst ? score.xp : 0`) + daily_activity upsert + streak recompute + progress upsert. XP update **single statement atomic**: `xp: sql\`${profiles.xp} + ${isFirst ? score.xp : 0}\`` trên row `SELECT … FOR UPDATE`.
- User-facing profiles write DUY NHẤT = `updateRelaxedMode` (column-whitelist). **Gap phát hiện:** 17 test cũ của `test:rls` KHÔNG có assert nào chặn ghi `profiles.xp/role/streak` qua action user-facing → **đã thêm** (mục 4): call `updateRelaxedMode(true)` với session userA → assert `relaxed_mode=true` và `xp=50` / `role=user` / `streak_count=0` nguyên vẹn. **Meta-test mutation:** thêm tạm `xp: 999` vào `.set` → assert ĐỎ (cả leaderboard test phụ thuộc xp cũng đỏ) → revert → GREEN. Test có sức bắt thật, không tautology.

### 4. `test:rls` re-run — **PASS**

`npm run test:rls` → **18/18 PASS** (17 cũ + 1 mới mục 3), exit 0, DB local `ilec` (schema migrated + seed 7 books). Output đầy đủ: `docs/superpowers/evidence/sf-8-production-audit/test-run.txt`.

### 5. Secrets & file hygiene — **PASS**

`node scripts/security-scan.mjs` (exit 0):
- `env-not-in-git`: git ls-files chỉ có `.env.example`; `.env.local` gitignored (đã verify `git check-ignore`)
- `no-hardcoded-secrets`: 0 literal secret ≥8 ký tự trong code tracked (pattern: AUTH_SECRET/CLIENT_SECRET/READ_WRITE_TOKEN/ADMIN_PASSWORD/PRIVATE_KEY — loại dòng `process.env`)
- `env-example-no-real-values`: mọi secret key trong `.env.example` để TRỐNG giá trị
- `exec-bits`: 0 file exec-bit ngoài node_modules/.git/.next

### 6. Lockfile deps (npm audit) — **ACCEPTED (có lý do)**

`npm audit`: **6 vulns (5 moderate + 1 high), 5 advisory ID** — toàn bộ thuộc 2 chuỗi: **postcss bundle trong next** (1117015, 1124252, 1130709, 1139510 — build-time tooling; app không nhận CSS không tin cậy lúc runtime: React escape mặc định + JSON-LD serializer escape riêng) và **esbuild dev-server** (1102341 — qua drizzle-kit, dev-only, không vào bundle prod). **Quyết định ACCEPTED** với allowlist tường minh trong `scripts/security-scan.mjs` (exit non-0 khi advisory NGOÀI allowlist — audit sau này sẽ bắt vuln mới). Fix thật = upgrade Next 16 + drizzle-kit — **breaking**, ngoài ngưỡng convergence → khuyến nghị SF riêng.

### 7. Admin gating 2 lớp — **PASS**

Lớp 1 middleware (edge, JWT): chặn chưa-login `/admin`. Lớp 2 `admin/layout.tsx` (node runtime): `auth()` → DB `profiles.role !== "admin"` → redirect `/` (code-read xác nhận; không tin middleware một mình). Guard class lỗi: middleware giả mạo JWT không qua được lớp 2.

### 8. SQLi / XSS — **PASS**

- SQLi: mọi query qua drizzle parameterized; các `sql\`` template nội bộ chỉ nội suy **column refs** + parameter bind (`sql\`${profiles.xp} + ${n}\``), 0 dùng `sql.raw` (grep = 0 kết quả)
- XSS: React escape mặc định; `dangerouslySetInnerHTML` đúng 2 nơi — JSON-LD script SF-7, đều qua `jsonldScript()` escape `<` (có meta-test round-trip); grep `dangerouslySetInnerHTML` ngoài đó = 0

### 9. Transcript/audio public — **ACCEPTED (theo thiết kế)**

Full transcript + audio đọc anon — quyết định epic #11 có chủ đích (mô hình DailyDictation); không phải lộ hổng. Leaderboard view đã kiểm trong `test:rls`: chỉ expose `scope/display_name/avatar_url/xp` — không id/email.

## Giới hạn của checkpoint này (trung thực)

1. Đo trên **DB local + code hiện tại** — chưa đo cấu hình prod thật (Neon prod branch, Vercel env, Blob token) vì chưa có infra: các mục deploy-env thuộc post-deploy checklist `docs/deploy.md`.
2. "RLS" ở đây là **app-level authorization semantics** (pivot SF-1/2) — không có DB-level row security; nếu ngày nào chuyển Neon sang role-multi-user cần remap lại checklist này.
3. Dependency audit là ảnh tại thời điểm chạy — allowlist trong scan script giữ gate cho lần chạy sau.
