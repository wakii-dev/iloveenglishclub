# Plan — QA hardening story (6 SF, DAG, phân bổ song song)

Objective: QA toàn nền tảng ILEC đã ship — matrix xanh baseline, exploratory QA
6 surface, fix TDD mọi finding (registry 0 OPEN), prod QA thật, final report.
Spec: `docs/superpowers/specs/2026-09-29-qa-hardening-design.md` + impact file.

## DAG

```
SF-1 (tier 0)
 ├─ SF-2 Dictation engine + player flow   (tier 1)
 ├─ SF-3 Auth/session + progress/game     (tier 1)
 ├─ SF-4 Admin CMS + storage/upload       (tier 1)
 └─ SF-5 SEO/i18n/public                  (tier 1)
      └─ tất cả → SF-6 Prod QA + convergence (tier 2)
```

Deps edges: SF-2→SF-1; SF-3→SF-1; SF-4→SF-1; SF-5→SF-1; SF-6→{SF-2,SF-3,SF-4,SF-5}.
Phases: P1 = SF-1 · P2 = SF-2..5 · P3 = SF-6. Phase gate = mọi SF phase merged
về nhánh đích + story-verify sạch + security-audit vòng nhẹ.

## Task decomposition per SF (tasks cứng — fix động từ triage theo registry)

### SF-1 QA baseline + infra hygiene (10 tasks, est 4) — thứ tự theo plan-critic P1-1
1. env-matrix-verify — .env.local đủ (ADMIN_EMAIL/PASSWORD cho globalSetup,
   GOOGLE_CLIENT_ID/SECRET có hay không — ghi nhận, không fail mơ hồ), driver
   local + blob path, NEXT_PUBLIC_SITE_URL local. (ĐỨNG ĐẦU — task 2/8 cần env.)
2. matrix-rerun-baseline — chạy cả 4 lane trên HEAD: `npm test` (unit),
   `test:rls`, `test:audit`, cả 2 e2e config; ghi số vào evidence baseline
   (lane flaky: ≥2/3 runs tính xanh, fail → registry kèm owner tier-1).
3. prod-build-verify — `next build` + `next start` sau `4d95320`+`3617eed`;
   smoke thủ công /en /vi /lesson + guard dev-indicator.
4. regression-storage-import — test chặn client bundle kéo `@vercel/blob`
   (import-graph test đọc src của storage.ts + lint rule); mutation RED khi
   revert tạm `3617eed` → GREEN khi restore.
5. registry-setup — `findings-sf1.md` theo format spec §4 (ID QA-1–99) + seed
   BY-DESIGN rows đã biết + tạo skeleton `findings-sf{2..6}.md` (dải ID cấp
   trước; SF-6 merge về `findings.md`).
6. qa-checklist-authoring — checklist exploratory per surface (nguồn SF-2..5),
   commit vào evidence dir.
7. e2e-flakiness-audit — chạy dictation config ×3 + admin ×3, đo fail rate,
   ghi flaky làm finding P1 nếu có; đánh giá retry/timeout điều chỉnh.
8. report-only-lighthouse-flag — thêm flag report-only vào
   `scripts/lighthouse.mjs` (SF-6 cần cho prod perf — spec §5.4) + param
   `LH_OUT_DIR` (plan-critic P0-3 — script đang hardcode OUT_DIR vào evidence
   SF-8, chạy pre sẽ GHI ĐÈ provenance VU-15). report-only = CHỈ nới perf,
   a11y ≥0.95 vẫn hard. TDD nhỏ.
9. lighthouse-pre — `scripts/lighthouse.mjs pre` với
   `LH_OUT_DIR=docs/superpowers/evidence/qa-hardening/lighthouse`, 7 URL
   median/3; exit criterion thêm: **evidence dir SF-8 không đổi** (git status
   sạch trên dir đó — P0-3).
10. db-template + test-data-hygiene — (CUỐI SF-1, sau khi mọi fix commit để
    template không stale — P2) quy ước `sf{N}-…@test.ilec` + cleanup helper DB
    local (dry-run) + tạo DB template tier-1: guard không còn connection trên
    `ilec` (P2) → `createdb ilec_sfN -T ilec` ×4 (sf2..sf5).

Exit: baseline matrix số thực tế ghi evidence + regression RED→GREEN + registry
sẵn + DB template + flag report-only + LH_OUT_DIR. Gate tier-0 KHÔNG đòi
behavior tier-1 (tier-gate rule).

### SF-2 Dictation engine + player flow (11 tasks, est 4, port 3210, DB ilec_sf2)
1. e2e-port-config — config MỚI `playwright.sf2.config.ts` port 3210 + DB riêng
   `ilec_sf2` + bootstrap `.env.local` worktree (copy main + sửa DATABASE_URL
   + E2E_PORT); KHÔNG sửa baseline configs. Spec e2e mới prefix `dictation-*`
   (P1-3 anti-orphan); config checklist trong context pack.
2. scoring-edge-ui — exploratory input đặc biệt (apostrophe/câu/unicode/trống/
   quá dài) đối chiếu diff.ts truth; ghi lệch UI vs unit truth.
3. store-edge — reload giữa chừng, double-submit, phase guard probe.
4. audio-controls — speed/seek/nonce, audio 404 fail-soft, cả 2 driver.
5. start-gate-browser — autoplay thật Chromium desktop + mobile emulation.
6. nav-progress-results — part ←/→, progress bar, results, transcript tab.
7. guest-flow — in-memory, banner, reload mất, relaxed toggle (BY-DESIGN check).
8. mobile-viewport — iPhone 12, keyboard Enter/IME, safe-area, tap targets.
9. i18n-lesson — en/vi parity trên lesson thật.
10. a11y-keyboard — shortcuts panel, focus ring, aria trên flow thật.
11. triage-fix — fix TDD mọi finding registry surface này + e2e expansion.

Exit: checklist 1-10 chạy hết có evidence + registry surface 0 OPEN + matrix
lanh lane xanh (unit nếu sửa lib + e2e dictation port mình).

### SF-3 Auth/session + progress/gamification (13 tasks, est 5, port 3211, DB ilec_sf3)
1. e2e-port-config progress — config MỚI `playwright.sf3.config.ts` port 3211 +
   DB riêng `ilec_sf3` + bootstrap `.env.local` worktree. Spec mới prefix
   `progress-*` (P1-3); config checklist trong context pack.
2. register-edge — duplicate email, locale set, validation, transactional.
3. login-edge — wrong pass, `next` guard, callback redirect.
4. session-sync-verify — VERIFY fix `695f0ef` (session-sync.tsx) bằng e2e
   regression path register thật + BỎ workaround `page.reload()` trong
   progress.spec (spec-critic P1-6 — papercut đã fix, còn verify + regression).
5. oauth-google — callback + locale + link (probe có creds Google dev không —
   không có thì ghi evidence limit, test code-path bằng mock/spot).
6. session-lifecycle — expiry, logout, protected routes.
7. submit-attempt-edge — double-submit race, clientAttemptId idempotent,
   MAX_TYPED_LEN, 2 tab concurrency.
8. xp-modifiers-truth — first-only + hint×0.8 + relaxed×0.5 server vs preview.
9. streak-tz — 23:59 ICT boundary, hôm qua+today, cap; so unit streak.ts.
10. leaderboard-boundary — ISO week đổi, all-time, guest ẩn.
11. me-page — heatmap 12 tuần, phút nghe DISTINCT, books progress đúng DB.
12. guest-mid-commit — login giữa chừng commit đúng điểm.
13. triage-fix — fix TDD mọi finding + e2e progress expansion.

Exit: tương tự SF-2 (registry 0 OPEN surface auth/progress; papercut FIXED).

### SF-4 Admin CMS + storage/upload (11 tasks, est 4, port 3010, DB ilec_sf4)
1. e2e-port-config admin — config MỚI `playwright.sf4.config.ts` port 3010 +
   DB riêng `ilec_sf4` + globalSetup admin riêng + bootstrap `.env.local`.
   Spec mới prefix `admin-*` (P1-3) + **re-runnable trên DB bất kỳ** (unit
   slug unique per run / self-clean cuối spec — sẽ chạy lại trên `ilec` lúc
   sweep, P1-4); config checklist trong context pack.
2. gating-probe — guest/user/forged-JWT qua 2 lớp; assertAdmin 16 call site
   không bị suy yếu sau fix (re-run test:rls).
3. dashboard-stats — số liệu khớp DB thật.
4. units-crud-edge — validation, duplicate, delete RESTRICT attempts.
5. lessons-crud-edge — CRUD + điều hướng editor.
6. split-sentences-ui — import + manual fix, unicode, NUL-safe.
7. upload-edge — size/MIME limit, per-file status, retry, numeric sort,
   mismatch; cả 2 driver local + blob (blob: probe creds dev).
8. publish-gate — validation chặn/cho, revalidateTag firing → site thấy thật.
9. audio-replace — duration failsoft đúng.
10. users-mgmt — đổi role, chặn tự-đổi, enum validate runtime.
11. triage-fix — fix TDD mọi finding + e2e admin expansion.

Exit: registry 0 OPEN surface admin + gating không suy yếu (test:rls 18/18).

### SF-5 SEO/i18n/public pages (10 tasks, est 4, port 3212, DB ilec_sf5)
1. e2e-port-config i18n — config MỚI `playwright.sf5.config.ts` port 3212 +
   DB riêng `ilec_sf5` + bootstrap `.env.local` worktree. Spec mới prefix
   `i18n-*` (P1-3); config checklist trong context pack.
2. metadata-parity — en/vi canonical/hreflang cặp đúng, domain từ env.
3. sitemap-check — chỉ published, mọi URL resolve 200.
4. jsonld-validity — parse + round-trip escape + schema.org fields.
5. og-images — render động đúng title/locale.
6. fallback-chain — vi→en→raw render verify trên content thiếu translation.
7. robots-middleware — robots.txt đúng + matcher không lấn public/api.
8. browse-flow — home carousel `82bbb3b` → books → book → unit → lesson; exit
   criteria thêm (P0-2): URL không tồn tại → not-found 404 render đúng en/vi;
   trigger error boundary → `error.tsx` render đúng (`e1e5967`).
9. messages-parity-key — parity thật theo key (messages.test).
10. triage-fix — fix TDD mọi finding + e2e i18n expansion.

Exit: registry 0 OPEN surface seo/i18n/public.

### SF-6 Prod QA + convergence (13 tasks, est 5)
0. bootstrap — `.env.local` worktree (copy main) + precondition flag report-only
   (`grep -q "report-only" scripts/lighthouse.mjs` — fail → merge commit SF-1
   task 8 trước, P1-2) + `npm run db:migrate` trên DB `ilec` (idempotent, phòng
   tier-1 merge migration do bug ép).
1. deploy-strategy — chốt với owner: prod theo branch đích hay merge trước;
   REQUIREMENT-GAP prod URL (production hay preview) + branch Vercel watch +
   admin creds + **Blob token prod** (cleanup pha b) nếu chưa có (comment epic,
   làm phần không-blocked trước).
2. prod-smoke-public — en/vi + sitemap + robots + canonical domain thật.
3. prod-dictation-flow — học thật 1 bài, account `@test.ilec`, attempt thật.
4. prod-admin-flow — tạo + publish lesson `[QA]` trên prod, thấy trên site.
5. lighthouse-final-local — (P0-1: AC#5 "local final" cần chủ sở hữu) `next
   start` trên HEAD nhánh đích + `node scripts/lighthouse.mjs final` với
   `LH_OUT_DIR` qa-hardening → exit binary 7/7 PASS (a11y≥0.95, perf≥0.85 —
   hard gate local); evidence kèm số local cho task 6 so sánh.
6. prod-lighthouse — 7 URL median/3 protocol SF-8 trên prod URL, DÙNG flag
   report-only (SF-1 task 8): a11y ≥0.95 hard gate, perf report-only + root-cause
   mọi mức sụt so local (spec §5.4); `LH_OUT_DIR` qa-hardening.
7. prod-security-postcheck — headers, cookies, env leak, admin edge.
8. prod-cleanup — 2 PHA: DB theo thứ tự FK (attempts → progress → parts →
   lessons/units → users @test.ilec + daily_activity + xp rollback) + Vercel
   Blob list/delete theo path `[QA]`; review + dry-run cả 2 pha trước khi chạy thật.
9. regression-sweep-final — **KHÔNG phụ thuộc prod — chạy được khi GAP #3 chưa
   resolve** (P2). Lane list tường minh (P1-4): unit + rls + audit + 2 config
   baseline + 4 config sf{2..5}, TẤT CẢ trên DB `ilec` (template migrated+seeded
   mới nhất); exit: toàn bộ xanh + số test ≥ baseline (AC#1); trên HEAD nhánh
   đích lúc CLOSE (convergence protocol §5.6 — checklist re-run sau merge vào
   Recommendations).
10. registry-close — merge `findings-sf{1..6}.md` → `findings.md`; 0 OPEN toàn
    story; DEFERRED có rationale + sign-off; BY-DESIGN re-review lần cuối.
11. recommendation-report — Next 16 + drizzle-kit upgrade + CI e2e/rls lanes +
    checklist re-run sau merge + thiết bị thật/IME (ngoài khả năng agent).
12. final-report — QA report tổng hợp + evidence + sign-off gates.

Exit: AC §6 spec 1-8 từng cái đúng/sai binary; STORY-COMPLETE theo CLOSE.

## Phân bổ song song + shared resources

- Parallel cap 4: SF-2..5 chạy đồng thời sau SF-1; SF-6 một mình.
- **Isolation (spec-critic P0-1 — thiết kế, không phải claim):** mỗi SF DB RIÊNG
  `ilec_sf{2..5}` (template từ `ilec` migrated+seeded — SF-1 task 8) + port riêng
  qua config MỚI `playwright.sf{N}.config.ts` (KHÔNG sửa 2 baseline configs) +
  `.env.local` riêng mỗi worktree (gitignored — bootstrap task trong context pack).
  Fixture prefix `sf{N}-…@test.ilec`; SF-4 chỉ mutate `[QA-SF4]` content.
- **Registry per-SF** (P0-2): `findings-sf{1..6}.md` + dải ID cấp trước
  (1-99/100-199/200-299/300-399/400-499/500+); SF-6 merge về `findings.md`.
- Merge: SF merge về nhánh đích ngay khi xong (parent-merge rule); conflict
  units/messages files → merge theo thứ tự hoàn thành, rebase nhẹ nhàng; SAU
  MỖI merge tier-1 re-run `npm test` (unit gồm messages parity — phát hiện đứt
  parity ngay tại merge, P2).
- PR cuối story (SF-6 / CLOSE): `gh pr create --base master --head
  story-vu24-qa-hardening` — **directive user 2026-09-29** ("tạo pr vào master").
  Fork base vẫn `story-vu15-iloveenglishclub` (platform code). Người merge PR.
- Security-audit: vòng nhẹ mỗi phase checkpoint (P1 cuối, P2 cuối, P3 cuối) —
  `security-scan.mjs` + test:rls + review diff chạm auth.
