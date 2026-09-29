# Phase 0 Impact Analysis — Story QA hardening (nền tảng VU-15 đã ship)

Date: 2026-09-29 · Analyst: phase0-impact-analyst · Story: QA hardening (follow-up VU-15)

## Cập nhật state so với briefing ban đầu

- Fix storage KHÔNG còn uncommitted — đã commit `3617eed` ("fix(build): split
  storage into client-safe + server-only") + push lên `origin/story-vu15-iloveenglishclub`.
  Working tree sạch. Branch **+114 commits so với origin/master** (chưa merge).
- **Local master có commit redesign in-flight**: `333a81b` ("direction B
  Classroom Warm approved — hand-off tokens/structure/behavior, design gate
  CLEARED") + `4872a87` (3 hướng prototype). Redesign sắp tới có thể đụng cùng
  component UI → fix QA phải surgical, ưu tiên logic-layer.

## 1. Problem framing

Nền tảng ship với bộ gate xanh tại SF-8 (218 unit + 18 rls + 13 audit + 17 e2e +
Lighthouse 7/7), nhưng gates chỉ phủ happy path đã biết. "Test, tìm bug và fix"
= **ba việc verifiable riêng biệt**:

1. Re-run toàn bộ test matrix trên HEAD hiện tại — xác nhận baseline chưa mục
   rệu (đặc biệt sau 2 commit build-fix `4d95320`, `3617eed`).
2. Exploratory QA có hệ thống theo từng functional surface (dictation flow,
   auth/session, progress/gamification, admin CMS, SEO/i18n, infra/deploy) —
   tìm bug NƠI TEST CHƯA PHỦ: edge case, mobile, race, i18n, dữ liệu.
3. Triage bug → fix TDD có regression test → re-verify.

Phạm vi: story **bảo toàn + sửa**, KHÔNG thêm tính năng, KHÔNG upgrade deps
(Next 16 + drizzle-kit tách story riêng theo khuyến nghị security checkpoint).

## 2. Touch map

Phương pháp: blast radius đo bằng grep importer thật trên working tree
(`story-impact` CLI không có trong session). Review cuối đo actual bằng cùng thước.

### 2a. Bề mặt QA + khả năng phải sửa (theo vertical slice)

| Surface | File chính (đã đọc) | Importer của module lõi |
|---|---|---|
| **Dictation engine (scoring)** | `src/lib/dictation/diff.ts` (positional diff, strict/relaxed, XP = round(10×acc×hint0.8×relaxed0.5), chỉ attempt đầu), `src/lib/dictation/store.ts` (state machine, singleton + factory, guards theo phase) | diff → 2 (word-diff-display, submit-attempt); store → 3 (sentence-dots, transcript-tab, dictation-lesson) |
| **Dictation UI flow** | `src/components/dictation/*` (14 components); orchestrator duy nhất `dictation-lesson.tsx` (audio sync theo mediaNonce, submit dedup, commit-on-mount) | attempt-key → 1, pending-commit → 1, submitAttempt → 1 (đều là dictation-lesson) |
| **Progress + gamification** | `src/lib/actions/submit-attempt.ts` (transaction FOR UPDATE, idempotent qua unique constraint, dailyActivity upsert, streak recompute), `src/lib/gamification/streak.ts` (TZ Asia/Ho_Chi_Minh, cap 400), `attempt-key.ts` (UUID cache, key NUL-separated), `pending-commit.ts` (sessionStorage guest commit) | streak → 4 (me page, heatmap, queries, submit-attempt) |
| **Auth/session** | `src/app/actions/auth.ts` (register transactional, 23505 → emailTaken, `next` phải bắt đầu `/`), `src/auth.config.ts`, `src/middleware.ts` (gate `/admin` JWT edge; role re-check DB ở `admin/layout.tsx`) | — |
| **Admin CMS** | `src/lib/actions/admin/{lessons,units,parts,users}.ts` (16 call site `assertAdmin()`), `src/app/api/admin/upload/route.ts` (size/mime limit, re-check admin, revalidateTag nếu published), `src/lib/admin/publish.ts` | guards → 5 (upload route + 4 action files); publish → 1 |
| **Storage (vừa fix `3617eed`)** | `src/lib/storage.ts` (client-safe helpers), `src/lib/storage-server.ts` (putAudio/deleteAudio server-only) | storage → 3 (lesson page, upload route, parts-editor); storage-server → 1 (upload route) |
| **SEO/i18n/public** | `src/lib/seo/*`, `src/lib/revalidate.ts` (→ 6 importers — tag lan rộng nhất), `messages/{en,vi}/*` (8 namespace, key-count en=vi), `src/i18n/*` | revalidate → 6 |
| **Test infra (thêm test, ít sửa prod)** | `vitest*.config.ts`, `playwright{,.admin}.config.ts`, `e2e/*`, `scripts/{lighthouse,security-scan,audit-thresholds}.mjs`, `.github/workflows/ci.yml` | — |

### 2b. Consumers/regression candidates

- `scripts/test-rls.test.ts` — contract authorization toàn hệ thống (18 tests,
  cần DB local `ilec` migrated+seeded, **không chạy trong CI**).
- `src/lib/storage.test.ts` — chỉ phủ 3 helper thuần; **chưa có test nào chặn
  client bundle kéo `@vercel/blob`** (chính là bug `3617eed`) — cần regression
  test dạng import-graph/lint rule.
- 4 e2e suite: dictation-guest + progress + i18n-switch (port 3110),
  admin-lesson (port 3000, globalSetup admin) — toàn bộ `workers:1`,
  `retries:0`, chia testMatch theo prefix (từng mồ côi spec do testMatch sai —
  SF-8 đã fix; cấu hình dễ gãy lại).
- Lighthouse: `scripts/lighthouse.mjs` (7 URL, median/3, chỉ trên `next start`
  build prod) + `scripts/audit-thresholds.test.ts`.

### 2c. Shared surfaces

- **DB schema** (10 bảng + view leaderboard): KHÔNG đụng trừ khi bug thật buộc
  sửa (khi đó flag riêng).
- **Config/env**: `BLOB_READ_WRITE_TOKEN` quyết định driver local/blob (2 code
  path phải test cả hai); `NEXT_PUBLIC_SITE_URL` ảnh hưởng canonical/sitemap/OG.
- **Trust boundary §3**: client chỉ gửi partId/typedText/clientAttemptId/usedHint —
  mọi fix giữ server-recompute score.
- **Events nội bộ**: `src/lib/gamification/events.ts` (`notifyStatsUpdated`) —
  commit-on-mount sau login phụ thuộc chuỗi này.

## 3. Second-order effects (12 chiều)

1. **Correctness/regression**: fix vào `diff.ts`/`store.ts`/`submit-attempt.ts` là
   fix vào code coverage 100% branch (thresholds siết `src/lib/dictation/**` +
   split-sentences) — mọi fix giữ 100% nhánh + thêm case RED→GREEN. Guard:
   `vitest run --coverage` trong verify.
2. **Security**: fix UX dễ vô tình nới authorization — guard: `test:rls` là
   contract; fix chạm auth/admin phải re-run `test:rls` + giữ 16 call site
   `assertAdmin()`; allowlist `security-scan.mjs` chỉ mở rộng có lý do.
3. **Data integrity**: QA ghi DB thật — local chấp nhận; **prod: user test +
   attempt rác nhiễm leaderboard/daily_activity prod** (không có cơ chế reset;
   `e2e/db.ts` read-only, không cleanup). Guard: email test `@test.ilec` +
   script cleanup review kỹ + quy ước data test tường minh.
4. **Performance**: fix thêm client JS có thể kéo perf < 0.85 mobile throttled —
   guard: re-run `scripts/lighthouse.mjs final` trước convergence.
5. **Accessibility**: fix UI dễ phá a11y ≥ 0.95 (sonner toast, radix dropdown là
   điểm rơi) — guard: Lighthouse gate + review aria mọi component sửa.
6. **i18n en/vi**: fix copy phải sửa CẢ `messages/en/*` + `messages/vi/*` —
   guard: `npm test` (có `src/messages.test.ts` parity theo key) sau mọi đụng
   messages.
7. **Browser/device**: autoplay policy, `<audio>` seek theo nonce, Enter-as-submit
   — mobile keyboard/IME, iOS Safari là vùng exploratory chưa có e2e (Playwright
   chỉ Chromium desktop). Guard: QA tay mobile viewport + evidence; không hứa fix
   browser không test được tự động.
8. **Deploy/ops**: 2 commit build-fix gần nhất chưa có bằng chứng deploy thật
   trong repo — QA prod trước khi confirm sẽ đo bản có thể vẫn lỗi. Guard: bắt
   story bằng smoke prod URL (nếu live) hoặc local prod build trước khi fix.
9. **DX/tooling/CI**: CI chỉ lint/typecheck/test/build — e2e + rls + audit chạy
   tay. Thêm lane e2e/rls vào CI cần Postgres service — việc tùy chọn ghi rõ,
   không tự ý nhồi SF. Flaky hiện hữu: `retries:0` + cold compile action 60–115s
   sát timeout test 60s (dictation config) → 1 lần chậm = fail.
10. **UX flows**: bug đã biết chưa fix — SessionProvider stale sau register
    (header còn guest, phải F5 — ghi trong `e2e/progress.spec.ts` là papercut
    "không fix trong SF-6"); guest commit sessionStorage chỉ sống 1 tab; relaxed
    toggle giữa chừng đổi mode check (by design, dễ bị report nhầm bug).
    Guard: triage tách "bug thật" vs "theo spec" bằng epic spec VU-15 §5.
11. **Maintenance**: fix nhỏ nhiều nơi phá ranh giới SF — mỗi fix kèm regression
    test đúng lane (vitest main / rls / audit / e2e) và đúng file config lane đó
    (3 config vitest chia include theo thư mục — test đặt sai chỗ không chạy
    trong lane nào cả).
12. **Business/convergence**: redesign direction B trên master — fix QA càng
    nhỏ càng tốt (surgical), không "làm đẹp" kèm theo; convergence chốt merge
    strategy với owner.

## 4. Alternatives

**A — Vertical slices theo functional surface (KHUYẾN NGHỊ):** tier-0 baseline
(re-run matrix + verify build-fix + regression test import-graph), rồi 4 SF
surface song song + 1 SEO/public + 1 convergence prod. Pros: song song được
(ranh giới gần như rời nhau theo bảng 2a), mỗi SF gate riêng, bug count unknown
vẫn khớp khú vì triage nằm trong SF. Cons: bug chéo surface phải quyết owner;
e2e `workers:1` → port/DB riêng mỗi SF (đã có lesson từ SF trước).

**B — Horizontal theo test type:** unit-SF / e2e-SF / exploratory-SF / convergence.
Cons: fix dồn cục, exploratory phát hiện muộn mà fix chạm code đã "đóng", không
song song theo surface, sửa tràn khó kiểm. REJECT.

**C (biến thể chồng lên A) — phạm vi prod:** local-only (an toàn dữ liệu, bỏ sót
cấu hình prod thật) vs có prod smoke (đủ post-deploy checklist + Lighthouse prod,
rủi ro nhiễu data). **User đã chốt: FULL QA CẢ PROD** (data test trên prod chấp
nhận) → prod là tier cuối có điều kiện: cần URL + creds từ user.

**Ngoài phạm vi (ghi tường minh):** upgrade Next 16 + drizzle-kit (story riêng),
thêm lane e2e/rls vào CI (đề xuất tách story), schema migration CHỦ ĐÍCH (migration
do bug thật bắt buộc → flag riêng + phê duyệt trước khi làm — khớp design §0),
thêm tính năng. Isolation e2e: mỗi SF DB riêng `ilec_sf{N}` + port riêng qua
config mới (chốt sau spec-critic P0-1 — khớp design §8).

**Framework flag:** SF 8–15 task liệt kê trước vs bug count ẩn số — resolution:
bracket `Tasks:` chốt cứng phần QA matrix + exploratory checklist; phần FIX là
task động sinh từ triage trong Phase 3 của SF (registry là nguồn sự thật; SF exit
= registry surface đó 0 OPEN theo chính sách "fix tất cả" của user).

## 5. Risks & unknowns

**Đã hỏi user (answered):** Full QA cả prod · Fix tất cả không chừa · Dep
upgrades ngoài story.

**Còn pending (REQUIREMENT-GAP khi SF-6 chạy nếu chưa có):**
1. Prod URL cụ thể (repo chỉ có localhost; deploy.md là template).
2. Prod admin account (deploy.md mục 4 — script local trỏ prod DB).

**Probe được không cần hỏi (thành task SF-1):**
3. DB local `ilec` migrated+seeded + `.env.local` admin creds (e2e globalSetup).
4. e2e flaky thật không trên HEAD: chạy 2–3 lần cả 2 config.
5. `next build` + `next start` local còn ổn sau 2 commit build-fix +
   `scripts/lighthouse.mjs pre` làm baseline trước khi fix gì.
6. Key-parity en/vi thật theo key (messages.test).

**Assumptions chưa verify:**
7. Prod deploy từ branch nào (branch +114 vs master chưa merge) — convergence
   chốt merge strategy với owner.
8. `3617eed` chưa có regression test chặn đúng bug nó fix — SF-1 biến thành
   test thật (import-graph/lint).
9. Key `attempt-key.ts` dùng ` ` separator (từng gây NUL-byte/git-binary)
   — test mới tránh ghi NUL vào file/output.

```
IMPACT-READY: touch map 8 surface / ~40 file lõi (importer đo bằng grep) · risks:
prod URL pending, e2e retries:0 dễ flaky, master redesign direction-B in-flight
```
