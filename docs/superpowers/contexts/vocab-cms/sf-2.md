# SF-2 Context Pack — Catalog UI toàn cục `/admin/vocabulary` (tier 1)

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-10-vocab-cms-design.md` (v2 — authority). Bracket plan: `docs/superpowers/plans/2026-10-10-vu43-bracket-plan.md`. Story: VU-43, dest `story-vu43-vocab-cms`, Phase 1/2. **Tiền đề:** SF-1 đã merge về đích — stores/Routes/primitives/i18n skeleton có sẵn trong worktree này.

## Spec slice (SF-2 chịu trách nhiệm)

1. **Page shell `/admin/vocabulary`** (`src/app/(admin)/admin/vocabulary/page.tsx` — server component, role-gate ở admin layout CÓ SẴN, không tự làm): render `VocabularySubNav` (SF-1) active Catalog + `VocabularyCatalog`. Nav item **"Từ vựng"** thêm vào `admin-nav.tsx` GIỮA Books và Crawl — active rule: pathname bắt đầu `/admin/vocabulary` VÀ KHÔNG bắt đầu `/admin/vocabulary/crawl` (tranh prefix với item Crawl — xử lý explicit); key label từ `vocab-cms-common.json` (`nav.vocabulary` — SF-1 tạo sẵn). Exit self-contained: viết `e2e/admin-vocabulary-nav.spec.ts` sớm, chạy phần catalog + crawl xanh ngay task này.
2. **`VocabularyCatalog`** client component: gọi `GET /api/admin/vocabulary` (SF-1) pagination server-side 50/page; state filters + page; refetch sau mutation; **empty state** 0 kết quả (không bảng trống xấu). Component test = **vitest fetch mock** (KHÔNG có msw trong repo — không tự thêm dep).
3. **Filter bar**: search input (placeholder ghi rõ tìm theo từ HOẶC nghĩa — phân biệt dấu tiếng Việt là limitation được pin, không hứa không-dấu), chips CEFR A1–C2 multi-select, select nguồn (`tất cả`/`oxford-ld`/`teacher`), select audio (`tất cả`/`có`/`thiếu`), select book (load danh sách books 1 lần), toggle orphan, select sort (mới nhất/word/cefr). Mỗi filter đổi → refetch với params đúng (test).
4. **Bảng rows**: word (bold), ipa, nghĩa VI, badge CEFR, badge nguồn (oxford-ld/teacher), icon audio (có/không), thumb image (có/không), chips books (link `/admin/books/[slug]/vocabulary`), badge **orphan**. a11y: label mỗi cell/icon, contrast badge.
5. **Bulk select** dùng `useBulkSelection`/`BulkActionBar` (SF-1 — KHÔNG sửa file tier-0): checkbox per-row + select-all-page + count + clear; selection GIỮ qua refetch.
6. **Bulk gán sách**: dialog multi-select books → POST `/bulk {action:'assign-books', wordIds, bookIds}` (chunk >500 + aggregate report) → toast report `{affected, skipped, errors}`. **Assert e2e: từ được gán XUẤT HIỆN ở public book page** (surface có trong base — `/[locale]/books/[book]`).
7. **Bulk tag CEFR**: dialog select A1–C2 + cảnh báo **OVERWRITE** (từ đã có cefr sẽ bị đè) → POST `{action:'tag-cefr', cefr}` → toast. e2e pin overwrite 1 từ đã có badge.
8. **Bulk xoá 2-phase**: POST `{action:'delete', dryRun:true}` → dialog confirm hiển thị `{willDelete, progressAffected}` (cảnh báo mất SRS học viên) → apply → toast; **assert e2e: từ biến mất khỏi public book page**. Fixture `qa-cms-` + cleanup helper SF-1 (`e2e/helpers/cleanup-vocab-cms.ts --apply` trong teardown).
9. **Export button**: GET `/export` giữ nguyên filter hiện tại → download blob (filename từ Content-Disposition). e2e assert filename pattern + header CSV 10 cột.
10. **Dialog thêm từ** (global): word + meaning VI bắt buộc; ipa/example/cefr/source/pos/synonyms/image optional (POST mới nhận đủ — SF-1); KHÔNG bắt buộc gắn book (orphan hợp lệ — ghi chú trong dialog). **Dialog sửa từ**: toàn bộ fields + audio uploader reuse `audio-uploader.tsx` (route `/audio` có sẵn) + **image upload** qua `POST /api/admin/vocabulary/image` (SF-1) + preview thumb trước save. e2e: sửa thêm pos+synonyms → refetch thấy; upload image → thumb hiện.
11. **i18n điền `messages/{vi,en}/vocab-catalog.json`** (SF-1 tạo skeleton) — KHÔNG đụng `admin.json`. Chạy `src/messages.test.ts` parity xanh.
12. **e2e + verify**: `e2e/admin-vocabulary-catalog.spec.ts` phủ §6.1–6.2 (spec) — chỉ surface có trong worktree; `admin-vocabulary-nav.spec.ts` = active trên `/admin/vocabulary` + KHÔNG double-active với Crawl trên `/admin/vocabulary/crawl`; regression per-book manager cũ (e2e admin specs liên quan vocabulary vẫn xanh); story-verify sạch → merge về đích + audit comment. **Merge-order: sf-2 merge TRƯỚC sf-3.**

## Touch map (SF-2 sở hữu)

```
src/app/(admin)/admin/vocabulary/page.tsx        (mới — root catalog, hiện 404)
src/components/admin/vocabulary-catalog.tsx      (mới)
src/components/admin/admin-nav.tsx               (sửa — thêm item Từ vựng)
messages/{vi,en}/vocab-catalog.json              (điền — skeleton SF-1)
e2e/admin-vocabulary-catalog.spec.ts             (mới)
e2e/admin-vocabulary-nav.spec.ts                 (mới)
+ component tests tương ứng
```
READ-ONLY: mọi file SF-1 (`bulk-selection.tsx`, `vocabulary-sub-nav.tsx`, stores, routes, `vocab-cms-common.json`, `admin/layout.tsx` — đụng = flag), `vocabulary-manager.tsx` + trang per-book (giữ nguyên, chỉ regression), `admin.json`, public pages (chỉ assert, không sửa), SF-3 files (`curation/*`).

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. Admin mở `/vi/admin/vocabulary` (trước đây 404): thấy bảng TOÀN BỘ từ, 50/trang, nav "Từ vựng" active.
2. Gõ nghĩa tiếng Việt có dấu vào ô tìm → ra đúng từ; chọn CEFR B1 + orphan → tập đúng; sort cefr → từ chưa tag nằm cuối.
3. Sửa 1 từ: thêm pos + synonyms + upload image → lưu → refetch thấy badge/thumb; sửa cefr/source được (trước đây PATCH không có).
4. Chọn 3 từ → gán 2 books → toast report đúng; mở public book page → từ xuất hiện. Chọn 1 từ có progress → xoá → dialog hiện số progress bị ảnh hưởng → confirm → từ biến mất khỏi cả catalog lẫn public book page.
5. Export giữ filter → file tải về tên `vocabulary-YYYY-MM-DD.csv`, mở Excel đọc đúng dấu tiếng Việt.
6. Nav: "Từ vựng" active trên `/admin/vocabulary`; đứng `/admin/vocabulary/crawl` chỉ Crawl active (không double). Per-book manager cũ vẫn chạy (regression).

## Boundary (KHÔNG làm — đụng tới = flag, không code)

- KHÔNG sửa file tier-0 SF-1 (stores/routes/primitives/`vocab-cms-common.json`/layout) — thiếu gì gì đó flag coordinator, không tự sửa.
- KHÔNG làm trang curation/stats (SF-3/SF-4) — sub-nav link 404 của Stats là CHẤP NHẬN (phase-1 dead-link pin); KHÔNG stub trang curation để test nav (assertion chéo SF dồn SF-4).
- KHÔNG đụng `admin.json`, crawl dashboard, public queries, surfaces VU-37.
- KHÔNG playwright config mới — dùng `playwright.admin.config.ts` (testMatch `admin-*`, workers 1, port 3000); fixture `qa-cms-` prefix; cleanup helper SF-1 trong teardown.
