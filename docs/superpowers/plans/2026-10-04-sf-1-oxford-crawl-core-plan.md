# Plan: SF-1 Crawl-core — enumerate + fetch + parse + store + runner
Date: 2026-10-04 | Linear: VU-33 (epic VU-32) | Worktree: sf-1-oxford-crawl-core (base story-vu32-oxford-vocab-crawl)

> Nguồn: context pack `docs/superpowers/contexts/oxford-crawl/sf-1.md` + spec v4
> `docs/superpowers/specs/2026-10-04-oxford-vocab-crawl-design.md` (đã qua
> spec-critic + plan-critic ở epic level). SF slice KHÔNG đổi contract — plan
> này decompose 13 mục spec slice thành tasks có exit criteria.

## 0. Root cause analysis (WHY)

### Root cause
Content từ vựng hiện có chỉ từ import CSV/JSON của teacher — hẹp, thủ công.
Oxford Learner's Dictionaries công khai sitemap (~63.949 slugs) + entry HTML
đầy đủ IPA/audio/POS/CEFR — nguồn chuẩn, robots.txt cho phép crawl
`/definition/english/` với UA thường (probe 2026-10-04). Chưa có pipeline
đưa nguồn này về hệ thống.

### Current state (before feature)
`words` là bảng duy nhất (curated, teacher-owned); không có data lake; enrich
= gõ tay. Audio lesson hiện tải về Blob qua `putAudio` (có fallback `public/`
local dev — KHÔNG được dùng cho audio Oxford).

### Expected outcome
Data lake `crawl_entries` đầy ~63.949 entries (status machine
pending→parsed|failed), resumable CLI runner 3 phases, audio Oxford trên Blob
`audio/oxford/` qua helper blob-only — nền cho SF-2 enrich/API, SF-3 UI,
SF-4 convergence.

### Constraints & hardships
- robots runtime-guard bắt buộc trước mỗi run; UA `ILEC-VocabBot/1.0
  (educational; +site)` — KHÔNG UA thương hiệu AI (bị Disallow toàn site).
- Rate 2 r/s mặc định; retry backoff 429/5xx; host allowlist 2 host.
- Migration additive; số 0004 (verified trống — VU-24 không active).
- DB dev chung (Neon) — demo chỉ `--limit` nhỏ; unit test KHÔNG gọi mạng/DB
  trừ store-integration (skipIf không DATABASE_URL — CI không có env ở step Test).
- node24 type-strip: script import relative CÓ extension `.ts`, DB import
  động sau dotenv (pattern `scripts/seed.ts`).

### High-level strategy
Pipeline thuần CLI script ngoài (KHÔNG crawl trong request), pure libs inject
fetch (test offline), DB là nguồn trạng thái (không file checkpoint — kill →
resume từ DB). Single-runner assumption, không lock.

## 1. Problem (intent, NOT solution)
Cần TOÀN BỘ kho từ điển Oxford về data lake nội bộ để mọi tier sau (enrich,
UI, public) có IPA/audio/example/CEFR mà không gõ tay — admin chạy runner nền
không cần dev trông.

## 2. Scope
- **In scope:** migration 0004 (crawl_entries + words.cefr/source); blob-only
  write helper; 5 lib `src/lib/oxford/` (fetch/parse/sitemap/rate-limit/robots)
  + store + audio leg; fixtures HTML 5 loại; CLI runner 3 phases; unit tests;
  audio-sync exclusion `audio/oxford/` + test; README runbook section.
- **Out of scope (boundary context pack):** enrich/API (SF-2), UI (SF-3),
  public attribution + rehearsal (SF-4); KHÔNG sửa `putAudio` hiện có; KHÔNG
  bảng phụ (crawl_runs...); KHÔNG fill words (SF-2); KHÔNG gọi Oxford trong
  unit test (inject fetch); KHÔNG UA thương hiệu AI; KHÔNG path robots Disallow.
- **Success criteria (ACCEPTANCE SF-1 — user-visible):**
  1. `enumerate --apply` → đúng số slugs sitemap (≈63.949 @2026-10-04) pending;
     chạy lại không dup.
  2. `fetch --limit 50 --apply` → 50 entries parsed|failed; parsed có headword
     + raw; field theo entry (US-only → không UK audio; không level → cefr
     null); lỗi → failed + attempts tăng.
  3. `audio --limit 20 --apply` → đúng số mp3 các entry có (≤40) trên Blob
     `audio/oxford/`; thiếu token → THROW rõ.
  4. `audio-sync` KHÔNG kéo `audio/oxford/` vào git.
  5. Kill runner giữa chừng → chạy lại tiếp đúng chỗ, không dup, không mất state.

## 3. Touch map
- **Modify:** `src/db/schema.ts` (+crawl_entries, words +2 cột);
  `src/lib/admin/audio-sync.ts` (planSync exclusion — SCRIPT
  `scripts/audio-sync.ts` không đổi, logic nằm ở lib); `package.json` (script
  entry `crawl:oxford` + `test:store`); `README.md` (section crawl).
  `src/lib/storage-server.ts` KHÔNG đổi (putAudio nguyên vẹn — helper blob-only
  KHÔNG nằm đây: file có `import "server-only"` không resolve được ngoài Next →
  chết vitest test + node24 CLI — plan-critic P0, dùng file kế bên).
- **Create:** `drizzle/0004_*.sql` + `drizzle/meta/*` (drizzle-kit generate —
  KHÔNG sửa snapshot tay); `src/lib/storage-blob.ts` (helper blob-only — file
  kế bên storage-server, KHÔNG import "server-only", guard throw-token tự thân
  là P0); `src/lib/oxford/{fetch,parse,sitemap,rate-limit,
  robots,store,audio}.ts` (audio.ts nhận `put` INJECT — không default-import
  storage-blob; CLI inject `putBlobAudio` lúc runtime); `src/lib/oxford/fixtures/*.html`;
  `scripts/oxford-crawl.ts`.
- **Modify (tests):** `src/lib/admin/audio-sync.test.ts` (+exclusion case);
  `src/lib/storage-blob.test.ts` FILE MỚI cạnh helper (mock @vercel/blob —
  không lẫn vào storage.test.ts client-safe).
- **Consumers/regression:** import CSV/JSON vocabulary (không đụng — words chỉ
  thêm 2 cột nullable); `npm test` suite (mới thêm tests phải xanh offline);
  `src/lib/storage.import-graph.test.ts` (import graph — helper blob-only ở
  `storage-blob.ts`, client-safe lib (storage.ts) KHÔNG được import nó;
  storage-server.ts giữ nguyên `import "server-only"`).

## 4. Design

### Approach chosen
- **Pure libs inject fetch** — mọi lib nhận deps `{fetchImpl, put, save, ...}`;
  test offline; chỉ CLI + demo chạy mạng thật.
- **DB là state machine** — crawl_entries.status (pending|parsed|failed) +
  attempts + last_error; resume = claim pending / skip có blob; KHÔNG file
  checkpoint, KHÔNG bảng crawl_runs (stats derived).
- **Redirect lưu slug cuối** — fetchEntry trả `{html, finalSlug}`; runner
  upsert row DƯỚI finalSlug (tree_1→tree = 1 row 'tree', status parsed,
  last_error='redirect:<final>' khi finalSlug ≠ slug sitemap).
- **Parser:** `node-html-parser` (dep mới duy nhất — pure JS, không native).
  Lý do: senses nesting + selectors theo class quá brittle với regex; dep
  không đụng bundle client (chỉ lib server-side). Contract output KHÔNG đổi.
  Selectors chốt từ HTML thật lúc authoring fixtures (spec probe: `span.phon`,
  `span.pos`, `span.def`, `span.x`, `data-src-mp3`, `ox3000="y"`).
- **raw jsonb = object có cấu trúc** (scalar fields + idioms[] +
  phrasalVerbs[] senses) — KHÔNG nhét HTML 98KB vào DB (ước lượng ~4-5KB/row
  → ~300MB/64k rows đúng budget spec).
- **`--skip-audio` semantics (documented trong README):** phase `audio` với
  `--skip-audio` = scan-only (log cái sẽ tải, không tải — audit chi phí
  trước --apply); phase `fetch` luôn text-only, flag accepted no-op. Phase
  `audio` là phase riêng, fetch KHÔNG bao giờ kéo audio.

### Alternatives considered
- Regex parser thay DOM lib — bỏ: senses/examples grouping regex phức tạp,
  brittle hơn DOM; fixtures đã là contract nhưng DOM parser giảm chi phí bảo trì.
- File checkpoint thay DB state — bỏ: 2 nguồn sự thật, resume fragility.
- claim với FOR UPDATE SKIP LOCKED — không cần (single-runner assumption,
  documented); SELECT đơn giản.
- Fallback `public/` cho audio (như putAudio cũ) — CẤM cho Oxford (P0):
  silent local path leak vào prod; helper mới THROW khi thiếu token.

### Edge cases / second-order effects
- US-only entry: không UK audio/ipa_uk → null, KHÔNG fail.
- Sitemap slug lệch đích (redirect): 1 row duy nhất dưới slug cuối.
- retry-failed: attempts < 5 mới reset; giữ last_error để debug.
- audio-sync: file local thừa vẫn giữ nguyên (fixtures repo) — exclusion chỉ
  ảnh hưởng store list, KHÔNG xoá local.
- Kill giữa upsertSlugs batch: ON CONFLICT DO NOTHING → chạy lại idempotent.
- 404: fetchEntry → null → markFailed last_error='http:404' (attempts tăng).
- Size > 2MB / timeout 15s / host ngoài allowlist (kể cả redirect ra ngoài) →
  failed, KHÔNG retry không-password (timeout + 429 + 5xx mới retry).

### Non-functional
- Perf: token-bucket 2 r/s (≈9h cho 64k); batch upsert 100; index status+word.
- Security: SSRF bằng allowlist cứng 2 host suffix; KHÔNG LLM/API key;
  robots guard mỗi run; blob-only throw.
- a11y/i18n: N/A (CLI-only — chính đáng, skip).

## 5. Implementation outline

### Tasks (ordered — tick khi xong, commit mỗi task)

- [x] **T1. Migration 0004 — crawl_entries + words.cefr/source.** schema.ts:
      bảng theo spec Data model (identity, slug UNIQUE, word nullable, raw
      jsonb, ipa/audio×2 cột, pos/cefr/ox3000, status default pending,
      attempts, last_error, fetched_at, created_at; index status + word);
      words thêm `cefr text`, `source text` (nullable). `drizzle-kit generate`
      → 0004 + snapshot; `drizzle-kit migrate` DB dev; verify bảng + index
      tồn tại. Exit: migrate OK trên DB dev, `\d crawl_entries` đúng shape,
      generate không diff sau re-run.
- [x] **T2. Blob-only write helper (P0).** FILE MỚI `src/lib/storage-blob.ts`
      (kế bên storage-server — plan-critic P0: storage-server.ts có `import
      "server-only"` không resolve được ngoài Next → vitest test + node24 CLI
      chết lúc load; file mới KHÔNG import "server-only", guard throw-token
      tự thân là P0): `putBlobAudio(path, data, contentType?) → url` — THROW
      khi thiếu BLOB_READ_WRITE_TOKEN (không fallback fs — message hướng dẫn
      `vercel env pull`); `addRandomSuffix:false`. putAudio/deleteAudio KHÔNG
      đổi. KHÔNG copy pattern `scripts/seed.ts:245` (dynamic import
      storage-server trong node — latent bug). Test: mock @vercel/blob —
      throw khi thiếu token + KHÔNG ghi fs; put đúng params khi có token.
      Exit: test đỏ-trước/xanh-sau, npm test xanh.
- [x] **T3. audio-sync exclusion `audio/oxford/`.** `src/lib/admin/audio-sync.ts`:
      `export const AUDIO_SYNC_EXCLUDED_PREFIXES = ["audio/oxford/"]`; planSync
      bỏ qua entry có prefix excluded (không toDownload, không unchanged).
      KHÔNG đụng script wrapper. Test thêm vào audio-sync.test.ts: entry
      `audio/oxford/tree.uk.mp3` bị loại, entry thường vẫn sync. Exit: test
      xanh — audio-sync không bao giờ mirror prefix đó (acceptance 4).
- [x] **T4. Fixtures HTML (contract cho parse + tái dùng e2e SF-3).**
      `src/lib/oxford/fixtures/`: multi-pos.html, idiom.html, homonym-2.html
      (`_2`), us-only.html (không UK audio), + 1 file fetch thật TRIM (authoring
      fetch 1-2 entry thật để chốt selectors — spec probe `span.phon`,
      `span.pos`, `span.def`, `span.x`, `data-src-mp3`, `ox3000="y"`, `h1.
      headword`); file phải TRIM (chỉ entry container, không chrome site).
      **404/redirect (context pack liệt kê) là HTTP-level — KHÔNG có file
      fixture:** 404 không có HTML entry (fetchEntry → null, T6 test inject
      fetch); redirect đích là 1 entry HTML thường (fixture entry thường dùng
      chung làm đích redirect — T6 test assert finalSlug). KHÔNG author file
      trùng cho e2e SF-3 (đặt chỗ dùng chung). Exit: 5 files, mỗi file có
      selector markers đúng probe facts.
- [x] **T5. parse lib pure + test.** `src/lib/oxford/parse.ts`:
      `parseEntry(html) → OxfordEntry | null`; OxfordEntry = {headword BẮT
      BUỘC (null khi thiếu = parse fail), ipa{uk,us}, audio{uk,us} (mp3 URL),
      pos, senses[] {def, examples[]}, cefr (A1–C2 thô), ox3000, idioms[],
      phrasalVerbs[]}; field entry không có → null (US-only bình thường);
      raw = object này (idioms/phrasals sống ở đây). Test trên fixtures T4 +
      case rác → null. Exit: test xanh, mọi fixture parse đúng kỳ vọng.
- [x] **T6. fetch lib pure + test.** `src/lib/oxford/fetch.ts`:
      `fetchEntry(slug, deps?) → {html, finalSlug} | null`; UA
      `ILEC-VocabBot/1.0 (educational; +NEXT_PUBLIC_SITE_URL)`, redirect
      follow → finalSlug từ res.url (decode), 404→null, timeout 15s
      (AbortSignal.timeout), size cap 2MB (đọc stream, vượt → throw), host
      allowlist suffix `.oxfordlearnersdictionaries.com` kiểm trên URL CUỐI
      (redirect ra ngoài → throw). Export `HttpError{status, retryable}`
      (429/5xx/network/timeout retryable; 4xx khác không). Test inject
      fetchImpl: redirect, 404, timeout, oversize, host sai, UA header. Exit:
      test xanh offline.
- [x] **T7. rate limiter + retry + test.** `src/lib/oxford/rate-limit.ts`:
      `createTokenBucket({rate}) → acquire()`; `withRetry(fn, {retries=3,
      baseMs})` — retry khi err.retryable (HttpError + network/Abort),
      backoff exponential + jitter, KHÔNG retry 4xx khác. Test fake timers:
      pacing 2 r/s, retry đếm đúng, non-retryable 1 call. Exit: test xanh.
- [x] **T8. robots lib + test.** `src/lib/oxford/robots.ts`:
      `parseRobots(text, ua="*")` → {disallowed[]}; `isAllowed(policy, path)`
      prefix-match; `assertCrawlAllowed(deps)` — fetch `/robots.txt`, nhóm
      `User-agent: *`, path `/definition/english/` bị Disallow → throw
      `RobotsDeniedError` (message rõ để runner exit). Test: text robots mẫu
      (giống thật: disallow academic/collocations/info/...), cho phép
      /definition/english/, chặn khi có Disallow. Exit: test xanh.
- [x] **T9. sitemap lib + test.** `src/lib/oxford/sitemap.ts`:
      `fetchSlugs(deps?) → string[]` — fetch `/sitemap.xml` index → <loc>
      chứa `english/sitemap` → fetch từng sub → <loc>
      `/definition/english/<slug>` → decode slug; LỌC: chỉ
      `/definition/english/*` + lọc theo robots parseRobots (academic/
      collocations...). Test inject fetch: index + 2 sub xml → slugs đúng,
      lọc đúng. Exit: test xanh.
- [x] **T10. store + test (DB-integration, skipIf không DATABASE_URL).**
      `src/lib/oxford/store.ts` injectable `sql` client: `upsertSlugs` (batch
      100, ON CONFLICT DO NOTHING → inserted count), `claimPending(limit)` →
      [{id,slug,attempts}] ORDER BY id, `markParsed(id, fields, raw)`,
      `markFailed(id, error)` (cả hai attempts+1, fetched_at), `stats()` →
      counts theo status, `retryFailed()` → reset failed→pending attempts<5
      (giữ last_error) → count, `findBySlug`, `saveAudioBlob(id, variant,
      url)`. Test trên DB dev thật (cleanup rows test cuối — prefix slug
      `zz-test-`), afterEach dọn. Exit: test xanh local; npm test xanh trên
      CI-shape (skip khi không env).
- [x] **T11. audio leg + test.** `src/lib/oxford/audio.ts`:
      `oxfordAudioPath(slug, variant)` → `audio/oxford/{slug}.{uk|us}.mp3`;
      `downloadMp3(url, deps?)` — host allowlist (media host), cap 2MB →
      Buffer; `syncEntryAudio(entry, deps)` — variant đã có blob → skip
      (resumable/idempotent), URL null → skip, tải → put QUA `deps.put`
      (BẮT BUỘC inject — KHÔNG default-import storage-blob/module nào có
      side-effect; CLI inject `putBlobAudio` lúc runtime → throw propagation
      tự nhiên) → save URL. Test inject fetch/put/save: skip có blob, tải
      đúng path, throw khi put throw (thiếu token KHÔNG silent). Exit: test
      xanh.
- [ ] **T12. CLI runner `scripts/oxford-crawl.ts` — implementation (plan-critic
      P1: tách impl khỏi demo — Oxford outage không kẹt cả task).**
      node24 native TS (import .ts có extension, DB động sau dotenv — pattern
      seed.ts NHƯNG KHÔNG dynamic-import storage-server — import
      `src/lib/storage-blob.ts`); argv: phase ∈ enumerate|fetch|audio; flags
      `--rate N --limit N --slug x --skip-audio --apply`; robots guard trước
      mọi run; 1 token bucket chung mọi outbound; fetch phase: claim pending →
      fetchEntry → parseEntry → markParsed/markFailed, log mỗi 50 (`checkpoint
      50`); redirect → row dưới finalSlug (upsert nếu chưa có + mark parsed +
      last_error='redirect:<final>'); audio phase: entries parsed có URL →
      syncEntryAudio (put = putBlobAudio inject); enumerate: fetchSlugs →
      dry-run log count/sample, --apply upsert; dry-run MẶC ĐỊNH; exit 0 OK /
      1 runtime (robots denied rõ ràng) / 2 usage. Exit: `node
      scripts/oxford-crawl.ts` (không args) → usage + exit 2; typecheck xanh;
      dry-run smoke `enumerate` không ghi DB.
- [ ] **T12b. Demo thật + evidence (Gate 3 FI-460 proxy — CLI-equivalent).**
      Chạy LỆNH THẬT, lưu logs `docs/superpowers/evidence/sf-1-oxford-crawl-core/`:
      `enumerate` dry-run (đếm ≈63.949) → `enumerate --apply` (đếm DB = số
      slugs) → enumerate lại không dup → `fetch --limit 50 --apply` → query
      DB: parsed có headword + raw → kill-run: hủy giữa chừng (timeout
      wrapper) → chạy lại → tổng đúng, không dup → `audio --limit 20 --apply`
      (ĐÚNG ACCEPTANCE #3 — ≤40 mp3; token có sẵn → blob thật) → verify Blob
      list prefix `audio/oxford/` + `audio:sync` dry-run KHÔNG liệt kê
      audio/oxford/. Evidence file: hash HEAD + marker "CLI-equivalent proxy
      per FI-460 — SF CLI-only, không browser walkthrough" + exit codes từng
      lệnh. Exit: toàn bộ log evidence thật, không suy diễn.
- [ ] **T13. docs README + package.json script.** README section "Oxford
      crawl": 3 phases + ví dụ lệnh, flags (gồm --skip-audio semantics),
      token setup (`vercel env pull`), politeness note (rate 2 r/s, robots,
      attribution, OUP takedown runbook 1 dòng), single-runner note, note
      `npm run test:store` (store test cần DATABASE_URL — CI npm test skip).
      package.json: `"crawl:oxford": "node scripts/oxford-crawl.ts"` +
      `"test:store": "vitest run src/lib/oxford/store.test.ts"` (plan-critic
      P1 — giảm false-green SQL trên CI). Exit: README chạy lệnh theo được,
      package.json script chạy OK.

### File structure (theo codebase conventions)
- Libs: `src/lib/oxford/` (client-safe? KHÔNG — server-side only nhưng không
  next-specific; KHÔNG import vào client bundle — storage.import-graph test
  pattern giữ nguyên).
- Tests: cạnh lib `*.test.ts` (vitest include `src/**/*.test.ts`).
- Fixtures: `src/lib/oxford/fixtures/*.html` (đặt chỗ dùng chung e2e SF-3).
- CLI: `scripts/oxford-crawl.ts` (pattern seed.ts: dotenv → import động).

### Testing strategy
- Unit (offline, inject deps): parse (fixtures), fetch, rate-limit, robots,
  sitemap, audio, blob-helper, planSync-exclusion — npm test xanh, CI-safe.
- Integration (DB dev thật, skipIf không DATABASE_URL): store.
- Manual/demo CLI thật (FI-460 proxy — Gate 3): task **T12b** evidence — exit 0 +
  logs lệnh thật (enumerate/fetch/audio --apply + kill/resume) + marker
  CLI-equivalent trong evidence file; KHÔNG browser walkthrough (SF CLI-only).
- E2E: KHÔNG (SF-3/SF-4 sở hữu; fixtures tái dùng).

## 6. Risks & unknowns
- **Must verify (probes):** selectors thật từ HTML thật lúc authoring T4
  (spec probe 2026-10-04 đã grep thấy — xác nhận lại trên 1-2 entry khi trim
  fixtures); media host chính xác từ `data-src-mp3` URL thật.
- **Unverified assumptions:** `data-src-mp3` URL tuyệt đối (nếu relative →
  resolve trước allowlist check); sitemap index <loc> path
  `/sitemap/english/` ổn định; Neon pooler chịu batch upsert 100 (prepare:false).
- **Rollback unit:** mỗi task 1 commit — revert từng task độc lập.
- **Collision VU-24:** verified KHÔNG active (0004 trống, không worktree);
  nếu VU-24 lấy 0004 giữa chừng → thủ tục renumber context pack (git mv +
  _journal + REGENERATE).
