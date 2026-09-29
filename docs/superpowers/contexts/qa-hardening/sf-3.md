# SF-3 Context Pack — Auth/session + progress/gamification QA

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-29-qa-hardening-design.md` (§3 SF-3, §4 registry, §5.6 convergence). Plan: `docs/superpowers/plans/2026-09-29-qa-hardening-plan.md` (SF-3). Impact: `specs/2026-09-29-qa-hardening-impact.md` §2a.

## Dispatch constants (P0-4)

- **DB riêng:** `ilec_sf3` (template từ SF-1) · **Port:** `3211` · **Config:** `playwright.sf3.config.ts` (MỚI)
- **Registry:** `findings-sf3.md`, ID **QA-200–299** · **Fixture:** `sf3-…@test.ilec`
- **Spec e2e mới prefix `progress-*`** (baseline testMatch chứa `progress` — anti-orphan P1-3; verify `npx playwright test --list`)

**Config checklist** (P1-5): copy từ baseline `playwright.config.ts` (nhóm dictation/progress/i18n): testMatch chỉ suite mình · workers:1 · retries:0 · timeout 60s · fullyParallel:false · port khớp 3 chỗ (baseURL/webServer.url/webServer.command) hoặc `E2E_PORT` · autoplay nới · webServer `npm run dev -- --port 3210`→đổi 3211, DATABASE_URL → `ilec_sf3`.

**Bootstrap worktree (task 1):** copy `.env.local` từ main + `DATABASE_URL` → `ilec_sf3`. Cần `ADMIN_EMAIL/PASSWORD` nếu dùng globalSetup.

## Spec slice (chỉ phần SF-3 chịu trách nhiệm)

1. Register edge: duplicate email (23505 → thông điệp emailTaken), locale auto-set theo route, validation, transactional.
2. Login edge: sai mật khẩu, `next` param phải bắt đầu `/` (open-redirect guard), callback redirect.
3. **VERIFY fix `695f0ef` (session-sync.tsx)** — papercut "header còn guest sau register/login" đã được fix 2026-09-29 (spec-critic P1-6): viết e2e regression trên path register THẬT (không reload); **BỎ workaround `page.reload()` trong `e2e/progress.spec.ts:43`** — regression mới phải pass không cần reload.
4. OAuth Google: callback + locale + link account. Nếu env thiếu `GOOGLE_CLIENT_ID/SECRET` (SF-1 ghi trong evidence) → test code-path những chỗ được (googleEnabled false), ghi nhận giới hạn trong findings — KHÔNG fail mơ hồ.
5. Session lifecycle: expiry, logout, protected routes (`/me`, `/admin` redirect).
6. submitAttempt edge: double-submit race (2 click/2 tab), `clientAttemptId` idempotency (unique constraint `[userId, partId, clientAttemptId]`), `MAX_TYPED_LEN`, concurrency.
7. XP modifiers truth: chỉ attempt đầu có XP; hint ×0.8; relaxed ×0.5; replay = 0 — server value vs client preview khớp.
8. Streak TZ `Asia/Ho_Chi_Minh`: boundary 23:59 ICT, hôm qua +1 / hôm nay giữ / khác reset; cap.
9. Leaderboard: tuần ISO boundary (đầu tuần mới reset), all-time, guest ẩn (view chỉ expose display_name/avatar/xp).
10. `/me`: heatmap 12 tuần, tổng phút nghe = sum duration DISTINCT parts đã nghe, tiến độ books.
11. Guest mid-lesson commit: login giữa chừng → điểm in-memory commit đúng (sessionStorage 1-tab là BY-DESIGN).
12. **triage-fix:** fix TDD mọi finding trong `findings-sf3.md` (DEFERRED chỉ khi out-of-scope + rationale + sign-off PM) + e2e expansion (`progress-*.spec.ts`).
13. Mỗi fix chạm auth/actions → **re-run `npm run test:rls`** (18/18 — contract authorization); chạm `streak.ts`/`submit-attempt.ts` → giữ coverage; chạm messages → CẢ en+vi.

## Touch map (files SF-3 tạo/sở hữu)

```
playwright.sf3.config.ts                        # MỚI
e2e/progress-*.spec.ts                          # expansion MỚI (+ sửa page.reload() workaround — thuộc task 3)
docs/superpowers/evidence/qa-hardening/findings-sf3.md
src/app/actions/auth.ts, src/components/session-sync.tsx (nếu verify lộ bug),
src/lib/actions/submit-attempt.ts, src/lib/gamification/** (fix nếu tìm thấy)
```
READ-ONLY: dictation UI/store (SF-2), admin actions (SF-4), seo (SF-5), middleware + admin/layout gating (SF-4 probe chủ), evidence VU-15.

## ACCEPTANCE (user-visible)

- Đăng ký → header hiện ngay trạng thái đã đăng nhập (không phải F5); đăng nhập/đăng xuất sạch.
- Điểm không gian lận được: double-submit/concurrency không nhân XP; modifiers đúng; replay không cộng điểm.
- Streak/leaderboard/`/me` phản ánh đúng dữ liệu thật theo giờ Việt Nam.
- Mọi bug trong surface: FIXED có regression, hoặc DEFERRED có sign-off.

## Boundary (KHÔNG làm)

- KHÔNG đụng dictation UI/scoring (SF-2), admin CRUD/upload (SF-4), seo/public pages (SF-5), prod (SF-6).
- KHÔNG đổi middleware matcher / admin gating (SF-4 probe; thay đổi nếu bug thật → findings + PM).
- KHÔNG đổi schema/dep (DEFERRED path — vd khóa user cần cột `profiles.banned` → DEFERRED candidate nếu demand).
- KHÔNG xoá workaround `page.reload()` mà KHÔNG có regression test thay thế (test trước, bỏ sau).
