# Story Design — QA hardening: test toàn nền tảng, tìm bug và fix (follow-up VU-15)

Date: 2026-09-29 · Pipeline: story-workflow CREATE · Strictness: ALL ON
P0 impact: `docs/superpowers/specs/2026-09-29-qa-hardening-impact.md` (đọc kèm — touch map + 12 chiều + risks)

## 0. IDEA-BRIEF (8 chiều)

- **Task** — "test, tìm bug và fix" → hệ thống hoá QA: (1) re-run toàn bộ test
  matrix trên HEAD (sau 2 commit build-fix `4d95320`/`3617eed`), (2) exploratory
  QA có hệ thống theo functional surface tìm bug nơi test chưa phủ (edge case,
  mobile, race, i18n, dữ liệu), (3) triage → fix TDD có regression test →
  re-verify. KHÔNG thêm tính năng, KHÔNG upgrade deps.
- **Output** — nền tảng ILEC đã ship ở trạng thái "đã QA sâu": matrix xanh,
  mọi bug tìm thấy đã fix + regression test, findings registry 0 OPEN, QA report
  tổng hợp + evidence, prod đã được QA thật (Lighthouse + flow thật trên prod URL).
- **Users** — học viên guest/user học dictation; admin nhập content. QA thực thi
  bởi SF agents; prod data test do user chấp nhận.
- **Constraints** — MUST: giữ mọi gate xanh (218 unit + 18 rls + 13 audit + 17
  e2e + Lighthouse a11y≥95/perf≥85); mọi fix kèm regression test RED→GREEN đúng
  lane. MUST-NOT: đổi schema trừ khi bug buộc (flag riêng); nới authorization
  (test:rls là contract); "làm đẹp" kèm theo (redesign direction B đang in-flight
  trên master — fix surgical); upgrade Next/drizzle-kit.
- **Input** — codebase VU-15 hoàn chỉnh (8 SF, review APPROVED); test infra sẵn
  (2 playwright configs, 3 vitest configs, lighthouse/security-scan runners);
  fix `3617eed` (storage client-safe split) CHƯA có regression test; papercut
  SessionProvider-stale ĐÃ được fix `695f0ef` trong lúc CREATE → SF-3 verify +
  regression (không còn là fix-mới).
- **Context** — VU-15 epic Done; branch `story-vu15-iloveenglishclub` +114 so với
  master chưa merge; master có redesign direction B approved (sắp đụng cùng UI);
  prod Vercel đã deploy (URL + admin creds chờ user cung cấp — REQUIREMENT-GAP
  khi SF-6 chạy nếu chưa có).
- **Success criteria** (binary) — mọi SF: registry surface đó 0 OPEN + matrix
  xanh; story: 1 vòng QA prod thật (smoke + dictation flow + Lighthouse 7 URL
  median/3) trên prod URL; final report + evidence commit; gates security +
  Lighthouse không tụt.
- **Out-of-scope** — upgrade Next 16 + drizzle-kit (6 vulns ACCEPTED —
  recommendation cuối story); thêm lane e2e/rls vào CI (đề xuất, tách story);
  redesign UI theo direction B; nhập nội dung khóa học thật; schema migration chủ đích.

## 1. Decisions user đã chốt (2026-09-29)

| # | Decision | Chốt |
|---|---|---|
| 1 | Môi trường QA | **Full QA cả prod** — kể cả tạo account/attempt thật trên prod DB (data test chấp nhận) |
| 2 | Chính sách fix | **Fix tất cả không chừa** — exit criteria: registry 0 OPEN; rủi ro story phình đã được user chấp nhận; triage vẫn tách bug-thật vs by-design vs enhancement (enhancement → recommendation, không phải finding) |
| 3 | Dep upgrades | **Ngoài story** — Next 16 + drizzle-kit ghi recommendation cuối story |
| 4 | PR cuối story | **Tạo PR vào `master`** (directive "khi làm xong hãy tạo pr vào master") — người vẫn là người merge. Fork base của story worktree = `story-vu15-iloveenglishclub` (branch chứa platform +114 commits); PR cuối = `story-vu24-qa-hardening` → `master`, chứa platform VU-15 + QA fixes. PR #1 (VU-15 → master, đang OPEN): nếu user merge trước thì PR story chỉ còn QA fixes; nếu không, PR story gộp cả hai — merge PR #1 sau đó sẽ tự rỗng, user có thể đóng |

State liên quan (verified 2026-09-29): GitHub **default branch = `story-vu15-iloveenglishclub`**
(giải thích origin/HEAD + resolver bậc 5); PR #1 VU-15 → master OPEN chờ người merge.
Khuyến nghị user: merge PR #1 trước khi story này xong (hoặc sau — PR story chứa đủ);
đổi default branch về master trên GitHub khi ổn định.

REQUIREMENT-GAP còn pending (KHÔNG chặn CREATE; SF-6 hỏi lại qua epic comment
khi chạy): prod URL cụ thể; prod admin creds.

## 2. Story structure — 6 SF, 3 tiers, 3 phases

**Direction A (vertical slices theo surface)** — analyst khuyến nghị; B
(horizontal theo test type) REJECT (fix dồn cục, không song song, sửa tràn).
Song song giữa tier-1 SFs an toàn vì ranh giới touch map gần như rời nhau
(impact §2a); bug chéo surface → ownership rule §4.

```
Tier 0  SF-1 QA baseline + infra hygiene          Phase 1 (shippable: baseline xanh + regression test 3617eed)
Tier 1  SF-2 Dictation engine + player flow       ┐
        SF-3 Auth/session + progress/gamification │ Phase 2 (shippable: bug fixes surface)
        SF-4 Admin CMS + storage/upload           │ (4 SF song song, port e2e riêng)
        SF-5 SEO/i18n/public pages                ┘
Tier 2  SF-6 Prod QA + convergence                Phase 3 (prod sign-off + registry 0 OPEN toàn story)
```

Phased-release: mỗi phase COMPLETE (SFs merged + story-verify sạch + security
checkpoint nhẹ) mới mở phase sau; RELEASE checkpoint = merge phase lên nhánh
đích + push (deploy Vercel tự theo branch). Watchdog `RELEASE_GATE` không bật
(user đã duyệt bracket này làm phase-gate).

**SF-scope policy:** mỗi SF 8–15 tasks cứng (QA matrix + exploratory checklist);
phần FIX là task động sinh **sau triage trong vòng đời SF** (impact §4 flag) —
registry là nguồn sự thật, SF exit = registry surface đó 0 OPEN (DEFERRED theo
§4 không tính OPEN). Anti-duplicate
đã kiểm: pattern "triage+fix" và "e2e expansion" lặp theo surface là Zweck của
từng SF (touch map khác nhau — exemption như merge-to-parent); shared infra
(registry, checklist, flaky audit, cleanup helper, import-graph test) dồn SF-1.

## 3. SF list (chi tiết behavior — bracket ghi bản ngắn)

### SF-1 QA baseline + infra hygiene (tier 0)
Re-run toàn bộ matrix trên HEAD hiện tại (unit 218 + rls 18 + audit + 4 e2e
suite ×2 config); verify `next build` + `next start` local sau 2 commit
build-fix; **regression test chặn client bundle kéo `@vercel/blob`** (RED→GREEN
cho `3617eed` — import-graph test + lint `no-restricted-imports`); Lighthouse
`pre` baseline (7 URL median/3); findings registry setup (format: ID/severity/
surface/repro/root-cause/fix-commit/regression-test/status; evidence dir);
QA checklist exploratory per surface (nguồn cho SF-2..5); e2e flakiness audit
(chạy 2–3 lần cả 2 config, đo tỉ lệ fail — `retries:0` + cold compile sát
timeout); test-data hygiene: quy ước `@test.ilec` + cleanup helper DB local;
env matrix verify (admin creds local, driver local vs blob path).
Exit: matrix xanh baseline (escape hatch ≥2/3 runs cho lane flaky — AC#1) +
registry sẵn + regression test `3617eed` RED→GREEN.

### SF-2 Dictation engine + player flow QA (tier 1, dep SF-1)
Exploratory QA flow học bài end-to-end trên browser thật + mobile viewport:
scoring edge trên UI thật (apostrophe/dấu câu/hoa-thường/unicode/input trống)
đối chiếu truth `diff.ts`; store state machine edge (phase guard, double-submit,
reload giữa chừng); audio controls (speed/seek/nonce, audio 404, cả 2 driver);
start-gate autoplay trên Chromium desktop + mobile emulated; part-nav/progress/
results/transcript-tab walkthrough; guest flow (in-memory, banner, reload mất) +
relaxed toggle giữa chừng (by-design — triage đúng); **mobile EMULATED iPhone 12
viewport** (device thật + IME thật ngoài khả năng agent — đưa Recommendations
cho user, spec-critic P1-2); i18n en/vi trên UI thật; a11y keyboard/shortcuts/
focus. Fix TDD mọi finding trong registry surface này (KHÔNG cap — policy user)
+ e2e expansion theo finding (config riêng `playwright.sf2.config.ts`, port 3210).

### SF-3 Auth/session + progress/gamification QA (tier 1, dep SF-1)
Register edge (duplicate email, locale set, validation, transactional); login
edge (wrong pass, `next` path guard/open-redirect); **VERIFY fix SessionProvider
stale `695f0ef`** (session-sync.tsx — đã commit 2026-09-29 trong lúc CREATE) bằng
e2e regression path register + bỏ workaround `page.reload()` trong progress.spec
(spec-critic P1-6); OAuth Google callback + locale + link account (probe creds —
thiếu `GOOGLE_CLIENT_ID/SECRET` local → ghi nhận env matrix, không fail mơ hồ);
session expiry/logout/protected routes; submitAttempt edge (double-submit race,
clientAttemptId idempotency, MAX_TYPED_LEN, concurrency 2 tab); XP modifiers
truth (first-only, hint×0.8, relaxed×0.5) server vs client preview; streak TZ
edges (23:59 ICT, hôm qua+today, cap); leaderboard ISO week boundary + all-time +
guest ẩn; me page (heatmap 12 tuần, phút nghe DISTINCT parts, books progress);
guest mid-lesson commit (sessionStorage, 1-tab). Fix TDD + e2e progress expansion
(config riêng `playwright.sf3.config.ts`, port 3211).

### SF-4 Admin CMS + storage/upload QA (tier 1, dep SF-1)
Admin gating 2 lớp probe (guest, user thường, forged JWT → layout layer);
dashboard stats đúng; units/lessons CRUD edge (validation, duplicate, delete
RESTRICT khi có attempts); split-sentences UI (import module + manual fix,
unicode — NUL-safe qua attempt-key lesson); upload edge (size limit, MIME sai,
per-file status, retry riêng file, numeric sort, mismatch handling) trên CẢ 2
driver local + blob; publish gate validation + revalidateTag firing thật
(publish → site thấy); audio replace duration failsoft; users mgmt (đổi role,
chặn tự-đổi, runtime enum validate; gap "khóa user" thiếu cột banned →
DEFERRED candidate nếu surface demand nó). Fix TDD + e2e admin expansion
(config riêng `playwright.sf4.config.ts`, port 3010).

### SF-5 SEO/i18n/public pages QA (tier 1, dep SF-1)
generateMetadata locale parity (en/vi, canonical, hreflang cặp, domain thật từ
`NEXT_PUBLIC_SITE_URL`); sitemap chỉ published + URLs resolve được; JSON-LD
validity (parse + round-trip escape); OG images động render; fallback chain
vi→en→raw render verify; robots.txt + middleware matcher (admin exclude không
lấn route public/`/api`); public browse flow (home carousel mới `82bbb3b` →
books → book → unit → lesson); error boundary `error.tsx` + not-found 404
(`e1e5967`) hiển thị đúng; messages key parity thật theo key. Fix TDD + e2e
i18n expansion (config riêng `playwright.sf5.config.ts`, port 3212).

### SF-6 Prod QA + convergence (tier 2, deps SF-2..5)
Deploy code mới lên prod (chốt merge strategy với owner — branch +114 vs master;
REQUIREMENT-GAP: prod URL + admin creds nếu chưa có); prod smoke public (en/vi,
sitemap, robots, canonical domain thật); prod dictation flow thật (account
`@test.ilec`, attempt thật); prod admin QA (tạo + publish 1 lesson trên prod,
thấy trên site); **Lighthouse trên prod URL** (7 URL median/3 — local chỉ là
xấp xỉ tối ưu); prod security postcheck (headers, cookies Secure/HttpOnly, env
không leak, admin route edge); test-data cleanup prod (script review kỹ — xoá
đúng rows `@test.ilec`); cross-surface regression sweep final (toàn matrix trên
merge cuối); registry close 0 OPEN toàn story; recommendation report (Next 16
upgrade + CI e2e/rls lane); QA final report + evidence.

## 4. Findings registry — contract chung

**File per-SF** (chống merge conflict giữa worktree song song — spec-critic P0-2):
`docs/superpowers/evidence/qa-hardening/findings-sf{1..6}.md` (committed).
SF-6 gộp một lần về `findings.md` tổng; AC#2 kiểm trên file merged.

**Dải ID cấp trước** (chống trùng QA-ID): SF-1: QA-1–99 · SF-2: QA-100–199 ·
SF-3: QA-200–299 · SF-4: QA-300–399 · SF-5: QA-400–499 · SF-6: QA-500+.

Row format: `QA-<n> | severity P0/P1/P2 | surface | repro (steps + env) | root
cause | fix commit | regression test | status OPEN/FIXED/BY-DESIGN/DEFERRED |
evidence (RED→GREEN: dòng đầu test run + hash commit — convention ^tdd)`.

- **Severity**: P0 = mất chức năng/sâu bảo mật/data sai; P1 = tính năng sai
  hành vi trong flow chính; P2 = edge/cosmetic/UX papercut.
- **Triage pre-classified BY-DESIGN** (không fix, không tính OPEN): relaxed
  toggle giữa chừng đổi mode check; naive split-sentences viết tắt (Mr., e.g.);
  transcript/audio public theo thiết kế; guest commit chỉ sống 1 tab (sessionStorage).
- **"Fix tất cả" semantics + escape hatch DEFERRED** (spec-critic P0-3): mọi
  finding OPEN phải FIXED trước khi SF xong — TRỪ khi fix nằm ngoài scope đã
  chốt (dep upgrade Next 16/drizzle-kit, hoặc schema migration chủ đích chưa
  được phê duyệt). Trường hợp đó → status **DEFERRED**: bắt buộc rationale +
  hiện trong Recommendations cuối story + **sign-off user/PM** (comment epic).
  DEFERRED không tính OPEN nhưng không bị xoá. Ví dụ sống: khóa user cần cột
  `profiles.banned` (schema change) → DEFERRED candidate. Consensus với impact:
  schema migration CHỦ ĐÍCH out-of-scope; migration do bug bắt buộc → flag +
  phê duyệt PM/user trước khi làm (không tự ý).
- **Chống misclassify** (spec-critic P1-7): mọi row BY-DESIGN / DEFERRED /
  enhancement bắt buộc rationale; PM re-review các nhóm này tại mỗi phase
  checkpoint; enhancement liệt kê section riêng trong report cuối.
- **Bug chéo surface** → owner = SF có touch map chính (dictation lib → SF-2;
  gamification/actions → SF-3; admin/storage → SF-4; seo/i18n → SF-5); tranh
  chấp → PM phân.
- **Mỗi fix**: TDD RED→GREEN, đúng lane (vitest main / rls / audit / e2e đúng
  config), surgical (không redesign — direction B đang in-flight trên master).

## 5. Prod QA safety rules (SF-6)

1. Data test_CHỈ qua account email `@test.ilec`; content test admin ghi kèm
   prefix `[QA]` trong tên để nhận diện.
2. Cleanup script chạy CUỐI SF-6 — **2 pha** (spec-critic P1-5): (a) DB theo
   đúng thứ tự FK (`attempts` → `progress` → `parts` → `lessons`/`units` →
   `users @test.ilec` + daily_activity + xp rollback), (b) Vercel Blob list/
   delete theo path prefix `[QA]` (audio publish lúc QA sẽ tồn dư orphan nếu
   chỉ xoá DB). Cả 2 pha dry-run trước khi chạy thật; script committed.
3. Prod target là REQUIREMENT-GAP #3 (spec-critic P1-4): user phải xác nhận
   (a) URL prod production hay preview, (b) Vercel đang watch branch nào, (c)
   admin creds prod. Chưa có → REQUIREMENT-GAP comment lên epic, làm phần
   không-blocked trước (regression sweep local), block chỉ phần prod.
4. Lighthouse prod (spec-critic P0-4): **a11y ≥ 0.95 hard gate cả local lẫn
   prod** (bundle như nhau); **perf trên prod = REPORT-ONLY** — thêm flag
   report-only vào `scripts/lighthouse.mjs` (hiện hardcode `THRESHOLDS` dòng
   30, exit non-0 — không được để prod perf 0.83 tự động FAIL story không đụng
   perf). PASS = đo được + mọi mức sụt so local được root-cause trong report.
   Protocol giữ median/3, mobile throttled; ghi cả 2 số local/prod.
5. Deploy + PR (directive user 2026-09-29): KHÔNG merge story branch vào
   master (quyền người); CLOSE tạo PR `--base master`. Prod deploy theo nhánh
   đích story (xác nhận lúc SF-6 theo GAP #3).
6. **Convergence protocol** (spec-critic P1-3): story đóng trên HEAD của nhánh
   đích story — regression sweep final chạy trên HEAD đó; checklist re-run SAU
   khi người merge (PR vào master / merge primary) ghi vào Recommendations
   (không pre-authorize merge). AC#1 "HEAD cuối" = HEAD nhánh đích lúc CLOSE.

## 6. Acceptance criteria (story-level, binary)

1. Test matrix xanh trên **HEAD nhánh đích lúc CLOSE** (unit + rls + audit + 4
   e2e suite) — số test ≥ baseline 218/18/13/17 (chỉ tăng vì regression tests
   mới). Escape hatch baseline flaky (SF-1): lane tính là xanh nếu pass ≥2/3
   lần chạy liên tiếp; fail được triage vào registry kèm owner tier-1, không
   chặn SF-1 vĩnh viễn.
2. `findings.md` (merged) **0 OPEN**; mọi DEFERRED có rationale + sign-off
   user/PM + xuất hiện trong Recommendations; mọi FIXED có fix commit +
   regression test RED→GREEN; mọi BY-DESIGN có rationale (đã qua re-review PM
   tại checkpoint).
3. SessionProvider-stale: **VERIFY fix `695f0ef`** (session-sync.tsx) bằng e2e
   regression trên path register thật + bỏ workaround `page.reload()` trong
   `e2e/progress.spec.ts` (spec-critic P1-6 — papercut đã được fix trong lúc
   CREATE, còn lại verify + regression + dọn workaround).
4. Regression test `3617eed` tồn tại và bắt đúng bug (mutation RED khi revert fix).
5. Lighthouse: local final ≥ baseline SF-8 (7/7 PASS ngưỡng §9); prod — **a11y
   ≥ 0.95 hard gate**, **perf report-only** (đo được + mức sụt so local được
   root-cause trong report — §5.4).
6. Prod: smoke + 1 dictation flow thật + admin publish flow thật chạy được trên
   prod target (đã xác nhận theo GAP #3); test data dọn sạch DB + Blob (hoặc
   liệt kê rõ nếu còn).
7. Final QA report + evidence committed; recommendation (Next 16, CI lanes,
   checklist re-run sau merge) ghi.
8. Security: `security-scan.mjs` PASS + `test:rls` 18/18 + không P0/P1 audit mới.

## 7. Risks (đã phân tích chi tiết trong impact §5)

- Prod URL/creds pending → SF-6 REQUIREMENT-GAP protocol (không block tier 1).
- e2e flaky (`retries:0` + cold compile) → SF-1 audit định lượng trước khi SF-2..5
  dựa vào e2e; fix flaky là finding chính đáng (P1).
- Redesign direction B trên master → fix surgical; convergence merge strategy
  chốt với owner; conflict tiềm năng ghi vào final report.
- Story phình do "fix tất cả" → user chấp nhận; triage chặt by-design/enhancement;
  PM theo dõi registry mỗi phase checkpoint.

## 8. Team dispatch plan (9 agents đúng vai)

- PM = coordinator story này (không code).
- SF-1..6 = task-executor SF agents (worktree riêng).

**Isolation e2e — DB RIÊNG mỗi SF** (spec-critic P0-1, theo khuyến nghị impact
§4 — thiết kế chống trample, không phải claim):

| SF | DB local | Port | Config |
|---|---|---|---|
| SF-2 | `ilec_sf2` | 3210 | `playwright.sf2.config.ts` (MỚI) |
| SF-3 | `ilec_sf3` | 3211 | `playwright.sf3.config.ts` (MỚI) |
| SF-4 | `ilec_sf4` | 3010 | `playwright.sf4.config.ts` (MỚI) |
| SF-5 | `ilec_sf5` | 3212 | `playwright.sf5.config.ts` (MỚI) |

- DB tạo từ template: `createdb ilec_sfN -T ilec` (template đã migrated+seeded
  từ SF-1) + `.env.local` RIÊNG trong worktree SF (DATABASE_URL trỏ DB đó —
  `db/index.ts` + `e2e/db.ts` đọc env; file gitignored → task bootstrap trong
  context pack mỗi SF: copy từ main + sửa DATABASE_URL + `E2E_PORT`).
- **KHÔNG sửa 2 baseline config** (`playwright.config.ts` 3110,
  `playwright.admin.config.ts` 3000) — tránh conflict worktree; suite SF là
  file config MỚI đọc `E2E_PORT` env.
- Fixture bắt buộc prefix `sf{N}-…@test.ilec` (generalize `uniqueEmail()` sẵn
  có trong progress.spec); SF-4 CHỈ mutate content tự tạo prefix `[QA-SF4]`.
- Read-model dùng chung (leaderboard, dashboard) test trên DB SF mình.
- `workers: 1` + `retries: 0` giữ nguyên trong config mới.
- Terminology: phần FIX là task động sinh **sau triage trong vòng đời SF**
  (không gọi "Phase 3 của SF" — tránh nhầm Phase 3 story).

- Tester: code-reviewer per-task (Phase 4) + verifier tại gate; security-audit 1
  vòng mỗi phase checkpoint (3 vòng tổng).
- Designer: KHÔNG cần (Design: none mọi SF — QA story không visual direction mới;
  redesign direction B là story khác).
- Medic: theo watchdog thường quy.
- Context packs: `docs/superpowers/contexts/qa-hardening/sf-{1..6}.md` (subdir
  mới — KHÔNG đè sf-{1..8}.md của VU-15), viết lúc CREATE theo format 4 sections.
