# SF-2 Spec slice — Dictation engine + player flow QA (VU-26)

Date: 2026-09-30 · Story: VU-24 QA hardening · Autonomous (story dispatch — epic questions đã chốt, KHÔNG hỏi lại)
Nguồn sự thật: context pack `docs/superpowers/contexts/qa-hardening/sf-2.md` + epic spec §3 SF-2 + bracket. File này ghi self-review brainstorm (6 câu template) trên code đã ĐỌC, không đặt lại scope.

## 1. Root cause / tại sao SF này tồn tại

229 unit tests phủ `diff.ts`/`store.ts` 100% branch nhưng toàn bộ ở node-env thuần — không có bằng chứng UI thật diễn giải đúng truth trên browser (mobile, autoplay policy, race Enter, i18n render, a11y flow). 6 e2e guest tests baseline chỉ phủ happy path. Bug sống ở ranh giới: store↔audio sync (mediaNonce), store↔submit dedup, UI↔truth (word-diff render), viewport cụ thể.

## 2. Problem (real, not solution)

Học viên dùng flow học bài hằng ngày — surface learner-facing quan trọng nhất. Chưa ai từng QA edge case trên UI thật: input bẩn (apostrophe/dấu câu/unicode/hoa-thường), reload giữa chừng, double-submit Enter, audio 404, mobile viewport. Mọi lệch UI vs `diff.ts` truth = bug thật.

## 3. Scope

**In (10 checklist items + triage):** scoring-edge-ui · store-edge · audio-controls · start-gate-browser · nav-progress-results · guest-flow · mobile-viewport (iPhone 12 emulated) · i18n-lesson · a11y-keyboard · triage-fix TDD mọi finding + e2e expansion prefix `dictation-*`.
**Out (boundary context pack):** auth/session/submit-attempt server logic (SF-3 — bug thấy ở đó → ghi findings chéo, KHÔNG fix), admin/storage-server (SF-4), seo (SF-5), schema/dep change (DEFERRED + sign-off), redesign UI, baseline playwright configs.

## 4. Touch map (đã đọc toàn bộ)

- Tạo: `playwright.sf2.config.ts`, `e2e/dictation-*.spec.ts`, `e2e/sf2-helpers.ts` (fixture DB).
- Sửa nếu bug thật: `src/lib/dictation/**` (giữ coverage 100% branch), `src/components/dictation/**` (surgical), `messages/{en,vi}/lesson.json` (CẢ HAI nếu chạm copy).
- READ-ONLY: auth/actions/admin, seo/i18n-config, baseline configs, evidence SF-8/VU-15.

## 5. Design — quyết định đã chốt (từ context pack + code)

1. **Config sf2** copy checklist P1-5: testMatch chỉ dictation suite (baseline `dictation-guest` + mới `dictation-*`) · workers:1 · retries:0 · timeout 60s · fullyParallel:false · port 3210 khớp baseURL/webServer.url/webServer.command · autoplay nới cho headless (start-gate gesture-gate verify ở REAL browser tier, không flags) · reuseExistingServer:!CI.
2. **Fixture:** user `sf2-learner@test.ilec` insert DB trực tiếp (pattern `seed-attempts.ts`, bcrypt) trong spec setup + **self-clean cuối spec** (delete user → CASCADE attempts). Lesson demo dùng content seed sẵn (read-only).
3. **Scoring edge test strategy:** import `diffWords` TRỰC TIẾP trong spec làm oracle — expected hiển thị tính từ truth, không hardcode kỳ vọng tay → lệch UI vs truth tự lộ.
4. **Store edge:** unit đã 100% branch → e2e chỉ test ranh giới UI: double-submit (đếm rows `attempts` qua `e2e/db.ts`), reload (in-memory by design), frozen controls.
5. **BY-DESIGN pre-classified (triage đúng, đừng fix):** relaxed toggle giữa chừng đổi mode check · guest commit chỉ sống sessionStorage 1 tab · reload mất điểm guest (đã banner).
6. **Autoplay:** e2e nới flag (stability); gesture-gate verify bằng real browser Orca (không flag) — audio.paused trước/sau Start.
7. **Mobile:** project iPhone 12 emulated (viewport 390×844, hasTouch, isMobile, DPR 3) — IME/thiết bị thật → Recommendations cuối story.
8. **MAX_TYPED_LEN 2000:** server-side (submit-attempt.ts, SF-3 read-only). UI hiện KHÔNG clamp → probe thật: gõ >2000 → server reject êm; nếu UI im lặng không báo → finding UX (fix thuộc type-panel SF-2).

## 6. Risks / assumptions đã verify

- DB `ilec_sf2` đã có đủ (SQL counts 38 parts) — KHÔNG cần migrate/seed lại. ✓verified
- Port 3210 tự do. ✓verified (lsof)
- Test `goto` = full page load → store singleton mới mỗi test (chỉ client-nav giữ state) — không ô nhiễm chéo test. ✓verified qua code `doStart()` reset-by-signature.
- Turbopack dev font race 1/4 start (memory QA-7) + action compile lạnh 60–115s sát timeout 60s → warm-up request trước assert; nếu flaky ≥2 lần = finding P1.
- Orca CDP screenshot có thể timeout (FI-464) → fallback headless Chrome CÙNG build, khai báo trung thực trong evidence.

## Status

Approved (story-level spec-critic đã chạy trên epic spec; slice này tự-review theo P3 autonomous checklist — counter-argument mạnh nhất: "10 items có overkill không?" → không: mỗi item là ACCEPTANCE dòng trong context pack, checklist qa-checklist.md yêu cầu tick từng cái kèm evidence).
