# Vocabulary CMS — epic spec v2 (VU-43)

Ngày: 2026-10-10 · Story: VU-43 · dest: `story-vu43-vocab-cms` · Base: master @ 5f2febd (đã gồm oxford-crawl PR#7; VU-37 vocab-memrise ĐANG CHẠY SONG SONG trên branch riêng, CHƯA merge)
v2: áp spec-critic 2026-10-10 (3 P0: advisory-lock race, backfill scope, delete dry-run; 13 P1: vocabularies/histogram/search/duplicate-predicate/report-shape/error-codes/export-overflow/enrich-additive/tier0-contract/test-ownership) + cross-story guard VU-37.

## 0. IDEA-BRIEF (8 chiều)

- **Task** — "làm cms cho vocabulary" = xây **lớp quản trị nội dung toàn cục** cho hệ sinh thái vocabulary trong `/admin`: hôm nay teacher chỉ quản được từ TRONG context 1 sách (VocabularyManager, VU-15 SF-1) và điều khiển crawler (VU-32) — không có catalog toàn bộ words, không filter/bulk/curation/stats. CMS = 4 khối: (1) catalog toàn cục + bulk ops, (2) curation queue từ 63.9k crawl_entries Oxford, (3) audio backfill hàng loạt, (4) stats dashboard.
- **Output** — 3 page admin mới (`/admin/vocabulary` catalog, `/admin/vocabulary/curation`, `/admin/vocabulary/stats`) + REST API mở rộng additive + migration additive; fields mới `pos`/`image_url`/`synonyms` trên `words`.
- **Users** — teacher/admin ILEC (desktop-first, đã đăng nhập admin); học viên KHÔNG bị đụng tới trong story này (§7).
- **Constraints** — MUST: mọi mutation revalidate `content` đúng 1 lần cuối batch; `listVocabulary`/GET/PATCH back-compat tuyệt đối (VocabularyManager 669 dòng + per-book page đang dùng); `assertAdmin()` per method; bulk-promote **teacher-in-loop** (meaning VI nhập tay — quy ước no-LLM `enrich.ts` + `meaningVi` NOT NULL giữ nguyên); `enrich.ts` chỉ thêm export MỚI, zero behavior-change trên export hiện có (10 importers); e2e mới dùng `playwright.admin.config.ts` (prefix `admin-`), KHÔNG sinh playwright config thứ 10; i18n vi+en parity (`src/messages.test.ts`). MUST-NOT: KHÔNG đụng crawl runner/status machine (VU-32); KHÔNG đụng components/flows đang được VU-37 rebuild (learn/review session UI, hub dashboard — xem §7); KHÔNG draft/published states (user chốt 2026-10-10); KHÔNG tự sinh nghĩa VI.
- **Input** — data thật: `words` curated + `crawl_entries` ~63.9k (blob audio Oxford đã tải sẵn, git-mirror ĐÃ loại trừ `audio/oxford/` từ VU-32 — `AUDIO_SYNC_EXCLUDED_PREFIXES`); pattern admin hiện có làm design language (user chốt: KHÔNG designer mock).
- **Context** — VU-32 + (VU-37 đang chạy); admin có nav Dashboard/Books/Crawl/Users; `/admin/vocabulary` hiện 404 (chỉ có con `crawl/`); PATCH chưa sửa được cefr/source; `crawl_entries` chỉ có index `status` + `word`; VU-37 có thể đã chiếm migration 0005/0006 trên branch riêng.
- **Success criteria** (binary, nghiệm thu theo SF acceptance): (1) admin mở `/vi/admin/vocabulary` thấy TOÀN BỘ words với filter (tìm cả nghĩa, CEFR, nguồn, audio, book, orphan), sort, phân trang server-side, sửa được cefr/source/pos/synonyms/image; (2) chọn nhiều từ → gán book / tag CEFR (overwrite) / xoá (dry-run đếm progress trước confirm) / export CSV giữ filter; (3) duyệt crawl_entries theo filter, chọn nhiều, soạn nghĩa VI trong grid, promote hàng loạt thành words gắn book (duplicate theo predicate §4 → skip + badge); (4) backfill audio CÓ SCOPE (book/wordIds): dry-run plan rồi gán `audio_url` từ blob Oxford có sẵn; (5) stats dashboard trả lời: tổng từ, coverage audio/image, phân bố CEFR (buckets §5.8 tổng = tổng), per-book, orphan, enrich coverage; (6) mọi suite hiện có của BASE xanh (admin + vocab + public).
- **Out-of-scope** — sửa crawl runner/dashboard VU-32; per-book VocabularyManager (giữ nguyên); draft/published; AI dịch nghĩa; image search/tự động; user/role CMS; lessons/books CMS (đã có); export format khác CSV; bulk qua queue/runner nền (Hướng C loại — P0); **hiển thị pos/image/synonyms ở public UI (learn/review/hub) — follow-up SAU khi VU-37 merge, vì các component đó đang được VU-37 rebuild song song (đụng = conflict chéo story)**.

## 1. P0 impact — tóm tắt (full: dispatch phase0-impact-analyst 2026-10-10)

**Touch map chính** — modify: `vocabulary-store.ts` (7 importers — additive-only), `vocabulary.ts` validators, `api/admin/vocabulary/route.ts` (GET params + PATCH fields + POST fields mới), `admin-nav.tsx`, `messages/{vi,en}/admin.json`, `schema.ts` (28 importers — additive-only), migration (số thứ tự kế tiếp trống tại thời điểm chạy — VU-37 có thể đã chiếm 0005/0006); new: 3 page admin, `vocabulary-catalog.tsx`, `curation-browser.tsx`, `bulk-selection.tsx` (shared tier-0), stores mới (`cms-bulk-store`, `cms-stats-store`, `audio-backfill`, `crawl-entries-store`, `promote-store`), routes (`bulk`, `export`, `stats`, `image`, `audio-backfill`, `crawl/entries`, `crawl/promote`), e2e `admin-vocabulary-*.spec.ts`.

**Quyết định kiến trúc (chốt từ P0 alternatives + user answers + spec-critic v2):**
| Chọn | Lý do |
|---|---|
| Hướng A — mở rộng REST + vocabulary-store additive (KHÔNG server actions, KHÔNG queue runner) | blast radius nhỏ nhất; 100% tái dùng authz/validate/i18n/test pattern; VocabularyManager không vỡ |
| Migration additive: `words.pos`/`image_url`/`synonyms` (nullable) + 3 index `crawl_entries(cefr,pos,ox3000)`; số migration = slot trống kế tiếp lúc chạy | user chọn mở rộng schema; zero ripple public (cột nullable); VU-37 chiếm slot riêng trên branch của nó |
| Backfill = copy `audio_uk/us_blob` CÓ SẰN (zero Blob-write); download-blob-thiếu = opt-in `allowDownload` cap 100/request; **scope bắt buộc: `bookId` HOẶC `wordIds`** | policy git-mirror đã loại `audio/oxford/` từ VU-32 → không bloat; scope = e2e chạy được trên shared-DB không đụng data thật |
| Bulk = 1 route `/bulk` `{action, wordIds[], payload, dryRun?}`, cap 500 ids/request, 1 revalidate cuối batch; delete có dry-run mode | N×revalidateTag vô nghĩa; cap chống weapon; delete cần preview `progressAffected` trước confirm |
| **Race `unique(book,order)`: `pg_advisory_xact_lock(bookId)` đầu transaction cho MỖI book** (bulk assign + promote) | READ COMMITTED KHÔNG serialize `max(order)` — 2 tx cùng đọc max=10 → 23505; advisory xact lock per book = deterministic, không cần đổi pattern import/cũ (những path cũ giữ semantics accept-race-retry như schema comment) |
| Catalog list = client REST pagination server-side (không URL-SSR) | nhất quán pattern admin hiện có (VocabularyManager/CrawlDashboard đều client REST); words chỉ vài nghìn rows |
| Shared `useBulkSelection` + `BulkActionBar` ở **tier 0** (SF-1) với contract pin §2.5 | policy chống-duplicate: pattern selection dùng bởi cả SF-2 (catalog) lẫn SF-3 (curation); contract pin = tier-1 không phải sửa tier-0 file |

**Second-order đáng nhớ:** bulk delete cascade `user_word_progress` (mất SRS state N×users — v1 chấp nhận cho delete-đơn, bulk phải dry-run + cảnh báo rõ); hub/review/quiz là live query INNER JOIN words → từ xoá biến mất khỏi due-list giữa phiên (chấp nhận, không crash); `revalidateContent` 1 lần cuối batch; promote KHÔNG đụng status machine crawl_entries (approve chỉ đọc lake); count trên 63.9k cần index-supported, tránh LIMIT lớn (Neon shared-DB flake); `CREATE INDEX` trên 63.9k block ngắn trong migration — chấp nhận (crawl runner single, chạy lúc không crawl).

## 2. UX flows (khung cứng — theo design language admin hiện có: bảng + filter bar + dialog + i18n `admin.json`, CREATIVITY BALANCED)

### 2.1 Catalog `/admin/vocabulary` (root — page MỚI, hiện 404)
- Server shell (role-gate ở admin layout có sẵn) + nav item **"Từ vựng"** giữa Books và Crawl (order: Dashboard, Books, **Từ vựng**, Crawl, Users). Active rule: item "Từ vựng" active khi pathname bắt đầu `/admin/vocabulary` và KHÔNG bắt đầu `/admin/vocabulary/crawl`; item Crawl giữ nguyên rule cũ (tranh prefix xử lý explicit, test e2e).
- **Sub-nav trong trang** (links row): **Catalog** (`/admin/vocabulary`) · **Curation** (`/admin/vocabulary/curation`) · **Stats** (`/admin/vocabulary/stats`) — trang nào active theo pathname chính xác. Component `vocabulary-sub-nav` là **shared tier-0 (SF-1)** — SF-2/SF-3/SF-4 chỉ render, KHÔNG sửa.
- Bảng toàn cục server-side pagination (50/page): word, IPA, nghĩa VI, badge CEFR, badge nguồn, icon audio, thumbnail image, chips books, badge **orphan** (không gắn book nào).
- Filter bar: ô tìm kiếm (match `word` **HOẶC** `meaning_vi` — semantics §4), chips CEFR (A1–C2, multi-select), select nguồn (`tất cả`/`oxford-ld`/`teacher` — teacher = `source IS NULL`, mapping pin §4), select audio (tất cả/có/thiếu), select book, toggle orphan, select sort (`createdAt` desc mặc định / `word` asc / `cefr` asc — null cefr xếp CUỐI). `orphan=1` WIN khi conflict với `bookId` (bookId bị ignore — pin).
- Chọn nhiều (checkbox per-row + select-all-page) → bulk bar: **Gán sách** (dialog multi-select books), **Tag CEFR** (OVERWRITE giá trị hiện có — teacher intent, pin §5), **Xoá** (2-phase: dry-run đếm `progressAffected` → confirm hiển thị số → apply), **Export CSV** (giữ filter hiện tại). Report sau mỗi bulk action (toast theo shape §4). Client chunk >500 ids, **chạy hết mọi chunk rồi aggregate report** (không stop-mid).
- Dialog thêm từ mới (global): word + meaning VI bắt buộc; ipa/example/cefr/source/pos/synonyms/image/audio optional — POST accept tất cả fields mới (§4).
- Dialog sửa từ: toàn bộ fields + **image uploader** (upload route mới, preview) + audio uploader (reuse `audio-uploader` hiện có). Image upload xong mà save từ fail → Blob mồ côi chấp nhận (không GC — note).

### 2.2 Curation `/admin/vocabulary/curation`
- Browse `crawl_entries` (mặc định `status=parsed`): filter headword search (match `word` COALESCE pretty `slug`), CEFR, pos, ox3000, pagination server-side (50/page, index-supported).
- Row: headword (COALESCE word, pretty slug), IPA uk/us, CEFR, pos, badge OX3000, icon audio-blob-có-sẵn, badge **"đã có từ"** khi duplicate-predicate §4 khớp (lookup 1 query per page) — link sang catalog để merge/enrich.
- Chọn nhiều → **panel soạn nghĩa VI** dạng grid: mỗi entry 1 ô input nghĩa VI (bắt buộc, validate độ dài) + đếm còn thiếu; promote bị chặn khi còn ô trống.
- Promote: chọn book đích (bắt buộc 1 book) → POST batch (cap 200/request) → progress + report (created/duplicates/skipped/failed) → refetch. Promote set: word (trim nguyên văn entry — insert qua `createVocabularyWord` giữ semantics), ipa (uk→us), cefr (normalize §4), pos, source='oxford-ld', audio (blob có sẵn, best-effort), example (sense 1 từ raw nếu derive được), meaning VI = teacher nhập. **KHÔNG đổi status entry, KHÔNG đụng runner.** Advisory lock book đích (§5.3).
- Section **Audio backfill** (scope bắt buộc): chọn book (hoặc dán wordIds) → **Dry-run** → bảng plan {matched (copy blob URL), pending (có entry nhưng chưa có blob — chỉ đếm), missing (không tìm thấy entry)} → **Apply** (cap mặc định 200/lượt, `allowDownload` opt-in cap 100) → report + refetch catalog. Marker tự nhiên: `words.audio_url IS NULL`.

### 2.3 Stats `/admin/vocabulary/stats`
- Stat cards: tổng words, audio coverage %, image coverage %, orphan count, enrich coverage % (words `source='oxford-ld'`).
- Phân bố CEFR: horizontal bar thuần CSS — buckets pin §5.8 (A1–C2 + chưa-tag + other), label + số, tổng buckets = tổng words, không lib chart.
- Bảng per-book: tên book, số words, audio coverage per book.
- Panel crawl/enrich: reuse `crawlStatsDb` (parsed/pending/failed + fill stats) + link sang crawl dashboard VU-32 (KHÔNG làm lại control).

### 2.5 Shared bulk-selection contract (tier-0 file `bulk-selection.tsx` — PIN, tier-1 KHÔNG sửa file này)
```ts
useBulkSelection<T>(rows: T[], getId: (row: T) => string | number): {
  selectedIds: Set<string|number>;        // set id đã chọn (giữ qua refetch trang — không tự xoá)
  isSelected(id): boolean; toggle(row): void;
  togglePage(): void;                     // chọn/bỏ toàn bộ trang hiện tại
  clear(): void; count: number;
}
<BulkActionBar count onClear>{actions}</BulkActionBar>  // sticky bar, ẩn khi count=0
<ConfirmDialog open title description onConfirm>        // destructive confirm chuẩn admin
```

## 3. Data model (migration ADDITIVE-ONLY trên Neon, dry-run template trước apply)

```sql
ALTER TABLE words ADD COLUMN pos text;          -- vd 'noun' — lowercase, nguồn crawl_entries.pos khi promote
ALTER TABLE words ADD COLUMN image_url text;    -- URL Blob/local upload admin, nullable
ALTER TABLE words ADD COLUMN synonyms text;     -- comma-separated, nullable
CREATE INDEX crawl_entries_cefr_idx ON crawl_entries (cefr);
CREATE INDEX crawl_entries_pos_idx ON crawl_entries (pos);
CREATE INDEX crawl_entries_ox3000_idx ON crawl_entries (ox3000);
```
- Số migration = **slot trống kế tiếp tại thời điểm SF-1 chạy** (đọc `drizzle/` — VU-37 có thể đã chiếm 0005/0006 trên branch riêng; dry-run trên template `ilec_*` theo convention repo rồi apply Neon).
- `schema.ts`: exports Drizzle cột mới (đặt cạnh định nghĩa `words` hiện có). Không đụng cột/index hiện có; `meaningVi` vẫn NOT NULL; không bảng mới.
- Index build trên 63.9k block ngắn trong migration — chấp nhận (chạy lúc crawl runner idle).

## 4. API contract (mở rộng additive — pattern `{ok:false, error:code}` + assertAdmin per method)

**Vocabularies pin (validate ở 1 chỗ — `vocabulary.ts`):**
- `cefr`: allowlist `['A1','A2','B1','B2','C1','C2']` chính xác hoa; normalize khi GHI = `trim().toUpperCase()`; không khớp allowlist sau normalize → `invalidCefr`. Filter match = equality sau normalize cùng cách (đ dữ 'b1' vẫn match B1).
- `source`: filter option `teacher` = `IS NULL`; option `oxford-ld` = equality. GHI source chỉ qua promote/enrich (admin không sửa tay source ngoài 2 giá trị chuẩn).
- `pos`: free text ≤ 32, normalize lowercase-trim khi ghi; filter = ilike exact.
- `synonyms`: nhập chuỗi comma-separated; chuẩn hoá khi GHI = split `,` → trim từng item → bỏ rỗng → join `', '`; tổng ≤ 500 ký tự.
- Search `q` (catalog): `ILIKE '%q%'` trên (`word` OR `meaning_vi`), **escape `%`, `_`, `\`** (deliberate bugfix áp cho cả 2 cột — behavior cũ search literal `%` vô nghĩa); case-insensitive; **phân biệt dấu tiếng Việt** (không có unaccent trên Neon — limitation được pin, không tự chế extension).
- **Duplicate predicate (badge + hasWord + promote-skip DÙNG MỘT RULE):** `lower(trim(entry.word)) == lower(trim(words.word))` qua query mapping; insert vẫn giữ semantics `createVocabularyWord` (unique case-sensitive — trùng lower nhưng khác case → tạo row mới, hiếm, chấp nhận).

**Endpoints:**
- `GET /api/admin/vocabulary` — params MỚI additive: `q`, `cefr` (csv A1..C2), `source` (`oxford-ld`|`teacher`), `audio` (`has`|`missing`), `bookId`, `orphan=1` (WIN khi có bookId), `sort` (`created`|`word`|`cefr` — cefr null CUỐI), giữ nguyên `limit`/`offset` + response shape (thêm field nullable `pos`,`image_url`,`synonyms` vào items — consumer cũ bỏ qua an toàn).
- `PATCH /api/admin/vocabulary` — `WordPatch` + `cefr`, `source`, `pos`, `imageUrl`, `synonyms` (route map snake_case như hiện có).
- `POST /api/admin/vocabulary` (create) — nhận thêm `cefr`, `pos`, `synonyms`, `imageUrl` (validators pin ở trên); audio giữ path cũ.
- `POST /api/admin/vocabulary/bulk` — `{action:'assign-books'|'tag-cefr'|'delete', wordIds[], bookIds?, cefr?, dryRun?:boolean}`, cap 500 ids (`tooMany` nếu vượt).
  - `assign-books` → `{ok, report:{affected, skipped, errors:[{wordId|bookId, error}]}}`; `onConflictDoNothing` (đã gắn = skipped); FK 23503 → `bookNotFound`.
  - `tag-cefr` → `{ok, report:{affected, errors}}` — **OVERWRITE** giá trị hiện có.
  - `delete` + `dryRun:true` → `{ok, report:{willDelete, progressAffected, missing}}` KHÔNG xoá; `dryRun` thiếu/false → xoá thật `{ok, report:{affected, progressAffected, errors}}` (cascade qua FK; `progressAffected` đếm từ dry-run trước đó — client gửi kèm số đã hiển thị).
  - Mọi action: 1 revalidate cuối batch; client chunk >500 và aggregate report (không stop-mid).
- `GET /api/admin/vocabulary/export` — cùng filter params của GET list; CSV stream; **>10k rows → `{ok:false,error:'tooMany'}`** (không truncate âm thầm); sort = sort param (default `created` desc); 0 rows → CSV header-only; filename `vocabulary-YYYY-MM-DD.csv`; cột `word,ipa,meaning_vi,example,cefr,source,pos,synonyms,audio_url,image_url`; escape RFC (quote doubling) + BOM UTF-8.
- `GET /api/admin/vocabulary/stats` — `{ok, totals:{words, withAudio, withImage, orphan, enriched}, cefrHistogram:{A1..C2, untagged, other}, perSource, perBook:[{bookId, title, words, withAudio}], crawl:{parsed,pending,failed,...}}`; histogram buckets: `A1..C2` (normalized equality) + `untagged` (NULL) + `other` (giá trị lạ sau normalize) — **tổng buckets = tổng words** (§5.8).
- `POST /api/admin/vocabulary/image` — upload 1 image (multipart) → put qua `storage-server` path `images/words/{wordId|tmp}-{ts}.{ext}` (local dev → `public/images/...`, prod blob → CDN URL — cùng dual-driver audio), max 2MB (`imageTooLarge`), mime allowlist png/jpeg/webp (`imageMime`) → `{ok, url}`.
- `POST /api/admin/vocabulary/audio-backfill` — `{scope:{bookId} | {wordIds[]}, dryRun:boolean, limit?:number, allowDownload?:boolean}` — **scope BẮT BUỘC** (`scopeRequired` nếu thiếu); scan words thiếu audio trong scope → match crawl_entries qua `slugPatterns` (tái dùng export match.ts, KHÔNG đổi behavior) → plan `{matched:[{wordId, blobUrl}], pending (count), missing:[wordId]}`; apply copy URL vào `audio_url` (blob có sẵn); `allowDownload:true` → download+put blob cho `pending`, cap 100 (`tooMany`); apply cap 200. Marker tự nhiên: `words.audio_url IS NULL`.
- `GET /api/admin/vocabulary/crawl/entries` — params `status`(default `parsed`), `q` (match word COALESCE pretty slug), `cefr`, `pos`, `ox3000`, `limit/offset`; rows + `hasWord` (duplicate predicate §4, 1 query/page).
- `POST /api/admin/vocabulary/crawl/promote` — `{entryIds[], bookId, meanings:{[entryId]:string}}` cap 200 (`tooMany`); meanings bắt buộc từng entry (`meaningRequired`) validate TRƯỚC khi chạy mutation nào; advisory lock bookId; duplicate theo predicate → skip đếm `duplicates`; response `{ok, report:{created, duplicates, failed:[{entryId, error}]}}`; FK 23503 → `bookNotFound`.

**Error codes toàn cục (i18n map 1:1):** `tooMany, scopeRequired, invalidCefr, invalidPos, invalidSynonyms, invalidImageUrl, imageTooLarge, imageMime, bookNotFound, meaningRequired, invalidEntryWord, wordNotFound, notFound, duplicateWord, generic` + auth `not-authenticated/not-admin` (hiện có).

## 5. Bulk semantics (khung cứng — SF-1 pin trong tests)

1. **Cap**: bulk words ≤500, promote/backfill ≤200, backfill-download ≤100 ids/request — vượt → `tooMany`; client chunk tự động (pattern `crawl-batch.ts chunkIds`), aggregate report.
2. **Idempotency-safe**: assign books `onConflictDoNothing` (đã gắn = skipped, không lỗi); promote duplicate → skip + đếm (KHÔNG lỗi giữa chừng); delete report per-id errors, tiếp tục các id còn lại.
3. **Order race**: bulk assign + promote mở transaction per book với **`pg_advisory_xact_lock(bookId)`** trước khi đọc `max(order)` — 2 request song song cùng book được serialize; KHÔNG đổi import/create paths cũ (giữ accept-race-retry như schema comment — out of scope).
4. **Revalidate**: đúng 1 lần `revalidateContent()` sau batch, KHÔNG trong loop.
5. **Cascade warning**: delete 2-phase — dryRun trả `{willDelete, progressAffected, missing}` trước; UI confirm hiển thị số rồi mới apply.
6. **Export**: CSV cột `word,ipa,meaning_vi,example,cefr,source,pos,synonyms,audio_url,image_url`; escape RFC; BOM UTF-8; >10k → `tooMany`; 0 rows → header-only; filename `vocabulary-YYYY-MM-DD.csv`.
7. **tag-cefr = OVERWRITE** (teacher intent) — khác tinh thần COALESCE của enrich (enrich fill-empty giữ nguyên không đổi).
8. **Histogram buckets** (stats): normalize cefr (trim+upper) → khớp A1..C2 → bucket tương ứng; NULL → `untagged`; giá trị khác → `other`. Tổng = tổng words (test pin).

## 6. Acceptance (browser/e2e — trừ mục ghi rõ; test-ownership map ở §8)

1. `/vi/admin/vocabulary`: filter `orphan` + CEFR B1 + audio=thiếu trả đúng tập; search theo NGHĨA ("nghĩa ví dụ" tiếng Việt có dấu) trả đúng từ; sửa 1 từ thêm pos + synonyms → lưu → refetch thấy; upload image → thumbnail hiện; tab per-book manager cũ vẫn hoạt động (regression).
2. Chọn 3 từ → gán 2 books → toast report đúng shape; từ xuất hiện đúng book ở public library; chọn 2 từ → tag B2 (OVERWRITE cả từ đã có cefr) → badge cập nhật; chọn 1 từ có progress → delete dry-run hiện đếm progress → apply → từ biến mất, public library không còn; export với filter → CSV mở đúng dấu tiếng Việt, đúng filter, filename đúng pattern.
3. Curation: filter CEFR A2 + ox3000 → chọn 2 entry → soạn 2 nghĩa VI → promote vào book → 2 từ mới xuất hiện (SF-3 assert qua GET API + DB row; **assertion "hiện trong catalog UI" deferred cho SF-4 convergence trên merged base**); entry trùng (predicate §4) → badge "đã có từ" + promote skip không chết batch; nghĩa thiếu → nút promote disabled.
4. Backfill (scoped fixture book): dry-run trả plan khớp seed; apply 5 từ fixture → 5 `audio_url` gán từ blob fixture; chạy lại cùng scope → 0 matched (marker tự nhiên); KHÔNG đụng words ngoài scope.
5. Stats: các số khớp SQL đếm trực tiếp trên cùng DB (route contract test); histogram tổng = tổng words kể cả khi có row cefr bẩn (`'b2 '` → other).
6. `src/messages.test.ts` parity vi/en xanh (mọi key mới có cả 2).
7. Nav: "Từ vựng" active trên `/admin/vocabulary`, KHÔNG double-active với "Crawl" trên `/admin/vocabulary/crawl` (SF-2 e2e — 2 surface có trong worktree sf-2); **"Từ vựng" active trên `/admin/vocabulary/curation` deferred cho SF-4 convergence** (curation page không tồn tại trong worktree sf-2).

## 7. Boundary (KHÔNG làm)

- KHÔNG sửa crawl runner, crawl dashboard, enrich control (VU-32) — curation chỉ ĐỌC lake + tạo words. `enrich.ts`/`match.ts`: CHỈ thêm export mới nếu cần, **zero behavior-change trên export hiện có** (10 importers VU-32 đang dùng).
- KHÔNG sửa per-book VocabularyManager + trang per-book (chỉ nhận additive field mới nếu dễ — không bắt buộc).
- KHÔNG draft/published, KHÔNG LLM/dịch tự động nghĩa VI, KHÔNG image search.
- KHÔNG đổi public queries (hub/review/quiz/lookup) và **KHÔNG đụng components/flows VU-37 đang rebuild song song** (learn/review session UI, hub dashboard, `vocab_activity` schema) — hiển thị pos/image/synonyms public = follow-up sau khi VU-37 merge.
- KHÔNG bảng mới, KHÔNG runner mới, KHÔNG playwright config mới, KHÔNG đụng import/create paths cũ của `vocabulary-store` (giữ semantics; chỉ thêm).
- KHÔNG đụng `scripts/audio-sync.ts` (excluded prefixes đã đúng) trừ khi test chứng minh ngược lại → flag.

## 8. Testing & release (test-ownership map — acceptance → (SF, file, config))

| Acceptance | SF | File | Config |
|---|---|---|---|
| §6.1 filter/search/edit/image + regression per-book | SF-2 | `e2e/admin-vocabulary-catalog.spec.ts` | playwright.admin.config |
| §6.2 bulk assign/tag/delete/export | SF-2 | (cùng file trên) | playwright.admin.config |
| §6.3 curation browse/promote/duplicate | SF-3 | `e2e/admin-vocabulary-curation.spec.ts` | playwright.admin.config |
| §6.4 backfill scoped | SF-3 | (cùng file trên) | playwright.admin.config |
| §6.5 stats SQL-khớp + histogram | SF-1 (store/route) + SF-4 (contract test SQL-khớp) | `cms-stats-store.test.ts` + stats route test | vitest.config |
| §6.6 i18n parity | SF-1 (skeleton 4 files) + SF-2/3/4 (điền file mình) | `messages/{vi,en}/vocab-{cms-common,catalog,curation,stats}.json` — KHÔNG sửa `admin.json` (tránh conflict sf-2 ∥ sf-3) | vitest.config |
| §6.7 nav active | SF-2 (catalog + crawl no-double-active) + **SF-4 (curation active — deferred)** | `e2e/admin-vocabulary-nav.spec.ts` + convergence sweep | playwright.admin.config |
| Unit stores/bulk semantics §5 | SF-1 | `cms-bulk-store.test.ts`, `audio-backfill.test.ts`, `crawl-entries-store.test.ts`, `promote-store.test.ts`, `cms-stats-store.test.ts`, `bulk-selection.test.ts` | vitest.config |
| Route contract (bulk/export/stats/image/backfill/entries/promote) | SF-1 | `*.route.test.ts` pattern crawl routes | vitest.config |
| RLS rerun `scripts/test-rls.test.ts` | SF-1 (story-verify gate) | — | vitest.rls.config |
| Cleanup fixture | SF-1 (helper `e2e/helpers/cleanup-vocab-cms.ts`) dùng chung SF-2/SF-3/SF-4 | — | — |

- Fixture convention: words prefix `qa-cms-` + entries slug `qa-cms-*` (tránh đụng UNIQUE thật trên shared-DB); cleanup theo pattern `scripts/cleanup-test-data.ts` trong teardown mỗi e2e; workers 1.
- EXPLAIN + count data thật chạy trên **template Neon** (`ilec_*` — convention repo), không phải "staging".
- **Phased release (story ≥2 tiers):** Phase 1 = tier 0–1 (SF-1+2+3 — CMS dùng được thật) → **checkpoint + security-audit** (bulk/input surface mới) trước khi launch Phase 2; Phase 2 = SF-4 (stats + convergence + rehearsal dữ liệu thật trên template: bulk 500, export 5k, backfill scoped 200, promote 20) → checkpoint cuối.
- **Merge-order Phase 1:** sf-2 ∥ sf-3 chạy song song, merge TUẦN TỰ sf-2 → sf-3; i18n tách FILE RIÊNG mỗi SF (`vocab-catalog.json` / `vocab-curation.json` / `vocab-stats.json` / `vocab-cms-common.json` — SF-1 tạo skeleton + wire `admin/layout.tsx` import một lần) + cleanup helper SF-1 dùng chung → **không file chung giữa sf-2/sf-3**.
- **Phase 1 dead-link pin:** sub-nav link `/admin/vocabulary/stats` 404 tới khi SF-4 merge — CHẤP NHẬN, ghi rõ ở checkpoint Phase 1 (admin-internal).
- RLS/contract: `scripts/test-rls.test.ts` chạy lại (store mới dùng chung `db`).
- e2e chú ý memory: kill stale dev server trước khi chạy; `reuseExistingServer` bẫy chéo worktree.

## 9. Rủi ro (từ P0 + critic — xử trong spec)

| # | Rủi ro | Xử lý |
|---|---|---|
| 1 | Bulk-promote chặn bởi meaningVi NOT NULL + no-LLM | Teacher-in-loop grid §2.2 (user đã chốt không draft state) |
| 2 | Backfill × git-mirror bloat | ĐÃ GIẢI: `audio/oxford/` excluded từ VU-32; backfill copy-only + download opt-in cap |
| 3 | crawl_entries thiếu index filter | Migration additive 3 index; EXPLAIN template trong SF-1 |
| 4 | Race unique(book,order) bulk assign/promote | `pg_advisory_xact_lock(bookId)` per book trong transaction (§5.3) + test unit contract |
| 5 | Vỡ per-book manager (7 importers) | Additive-only params; giữ default cũ; regression e2e admin cũ trong SF-2 |
| 6 | Number rows thật chưa đo | SF-1 task count + EXPLAIN trên template trước khi sizing pagination |
| 7 | Nav double-active `/admin/vocabulary*` | Explicit prefix rule §2.1 + e2e riêng (§8) |
| 8 | **VU-37 chạy song song**: schema.ts + drizzle slots + public components chạm nhau | Migration slot = trống kế tiếp lúc chạy (§3); public/hub/session = cấm (§7); merge order do coordinator xử theo merge-playbook |
| 9 | Shared-DB e2e mutation data thật | Backfill scope bắt buộc + fixture `qa-cms-` + dry-run delete (§4/§8) |
