# Plan — SF-3 Auth/session + progress/gamification QA (VU-24 · VU-27)

Spec: `docs/superpowers/contexts/qa-hardening/sf-3.md` (epic-approved) · Bracket: `docs/superpowers/brackets/vu24-qa-hardening.md` (SF-3)
DB: `ilec_sf3` (LOCAL template) · Port 3211 · Findings: `findings-sf3.md` QA-200–299 · Fixture `sf3-…@test.ilec`

- [x] 1. e2e-config-db-bootstrap — `.env.local` worktree (DATABASE_URL local `ilec_sf3`, AUTH_SECRET, E2E_PORT=3211) · `playwright.sf3.config.ts` (port khớp 3 chỗ, testMatch `/progress.*\.spec\.ts/`, workers:1, retries:0, timeout rộng cho cold-compile) · `vitest.sf3.config.ts` + lane integration · verify `npx playwright test --list` (0 orphan progress spec) · dev server 3211 boot GREEN.
       AC: config mới chạy được ≥1 smoke; DB guard (connection string chứa ilec_sf3).
- [x] 2. register-edge — e2e `progress-register.spec.ts`: duplicate email → thông điệp emailTaken (en+vi); locale auto-set theo route (register /vi → profile locale vi + redirect /vi); validation (invalidEmail, weakPassword); transactional (user có profile — login được ngay).
       AC: mọi assert chạy xanh trên ilec_sf3.
- [x] 3. login-edge — e2e `progress-login.spec.ts`: sai mật khẩu → invalidCredentials; `next` guard (`//evil.com` protocol-relative probe — nếu lọt → finding QA-2xx + fix TDD); `?next=/en/me` → redirect đúng; callback redirect đăng nhập xong về `next`/`/{locale}`.
       AC: open-redirect probe có kết luận rõ (pass hoặc finding).
- [x] 4. session-sync-verify-regression — e2e `progress-session-sync.spec.ts`: register THẬT qua UI (không reload) → header hiện trạng thái đăng nhập ngay (XP chip / tên). Mutation-RED: tạm revert 695f0ef → spec ĐỎ → restore → GREEN. SAU ĐÓ bỏ `page.reload()` trong `e2e/progress.spec.ts:43` → re-run spec cũ GREEN.
       AC: regression GREEN cả 2 lần (trước + sau khi bỏ workaround); evidence mutation RED.
- [x] 5. oauth-google-probe — googleEnabled=false (không creds): /login + /register KHÔNG nút Google; `/api/auth/providers` trả `{}`; signin/google → behavior xác định (ghi nhận); findings-sf3.md ghi giới hạn env (không fail mơ hồ).
       AC: findings row BY-DESIGN/ENV-LIMIT có rationale.
- [x] 6. session-lifecycle — logout sạch (header guest); /me guest → redirect `/{locale}/login?next=/{locale}/me`; /admin guest → redirect login?next=/admin (middleware — probe READ-ONLY); user thường vào /admin → layout chặn (probe).
       AC: redirect chain đúng từng route.
- [x] 7. submit-attempt-edge — integration `scripts/sf3-submit-attempt.integration.test.ts` (mock auth, DB thật): double-submit race 2 Promise.all cùng clientAttemptId → 1 row, XP 1 lần; 2 tab (2 clientAttemptId khác nhau) → 2 rows, XP 1 lần; MAX_TYPED_LEN 2000 (2000 ok / 2001 badInput); clientAttemptId non-UUID → badInput; unauthorized → error; part unpublished → partNotFound. e2e UI: MAX_TYPED_LEN qua textbox → graceful, không row thừa.
       AC: đúng bảng truth; unique constraint chứng minh bằng row count.
- [ ] 8. xp-modifiers-truth — integration + e2e: chỉ attempt đầu XP; hint ×0.8; relaxed ×0.5 (flag profiles.relaxedMode qua updateRelaxedMode); replay 0; server value (DB) vs client preview (+chip UI) khớp.
       AC: Bảng 10/8/5/0 đúng từng tổ hợp accuracy×hint×relaxed.
- [ ] 9. streak-tz — integration: seed daily_activity (hôm qua / hôm nay / 2 ngày trước) → submit → streak theo computeStreak; boundary 23:59 ICT đã phủ bởi unit streak.test.ts (giữ); cap 400 (limit query) — probe unit. e2e: header/UI phản ánh streak seeded.
       AC: không suy biến unit; integration xác nhận path submit → DB → cache.
- [ ] 10. leaderboard-boundary — integration: insert attempts created_at tuần trước (SQL trực tiếp) → weekly view KHÔNG tính; tuần này tính; all_time = profiles.xp; view chỉ expose display_name/avatar_url/xp (information_schema). e2e /top-users: 2 bảng render đúng, không lộ email.
       AC: ISO Mon–Sun TZ+07 boundary chứng minh bằng data thật 2 tuần.
- [ ] 11. me-page-stats — integration getMyStats/getBookProgress: heatmap 84 ngày window; listenMinutes = sum duration DISTINCT parts (attempt lặp không đếm kép); accuracy TB = best-per-part; books progress done=all-parts-accuracy≥1. e2e /me render số khớp DB.
       AC: số UI = số SQL trực tiếp.
- [ ] 12. guest-mid-commit — e2e: guest học → login giữa chừng → commit đúng XP (mở rộng spec cũ: modifier hint/relaxed trong preview guest; sessionStorage 1-tab BY-DESIGN probe 2 tab → không leak).
       AC: commit idempotent, không cộng kép khi quay lại lesson.
- [ ] 13. triage-fix-e2e-expansion — fix TDD mọi finding findings-sf3.md (RED→GREEN, meta-test: test ĐỎ trên code cũ); re-run `npm run test:rls` 18/18 sau fix chạm auth/actions; giữ coverage streak/submit-attempt; messages sửa CẢ en+vi nếu chạm; e2e expansion hoàn thiện; evidence `test-run.txt` (unit/rls/audit/e2e + tdd line); Rule 0 browser 3 tầng; code-reviewer APPROVED; findings 0 OPEN (hoặc DEFERRED có rationale).

Exit: registry surface auth/progress 0 OPEN · papercut reload FIXED có regression · AC user-visible từng dòng verify được.
