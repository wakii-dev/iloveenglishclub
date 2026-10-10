# SF-1 Context Pack — Nền tảng CMS: schema + stores + REST + shared infra (tier 0)

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-10-vocab-cms-design.md` (v2 — authority tuyệt đối, SF này không hỏi lại user). Bracket plan: `docs/superpowers/plans/2026-10-10-vu43-bracket-plan.md`. Story: VU-43, dest `story-vu43-vocab-cms`, Phase 1/2 (checkpoint sau tier 1).

## Spec slice (SF-1 chịu trách nhiệm)

1. **Probe trước khi code** (template Neon, KHÔNG prod): `SELECT count(*)` trên `words`/`crawl_entries`/`book_words`/`user_word_progress` + `EXPLAIN` 3 query filter (`cefr`, `pos`, `ox3000` trên crawl_entries). Ghi evidence số liệu vào comment SF — dùng để sizing pagination (words vài nghìn — client pagination 50 OK; crawl 63.9k — server-side bắt buộc, tránh LIMIT lớn — bài học Neon shared-DB flake).
2. **Migration slot-trống-kế-tiếp** (đọc `drizzle/` — VU-37 song song có thể đã chiếm 0005/0006 sau khi merge master; nếu trùng → lấy slot kế + sửa `meta/_journal.json`): additive-only — `ALTER TABLE words ADD COLUMN pos text` (lowercase, nguồn crawl), `image_url text`, `synonyms text` (comma); `CREATE INDEX crawl_entries_cefr_idx/pos_idx/ox3000_idx`. Dry-run trên template `ilec_*` (convention repo) rồi apply Neon. `src/db/schema.ts` exports Drizzle đặt cạnh `words` hiện có. KHÔNG đụng cột/index/bảng hiện có; `meaningVi` giữ NOT NULL.
3. **Validators** (`src/lib/admin/vocabulary.ts`): cefr normalize `trim().toUpperCase()` + allowlist `['A1','A2','B1','B2','C1','C2']` → lỗi `invalidCefr`; pos free text ≤32 lowercase-trim; synonyms chuẩn hoá GHI = split `,` → trim → bỏ rỗng → join `', '`, ≤500 ký tự → `invalidSynonyms`; imageUrl shape URL hợp lệ → `invalidImageUrl`. Tests pin boundary (`'b1 '`→`B1`, `' x , y '`→`'x, y'`).
4. **WordInput/WordPatch mở rộng** + `POST`/`PATCH /api/admin/vocabulary` nhận `cefr`, `pos`, `synonyms`, `imageUrl` (route map snake_case như hiện có — `image_url`). Error codes toàn cục spec §4 (enum cuối spec). Route contract tests. **Back-compat tuyệt đối:** consumer cũ (`vocabulary-manager.tsx`, per-book page) phải chạy nguyên — chỉ thêm, không đổi shape cũ.
5. **`listVocabulary` v2** (additive — signature cũ `{bookId, q, limit, offset}` chạy nguyên): `q` = `ILIKE '%q%'` trên (`word` OR `meaning_vi`) với **escape `% _ \`**; `cefr` csv match normalized equality; `source`: `oxford-ld` equality, `teacher` = `IS NULL`; `audio`: `has`/`missing`; `orphan=1` = LEFT JOIN book_words IS NULL (**WIN khi conflict bookId**); `sort`: `created` (mặc định) | `word` | `cefr` (null CUỐI). Items thêm field nullable `pos`, `image_url`, `synonyms`. Tests: cũ xanh + mới pin từng filter.
6. **`cms-bulk-store` + route `/api/admin/vocabulary/bulk`** `{action, wordIds[], bookIds?, cefr?, dryRun?}` cap 500 → `tooMany`:
   - `assign-books`: **transaction per book mở `pg_advisory_xact_lock(bookId)` TRƯỚC khi đọc `max(order)`** (READ COMMITTED KHÔNG serialize max — 2 tx song song cùng đọc max=10 → 23505; advisory lock là cơ chế thật, không phải row-lock); insert order nối tiếp; `onConflictDoNothing` → đã gắn = `skipped`; FK 23503 → `bookNotFound`.
   - `tag-cefr`: **OVERWRITE** (teacher intent — khác COALESCE của enrich, enrich KHÔNG đổi).
   - `delete`: `dryRun:true` → `{willDelete, progressAffected, missing}` KHÔNG xoá (đếm `user_word_progress` sẽ cascade); apply → `{affected, progressAffected, errors}` — per-id lỗi không chặn id khác.
   - **1 `revalidateContent()` cuối batch — KHÔNG trong loop** (contract test pin). Client chunk >500 + aggregate (task SF-2, nhưng shape response phải hỗ trợ).
7. **Export lib + route `/export`**: CSV builder thuần — cột `word,ipa,meaning_vi,example,cefr,source,pos,synonyms,audio_url,image_url`, escape RFC (quote doubling), BOM UTF-8, golden test; route nhận cùng filter params của GET list; >10k rows → `{ok:false,error:'tooMany'}` (KHÔNG truncate âm thầm); 0 rows → header-only; `Content-Disposition: attachment; filename="vocabulary-YYYY-MM-DD.csv"`; sort = sort param.
8. **`cms-stats-store` + route `/stats`**: `totals{words, withAudio, withImage, orphan, enriched}` (enriched = `source='oxford-ld'`); `cefrHistogram` buckets = A1..C2 (normalized equality) + `untagged` (NULL) + `other` (giá trị lạ sau normalize) — **TỔNG buckets = tổng words** (row `cefr='b2 '` → other — test pin); `perSource`; `perBook[{bookId,title,words,withAudio}]`; `crawl` reuse `crawlStatsDb` (đừng viết lại). Route contract test shape §4.
9. **`audio-backfill` store + route `/audio-backfill`**: input `{scope:{bookId}|{wordIds[]}, dryRun, limit?, allowDownload?}` — thiếu scope → `scopeRequired`; scan words `audio_url IS NULL` trong scope → match `crawl_entries` qua `slugPatterns`/match exports **tái dùng, KHÔNG đổi behavior** (`enrich.ts`/`match.ts` chỉ THÊM export mới nếu cần — 10 importers VU-32 đang dùng); plan `{matched:[{wordId,blobUrl}], pending:count, missing:[wordId]}` (matched = entry có `audioUkBlob ?? audioUsBlob`; pending = entry có nhưng chưa có blob — chỉ đếm); apply copy URL cap 200; `allowDownload:true` → download+put cho pending cap 100 (deps `download`/`put` injectable — test mock); **1 revalidate cuối apply + pin**.
10. **`crawl-entries-store` + route `/crawl/entries`**: filters `status` (default `parsed`), `q` (match `word` COALESCE pretty slug), `cefr`, `pos`, `ox3000`, `limit/offset` (pagination server-side, index-supported sau migration); rows kèm `hasWord` theo **duplicate predicate: `lower(trim(entry.word)) == lower(trim(words.word))`** — 1 query cho cả page (KHÔNG per-row).
11. **`promote-store` + route `/crawl/promote`** `{entryIds[], bookId, meanings:{[entryId]:string}}` cap 200: validate meanings bắt buộc từng entry (`meaningRequired`) TRƯỚC mutation nào; transaction advisory lock `bookId` (cùng cơ chế task 6); insert qua `createVocabularyWord` (giữ semantics — unique case-sensitive; trùng theo duplicate predicate → skip đếm `duplicates`); set word (trim nguyên văn), ipa uk→us, cefr (normalize), pos, `source='oxford-ld'`, audio blob best-effort, example từ raw sense 1 nếu derive được, meaning VI = teacher; report `{created, duplicates, failed:[{entryId, error}]}`; FK 23503 → `bookNotFound`; **1 revalidate cuối + pin**. KHÔNG UPDATE `crawl_entries.status` — lake read-only.
12. **Route `POST /api/admin/vocabulary/image`**: assertAdmin; multipart 1 file; max 2MB → `imageTooLarge`; mime allowlist png/jpeg/webp → `imageMime`; put qua `storage-server` (dual-driver local/blob như audio — đặt path `images/words/{wordId|tmp}-{timestamp}.{ext}`); response `{ok, url}`. Contract tests. (Upload xong mà save từ fail → Blob mồ côi chấp nhận, không GC.)
13. **Shared tier-0 client primitives** (`src/components/admin/bulk-selection.tsx` + `vocabulary-sub-nav.tsx`):
    - `useBulkSelection<T>(rows, getId)` → `{selectedIds:Set, isSelected, toggle, togglePage, clear, count}` — selection GIỮ qua refetch trang; `BulkActionBar({count, onClear, children})` sticky, ẩn khi 0; `ConfirmDialog{open,title,description,onConfirm}` chuẩn admin (rounded-[12px], font-display — soi `vocabulary-manager.tsx`).
    - `VocabularySubNav` 3 links Catalog `/admin/vocabulary` | Curation `/admin/vocabulary/curation` | Stats `/admin/vocabulary/stats` — active theo pathname chính xác; SF-2/3/4 CHỈ render, KHÔNG sửa file này.
    - Tests logic hook (renderHook/vitest).
14. **i18n skeleton + e2e infra**: tạo 4 files `messages/{vi,en}/`{`vocab-cms-common`, `vocab-catalog`, `vocab-curation`, `vocab-stats`}.json — skeleton keys: `vocab-cms-common` chứa `nav.vocabulary`, `tabs.{catalog,curation,stats}`, error codes §4; 3 file còn lại object rỗng/skeleton. `src/app/(admin)/admin/layout.tsx` import cả 4 MỘT LẦN, provider messages `{admin, vocabCmsCommon, vocabCatalog, vocabCuration, vocabStats}` — **KHÔNG sửa `admin.json`** (chống conflict sf-2 ∥ sf-3). Helper `e2e/helpers/cleanup-vocab-cms.ts`: xoá words `qa-cms-%` + crawl_entries `qa-cms-%` (cascade liên quan), **dry-run mặc định** `--apply` mới xoá — pattern `scripts/cleanup-test-data.ts`. Chạy `src/messages.test.ts` parity xanh.
15. story-verify sạch (kèm chạy lại `scripts/test-rls.test.ts` — vitest.rls.config, owner RLS rerun của story) → merge về đích `story-vu43-vocab-cms` → comment merge hash + evidence lên sub-issue.

## Touch map (SF-1 sở hữu)

```
drizzle/00NN_*.sql                      (mới — slot kế tiếp)
drizzle/meta/_journal.json              (sửa — thêm entry)
src/db/schema.ts                        (sửa — additive exports cạnh words)
src/lib/admin/vocabulary.ts             (sửa — validators mới + WordInput mở rộng)
src/lib/admin/vocabulary-store.ts       (sửa — listVocabulary v2 additive, WordPatch +)
src/lib/admin/cms-bulk-store.ts         (mới)
src/lib/admin/cms-stats-store.ts        (mới)
src/lib/admin/audio-backfill.ts         (mới)
src/lib/admin/crawl-entries-store.ts    (mới)
src/lib/admin/promote-store.ts          (mới)
src/lib/admin/export-csv.ts             (mới — hoặc đặt trong vocabulary.ts)
src/app/api/admin/vocabulary/route.ts   (sửa — GET params + POST/PATCH fields)
src/app/api/admin/vocabulary/bulk/route.ts       (mới)
src/app/api/admin/vocabulary/export/route.ts     (mới)
src/app/api/admin/vocabulary/stats/route.ts      (mới)
src/app/api/admin/vocabulary/audio-backfill/route.ts (mới)
src/app/api/admin/vocabulary/image/route.ts      (mới)
src/app/api/admin/vocabulary/crawl/entries/route.ts (mới)
src/app/api/admin/vocabulary/crawl/promote/route.ts (mới)
src/components/admin/bulk-selection.tsx (mới)
src/components/admin/vocabulary-sub-nav.tsx (mới)
messages/{vi,en}/vocab-{cms-common,catalog,curation,stats}.json (mới skeleton)
src/app/(admin)/admin/layout.tsx        (sửa — import 4 files + provider messages)
e2e/helpers/cleanup-vocab-cms.ts        (mới)
+ file test tương ứng mỗi lib/route/component
```

READ-ONLY (khác sở hữu — đụng = flag): `src/lib/oxford/enrich.ts` + `match.ts` (CHỈ import; thêm export mới nếu BẮT BUỘC, zero behavior-change — 10 importers VU-32), `crawl-batch.ts` (pattern chunkIds), `storage-server.ts` (chỉ import), `scripts/*`, mọi page/component UI (SF-2/3/4), `messages/{vi,en}/admin.json`, `vocabulary-manager.tsx`, crawl dashboard components.

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. Trên DB đã migrate: `words` có 3 cột nullable mới; EXPLAIN query filter cefr/pos/ox3000 trên crawl_entries dùng index (không seq scan).
2. Gọi `GET /api/admin/vocabulary?q=<nghĩa-tiếng-Việt-có-dấu>` trả đúng từ khớp meaning_vi; `cefr=b1` match từ `B1`; `orphan=1` trả đúng tập từ không gắn book; sort cefr đưa null xuống cuối.
3. Gọi 2 lần `POST /bulk assign-books` song song cùng book (500 ids) → KHÔNG 23505 chết request nào — advisory lock serialize, order nối tiếp, `skipped` đúng.
4. `POST /bulk delete dryRun` trên từ có progress → `progressAffected` > 0 đúng số, KHÔNG có row nào bị xoá; apply → cascade đúng, public library không còn từ.
5. Export với filter → CSV mở đúng: header 10 cột, nghĩa tiếng Việt không lỗi font, từ >10k bị chặn `tooMany`, 0 kết quả → header-only.
6. Stats histogram: seed row `cefr='b2 '` → bucket `other`; tổng buckets = tổng words khớp SQL đếm trực tiếp.
7. Backfill dry-run scope book fixture → plan khớp seed; apply → đúng số `audio_url` gán từ blob; chạy lại → 0 matched; thiếu scope → `scopeRequired`.
8. Promote 2 entries fixture (meanings đủ) → 2 words mới đúng fields (ipa/cefr/pos/source/example) gắn book; meanings thiếu → `meaningRequired` KHÔNG mutation nào chạy; entry trùng → `duplicates` đếm đúng.
9. Image upload >2MB → `imageTooLarge`; file .txt → `imageMime`; file chuẩn → `{ok, url}` playback được.
10. `bulk-selection` + `vocabulary-sub-nav` tests xanh; parity `vocab-*.json` vi/en xanh; admin layout render KHÔNG vỡ (4 namespace nạp đủ).

## Boundary (KHÔNG làm — đụng tới = flag, không code)

- KHÔNG viết UI nào (SF-2 catalog, SF-3 curation/backfill, SF-4 stats — chỉ primitives + sub-nav thuần).
- KHÔNG đụng crawl runner/dashboard VU-32; `enrich.ts`/`match.ts` chỉ thêm export nếu bắt buộc, zero behavior-change.
- KHÔNG sửa `messages/{vi,en}/admin.json` (files riêng đã tạo); KHÔNG sửa `vocabulary-manager.tsx` + trang per-book.
- KHÔNG đụng public queries/components (hub/review/quiz/lookup) và surfaces VU-37 đang rebuild (learn/review session UI, `vocab_activity`).
- KHÔNG đổi import/create paths cũ của vocabulary-store (chỉ thêm); KHÔNG playwright config mới; KHÔNG BLOB write ngoài image route + allowDownload backfill.
