# SF-2 Context Pack — Dictation engine + player flow QA

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-29-qa-hardening-design.md` (§3 SF-2, §4 registry). Plan: `docs/superpowers/plans/2026-09-29-qa-hardening-plan.md` (SF-2). Impact touch map: `specs/2026-09-29-qa-hardening-impact.md` §2a.

## Dispatch constants (P0-4 — dùng đúng, không tự đoán)

- **DB riêng:** `ilec_sf2` (đã tạo sẵn từ template bởi SF-1 — nếu chưa tồn tại: `createdb ilec_sf2 -T ilec` sau khi SF-1 merge)
- **Port:** `3210` — **Config:** `playwright.sf2.config.ts` (file MỚI, KHÔNG sửa `playwright.config.ts`)
- **Registry:** `findings-sf2.md`, ID **QA-100–199** · **Fixture:** mọi account/content test prefix `sf2-…@test.ilec`
- **Spec e2e mới prefix `dictation-*`** (anti-orphan P1-3 — baseline testMatch `/(dictation|progress|i18n).*\.spec\.ts/`; verify: `npx playwright test --list` phải thấy spec mới trong ≥1 config)

**Config checklist khi viết `playwright.sf2.config.ts`** (P1-5 — copy từ baseline dictation): testMatch chỉ suite mình (+ prefix mới) · `workers: 1` · `retries: 0` · `timeout: 60_000` · `fullyParallel: false` · port khớp 3 CHỖ (baseURL + webServer.url + webServer.command — hoặc đọc `E2E_PORT` env nhất quán) · autoplay policy nới cho headless · `reuseExistingServer: !process.env.CI` · webServer chạy `npm run dev -- --port 3210` với `DATABASE_URL` trỏ `ilec_sf2` (webServer env hoặc .env.local worktree).

**Bootstrap worktree (task 1):** `.env.local` gitignored — copy từ main worktree + sửa `DATABASE_URL` → DB `ilec_sf2`. Không có file này globalSetup/dev chết mơ hồ.

## Spec slice (chỉ phần SF-2 chịu trách nhiệm)

1. Scoring edge TRÊN UI THẬT: apostrophe (`’`/`'`), dấu câu đính token, hoa/thường (strict vs relaxed), unicode/input trống/input quá dài — đối chiếu truth `src/lib/dictation/diff.ts` (unit đã 100% branch). Lệch UI vs unit truth = finding.
2. Store state machine edge: reload giữa chừng, double-submit (dedup orchestrator), phase guard (action sai phase phải no-op).
3. Audio controls: speed/seek theo `mediaNonce`, audio 404 fail-soft, cả 2 driver (local `/audio/...` — blob URL đầy đủ; driver đọc từ `BLOB_READ_WRITE_TOKEN` — thiếu token local = driver local, ghi nhận).
4. Start-gate autoplay: Chromium desktop thật + mobile emulated (gesture gate hoạt động).
5. Part-nav (← → 1/21 →), progress bar, results screen, full transcript tab.
6. Guest flow: in-memory, banner login (ephemeral), reload mất đúng; relaxed toggle giữa chừng = **BY-DESIGN** (triage đúng, đừng fix).
7. **Mobile EMULATED iPhone 12 viewport** (device thật + IME thật ngoài khả năng agent → Recommendations cuối story); tap targets, keyboard Enter-as-submit, safe-area.
8. i18n en/vi trên lesson thật (đổi locale → copy đúng).
9. a11y: shortcuts panel, focus ring, aria trên flow thật (không chỉ Lighthouse).
10. **triage-fix:** fix TDD MỌI finding trong `findings-sf2.md` (policy "fix tất cả" — DEFERRED chỉ khi out-of-scope: dep upgrade/schema, phải rationale + sign-off PM qua epic comment) + e2e expansion theo finding (file `dictation-*.spec.ts` mới, chạy trong config sf2).
11. Mỗi fix: RED→GREEN đúng lane; chạm `src/lib/dictation/**` → giữ coverage 100% nhánh (`npx vitest run --coverage`); chạm messages → sửa CẢ en+vi (`npm test` có parity test).

## Touch map (files SF-2 tạo/sở hữu)

```
playwright.sf2.config.ts                        # MỚI
e2e/dictation-*.spec.ts                         # expansion MỚI (không sửa spec cũ trừ khi fix bug thật trong đó)
docs/superpowers/evidence/qa-hardening/findings-sf2.md
src/lib/dictation/**, src/components/dictation/**   # fix bug nếu tìm thấy (surgical)
```
READ-ONLY: auth/actions/admin (SF-3/4), seo/i18n-config (SF-5), scripts/lighthouse.mjs, baseline configs, evidence SF-8/VU-15.

## ACCEPTANCE (user-visible)

- Học 1 bài end-to-end trên browser desktop + mobile emulated: nghe → gõ → check → sửa → hint/skip → qua hết part → màn kết quả — không vướng bug mới.
- Input "bẩn" (sai hoa thường, dấu câu, unicode) cho kết quả ĐÚNG như spec scoring, hiển thị word-diff chuẩn.
- Guest học được; reload mất điểm là behavior đúng (đã banner); đăng nhập giữ điểm.
- Mọi bug tìm thấy trong surface này: FIXED có regression test, hoặc DEFERRED có sign-off.

## Boundary (KHÔNG làm)

- KHÔNG đụng auth/session/submit-attempt server logic (SF-3) — bug thấy ở đó → findings-sf2 ghi + PM phân (submit-attempt server-side thuộc SF-3).
- KHÔNG đụng admin/upload/storage-server (SF-4), seo/sitemap (SF-5), prod (SF-6).
- KHÔNG đổi schema/dep (DEFERRED path), KHÔNG redesign UI (direction B là story khác).
- KHÔNG sửa baseline playwright configs.
