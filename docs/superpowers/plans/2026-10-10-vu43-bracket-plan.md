# Bracket plan v2 — VU-43 Vocabulary CMS

Story: VU-43 · dest `story-vu43-vocab-cms` · Spec: `docs/superpowers/specs/2026-10-10-vocab-cms-design.md` (v2) · Ngày: 2026-10-10
v2: áp plan-critic 2026-10-10 — image-route task thiếu (P0), sub-nav về tier-0 (P0), cross-SF assertions reassign (P0), i18n per-SF namespace files (P1), cleanup helper về SF-1 (P1), migration-slot note (P1), revalidate pins (P1), phase-1 dead-link pin (P1).

Tier DAG: sf-1 (t0) → sf-2 (t1) + sf-3 (t1) → sf-2, sf-3 → sf-4 (t2). Max 2 concurrent.
Phased release: **Phase 1** = SF-1+SF-2+SF-3 (CMS catalog + curation + backfill dùng được thật — checkpoint + security-audit) → **Phase 2** = SF-4 (stats + convergence — checkpoint cuối). **Phase 1 dead-link pin:** sub-nav hiện link `/admin/vocabulary/stats` chưa tồn tại tới SF-4 — CHẤP NHẬN và ghi rõ ở checkpoint Phase 1 (admin-internal, error.tsx có sẵn).

Anti-duplicate audit (tasks mọi SF): shared tier-0 = `bulk-selection.tsx` + `vocabulary-sub-nav.tsx` + i18n skeleton + e2e cleanup helper (SF-1 duy nhất); export lib(SF-1)/button(SF-2); backfill store(SF-1)/UI(SF-3); stats store(SF-1)/UI(SF-4); image route(SF-1)/uploader UI(SF-2). Parallel hazard sf-2 ∥ sf-3: **KHÔNG file chung** — i18n tách file riêng mỗi SF (`vocab-catalog.json` vs `vocab-curation.json`), cleanup helper có sẵn từ SF-1, sub-nav có sẵn từ SF-1.

**Cross-SF assertions (test-ownership):** mỗi SF e2e CHỈ test surface có trong worktree mình (fork từ dest@sf-1); assertion chéo SF (§6.3 "từ promoted hiện trong catalog UI", §6.7 "Từ vựng active trên /curation") dồn cho **SF-4 task 8** chạy FULL admin config trên merged base.

**Merge-order Phase 1:** sf-2 ∥ sf-3 chạy song song, merge TUẦN TỰ sf-2 → sf-3 (không còn file chung sau khi tách i18n — mergeformanual chỉ khi e2e helpers đụng trùng).

## SF-1 — Nền tảng CMS: schema + stores + REST + shared infra (tier 0)

Linear: _(điền lúc approve)_ · Priority: high · Estimate: 5
Depends on: —
Design: none

Tasks:
1. Probe dữ liệu thật trên template Neon: count `words`/`crawl_entries`/`book_words`/`user_word_progress` + EXPLAIN 3 query filter dự kiến (cefr/pos/ox3000) → evidence số liệu — exit: evidence ghi comment SF.
2. Migration slot-trống-kế-tiếp: `ALTER TABLE words ADD COLUMN pos/image_url/synonyms` + `CREATE INDEX` ×3 `crawl_entries` (dry-run template → apply Neon) + `schema.ts` exports. **Note VU-37 song song:** trước khi tạo, đọc `drizzle/` — nếu VU-37 đã merge master và chiếm 0005/0006 → lấy slot kế tiếp + sửa `_journal.json`; coordinator kiểm VU-37 merge status trước story PR — exit: migrate sạch trên template, typecheck xanh.
3. `vocabulary.ts` validators mới (cefr normalize+allowlist `invalidCefr`, pos ≤32 lowercase, synonyms chuẩn hoá comma ≤500, imageUrl shape) + tests pin boundary (`'b1 '`→`B1`...) — exit: vitest xanh.
4. `WordInput`/`WordPatch` mở rộng + POST/PATCH route nhận fields mới + map error codes spec §4 — exit: route contract tests.
5. `listVocabulary` v2: filter `q` (word OR meaning_vi, escape `% _ \`), `cefr` csv, `source` teacher=IS NULL, `audio` has/missing, `orphan` (WIN over bookId), `sort` (created|word|cefr null-last) — additive back-compat — exit: tests cũ + mới pin từng filter.
6. `cms-bulk-store` + route `/api/admin/vocabulary/bulk`: assign-books (`pg_advisory_xact_lock(bookId)`, order max+1, onConflictDoNothing), tag-cefr OVERWRITE, delete dry-run (`willDelete, progressAffected, missing`)/apply; cap 500 `tooMany`; **1 revalidate cuối batch + contract test pin** — exit: tests §5.2–5.5.
7. Export lib (CSV thuần RFC+BOM golden test) + route `/export` (filters list, >10k → `tooMany`, 0 rows header-only, filename `vocabulary-YYYY-MM-DD.csv`) — exit: unit + contract test.
8. `cms-stats-store` + route `/stats`: totals/coverage/`cefrHistogram` buckets §5.8 (tổng = tổng words kể cả 'b2 ' bẩn)/perSource/perBook + reuse `crawlStatsDb` — exit: tests + contract test shape §4.
9. `audio-backfill` store + route `/audio-backfill`: scope bắt buộc (bookId|wordIds → `scopeRequired`), plan matched/pending/missing, apply copy blob URL cap 200, `allowDownload` cap 100, marker `audio_url IS NULL`, deps injectable; **1 revalidate cuối apply + pin** — exit: tests (mock deps).
10. `crawl-entries-store` + route `/crawl/entries`: filters status/cefr/pos/ox3000/q (word COALESCE pretty slug), pagination, `hasWord` duplicate predicate (lower+trim, 1 query/page) — exit: tests predicate.
11. `promote-store` + route `/crawl/promote`: meanings validate TRƯỚC mutation (`meaningRequired`), advisory lock book, duplicate → skip đếm, report created/duplicates/failed, FK 23503 → `bookNotFound`; **1 revalidate cuối batch + pin** — exit: tests.
12. Route `POST /api/admin/vocabulary/image`: assertAdmin, max 2MB → `imageTooLarge`, mime allowlist png/jpeg/webp → `imageMime`, put qua `storage-server` path `images/words/...` (dual-driver như audio), response `{ok, url}` — exit: contract tests.
13. Shared tier-0 client primitives: `bulk-selection.tsx` (contract spec §2.5: `useBulkSelection` + `BulkActionBar` + `ConfirmDialog`) + `vocabulary-sub-nav.tsx` (3 links, active theo pathname, SF-2/3/4 chỉ render) + tests logic — exit: vitest.
14. i18n skeleton + e2e infra: tạo 4 namespace files `messages/{vi,en}/`{`vocab-cms-common`, `vocab-catalog`, `vocab-curation`, `vocab-stats`}.json (skeleton keys: nav.vocabulary, tabs, error codes) + `admin/layout.tsx` import 4 files 1 LẦN (provider `{admin, vocabCmsCommon, vocabCatalog, vocabCuration, vocabStats}` — KHÔNG sửa `admin.json`) + helper `e2e/helpers/cleanup-vocab-cms.ts` (xoá words `qa-cms-` + entries `qa-cms-*`, dry-run mặc định) — exit: parity test xanh, helper chạy được.
15. story-verify (kèm chạy lại `scripts/test-rls.test.ts` — owner RLS rerun) + merge về đích + audit comment — exit: sạch.

## SF-2 — Catalog UI toàn cục `/admin/vocabulary` (tier 1)

Linear: _(điền lúc approve)_ · Priority: high · Estimate: 4
Depends on: SF-1
Design: none

Tasks:
1. Page shell `/admin/vocabulary` + nav item "Từ vựng" trong `admin-nav.tsx` (active rule prefix TRỪ `/crawl`, key từ `vocab-cms-common.json`) + render `vocabulary-sub-nav` (SF-1) Catalog active — exit: chạy `admin-vocabulary-nav.spec.ts` phần catalog + crawl xanh (spec t12 viết trước trong task này).
2. `VocabularyCatalog` client: REST list + pagination 50/page + state fetch/refetch + empty state (0 kết quả) — exit: component test **vitest fetch mock** (KHÔNG msw — không có trong repo).
3. Filter bar: search (word+meaning), chips CEFR multi, select nguồn (tất cả/oxford-ld/teacher), select audio, select book, toggle orphan, select sort — exit: test mỗi filter đổi params gọi đúng GET.
4. Bảng rows: word/ipa/nghĩa/badge CEFR/badge nguồn/icon audio/thumb image/chips books/badge orphan — exit: render test + a11y label.
5. Bulk select UI dùng primitives SF-1 (select page + count + clear, giữ selection qua refetch) — exit: integration test; KHÔNG sửa file tier-0.
6. Bulk gán sách: dialog multi-book → POST bulk (chunk >500, aggregate) → toast report; **assert từ được gán xuất hiện ở public book page (surface có trong base)** — exit: e2e.
7. Bulk tag CEFR: dialog + cảnh báo OVERWRITE → POST → toast — exit: e2e.
8. Bulk xoá 2-phase: dry-run → confirm hiện `progressAffected` → apply → report; **assert từ biến mất khỏi public book page** — exit: e2e (fixture `qa-cms-` + cleanup helper SF-1).
9. Export button giữ filter → download CSV — exit: e2e assert filename + nội dung header.
10. Dialog thêm từ (global, fields mới) + dialog sửa (full + audio reuse `audio-uploader` + image upload qua route SF-1, preview thumb) — exit: e2e edit + image thumb.
11. i18n điền `messages/{vi,en}/vocab-catalog.json` (file SF-1 tạo sẵn) + parity — exit: parity test. KHÔNG đụng admin.json.
12. e2e `admin-vocabulary-catalog.spec.ts` (§6.1–6.2, chỉ surface trong worktree) + `admin-vocabulary-nav.spec.ts` (§6.7 phần: active trên /admin/vocabulary + KHÔNG double-active với Crawl trên /admin/vocabulary/crawl) + regression per-book manager cũ + story-verify + merge — exit: suites xanh.

## SF-3 — Curation queue Oxford + audio backfill UI (tier 1)

Linear: _(điền lúc approve)_ · Priority: medium · Estimate: 4
Depends on: SF-1
Design: none

Tasks:
1. Page shell `/admin/vocabulary/curation` + render `vocabulary-sub-nav` (SF-1) Curation active + i18n skeleton — exit: route render.
2. `CurationBrowser`: GET `/crawl/entries` + filters (status parsed mặc định, search, cefr, pos, ox3000) + pagination 50 + empty state — exit: test filters đổi params đúng.
3. Entry rows: headword COALESCE/ipa uk-us/cefr/pos/ox3000 badge/audio icon + badge "đã có từ" + link catalog (link chết được chấp nhận trong worktree — catalog là SF-2) — exit: render test predicate.
4. Multi-select (primitives SF-1) + panel grid soạn meaning VI (validate bắt buộc, đếm thiếu, disable promote khi thiếu) — exit: component test.
5. Promote dialog: chọn book → POST promote (chunk >200) → progress + report (created/duplicates/failed) → refetch; **assert kết quả qua `GET /api/admin/vocabulary` + DB row (KHÔNG assert catalog UI — sf-2 parallel)** — exit: e2e.
6. Duplicate skip UX trong report (đếm + link catalog merge) — exit: e2e duplicate case.
7. Audio backfill section: chọn scope (book) → dry-run bảng plan (matched/pending/missing) → apply (cap) → report — exit: e2e scoped fixture.
8. i18n điền `messages/{vi,en}/vocab-curation.json` (file SF-1 tạo sẵn) + parity — exit: parity test. KHÔNG đụng admin.json.
9. e2e `admin-vocabulary-curation.spec.ts` (§6.3–6.4 theo ownership cross-SF ở header; seed `qa-cms-*` entries + cleanup helper SF-1) — exit: suites xanh.
10. a11y pass: grid labels, focus trap dialog, contrast badge — exit: checklist evidence + screenshots.
11. story-verify + merge + audit comment — exit: sạch.

## SF-4 — Stats dashboard + convergence QA (tier 2) — Phase 2/2

Linear: _(điền lúc approve)_ · Priority: medium · Estimate: 4
Depends on: SF-2, SF-3
Design: none

Tasks:
1. Page shell `/admin/vocabulary/stats` + render `vocabulary-sub-nav` (SF-1) Stats active — exit: route render + link sub-nav hết 404.
2. StatsCards 5 thẻ (tổng/audio %/image %/orphan/enrich %) wire `/stats` — exit: render + format % đúng.
3. CEFR histogram CSS bars thuần (buckets A1..C2 + untagged + other, label + số) — exit: tổng bars = tổng words UI test.
4. Bảng per-book (book, words, audio coverage) — exit: render test.
5. Panel crawl/enrich reuse crawlStatsDb + link crawl dashboard VU-32 — exit: render + link đúng.
6. i18n điền `messages/{vi,en}/vocab-stats.json` (file SF-1 tạo sẵn) + parity — exit: parity test. KHÔNG đụng admin.json.
7. Route contract test stats khớp SQL trực tiếp trên template DB (§6.5) + histogram bucket test — exit: test xanh evidence.
8. **Convergence sweep trên merged base (FULL admin config):** admin e2e cũ + 3 spec `admin-vocabulary-*.spec.ts` mới + 9 vocab configs + hub/lookup/quiz + **assertions chéo SF deferred:** §6.3 từ promoted hiện trong catalog UI, §6.7 "Từ vựng" active trên `/admin/vocabulary/curation` — exit: tất cả suites xanh evidence.
9. Rehearsal dữ liệu thật template DB: bulk assign 500, export 5k, backfill scoped 200 (dry-run), promote 20 — đo thời gian + evidence; chạy cleanup helper sau rehearsal — exit: không timeout, evidence số liệu, template sạch.
10. a11y + mobile 375 screenshots + **security-audit checkpoint Phase 2** (OWASP surface + repo-hygiene: secrets/exec-bit/permissions/lockfile) + story-verify cuối + evidence pack — exit: audit sạch P0/P1, story-verify APPROVED.
