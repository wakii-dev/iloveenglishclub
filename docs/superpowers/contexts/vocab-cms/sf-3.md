# SF-3 Context Pack — Curation queue Oxford + audio backfill UI (tier 1)

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-10-vocab-cms-design.md` (v2 — authority). Bracket plan: `docs/superpowers/plans/2026-10-10-vu43-bracket-plan.md`. Story: VU-43, dest `story-vu43-vocab-cms`, Phase 1/2. **Tiền đề:** SF-1 đã merge — `/crawl/entries`, `/crawl/promote`, `/audio-backfill` routes + primitives + i18n skeleton có sẵn. **SF-2 chạy SONG SONG** — catalog UI KHÔNG có trong worktree này, KHÔNG stub trang catalog.

## Spec slice (SF-3 chịu trách nhiệm)

1. **Page shell `/admin/vocabulary/curation`**: server component + render `VocabularySubNav` (SF-1) active Curation. KHÔNG đụng `admin-nav.tsx` (SF-2 sở hữu). i18n từ `vocab-curation.json` (skeleton SF-1).
2. **`CurationBrowser`** client: gọi `GET /api/admin/vocabulary/crawl/entries` (SF-1) — filters: status (mặc định `parsed`; cho chọn pending/failed xem được), search headword, chips/select CEFR, pos, toggle OX3000; pagination server-side 50/page (63.9k rows — KHÔNG bao giờ fetch-all); empty state + state "không có entry parsed nào khớp". Component test = vitest fetch mock (không msw).
3. **Entry rows**: headword (COALESCE word, pretty slug), IPA uk/us, badge CEFR, pos, badge OX3000, icon audio-blob-có-sẵn, badge **"đã có từ"** khi `hasWord` (SF-1 tính theo predicate lower+trim) + link `/admin/vocabulary` (link có thể 404 trong worktree này vì catalog là SF-2 — CHẤP NHẬN, đừng stub). Test render predicate đúng.
4. **Multi-select + grid soạn nghĩa VI**: dùng `useBulkSelection`/`BulkActionBar` (SF-1 — KHÔNG sửa tier-0); mở panel grid: mỗi entry 1 input meaning VI (bắt buộc, max length như validators), đếm "còn thiếu N nghĩa"; **nút promote disabled khi còn ô trống**. Component test validate.
5. **Promote dialog**: chọn book đích (bắt buộc 1 book — select từ danh sách books) → POST `/crawl/promote {entryIds, bookId, meanings}` (chunk >200 + aggregate) → progress + report `{created, duplicates, failed}` → refetch entries (badge "đã có từ" cập nhật). **Assert e2e kết quả qua `GET /api/admin/vocabulary?q=...` + DB row — KHÔNG assert catalog UI** (SF-2 song song, ownership chéo dồn SF-4).
6. **Duplicate skip UX**: report hiển thị đếm duplicates + link hướng dẫn merge ở catalog; batch KHÔNG chết khi toàn bộ duplicate (toàn skip → toast thành công với created=0).
7. **Audio backfill section** (cùng trang, dưới curation hoặc tab nội bộ — tự quyết theo pattern admin, ghi trong notes): chọn scope (select book; test qua fixture book) → **Dry-run** → bảng plan `{matched, pending (chỉ đếm), missing}` → **Apply** (cap 200) → toast report + refetch. e2e scoped fixture: seed book `qa-cms-` với 5 từ thiếu audio + entries `qa-cms-*` có blob giả (deps injectable đã có SF-1 — e2e dùng blob URL thật từ fixture entry); apply 5 → 5 gán; dry-run lại → 0 matched. KHÔNG đụng words ngoài scope.
8. **i18n điền `messages/{vi,en}/vocab-curation.json`** (skeleton SF-1) — KHÔNG đụng `admin.json`, KHÔNG đụng `vocab-catalog.json`. Parity `src/messages.test.ts` xanh.
9. **e2e `admin-vocabulary-curation.spec.ts`**: seed entries `qa-cms-*` (status parsed, cefr, pos, ox3000, blob url) qua helper seed pattern `seedCrawlEntry` (SF-1/lib enrich có sẵn) + words `qa-cms-` book fixture; phủ §6.3–6.4 theo ownership (promote assert qua API/DB); cleanup `e2e/helpers/cleanup-vocab-cms.ts --apply` teardown.
10. **a11y pass**: label grid inputs (mỗi input gắn headword), focus trap dialog promote, contrast badge, keyboard navigable. Checklist evidence + screenshots.
11. story-verify sạch → merge về đích + audit comment (merge sau sf-2 theo merge-order).

## Touch map (SF-3 sở hữu)

```
src/app/(admin)/admin/vocabulary/curation/page.tsx  (mới)
src/components/admin/curation-browser.tsx           (mới — kèm backfill section)
messages/{vi,en}/vocab-curation.json                (điền — skeleton SF-1)
e2e/admin-vocabulary-curation.spec.ts               (mới)
+ component tests tương ứng
```
READ-ONLY: mọi file SF-1 (routes `/crawl/entries`, `/crawl/promote`, `/audio-backfill`, stores, primitives, `vocab-cms-common.json`), `admin-nav.tsx` (SF-2 sở hữu), `vocabulary-catalog.tsx` (SF-2 — KHÔNG stub), crawl dashboard VU-32 (chỉ link out nếu cần), `enrich.ts`/`match.ts` (chỉ import), public pages.

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. Admin mở `/vi/admin/vocabulary/curation`: thấy bảng entries Oxford parsed 50/trang; filter CEFR A2 + OX3000 → tập đúng; tìm headword → đúng.
2. Entry trùng từ đã có → badge "đã có từ"; chọn nó → vẫn promote được nhưng report duplicates đúng, batch không chết (created=0 vẫn toast thành công).
3. Chọn 2 entry → soạn 2 nghĩa VI → chọn book → promote → toast created=2; `GET /api/admin/vocabulary?q=<từ>` trả 2 từ mới đúng fields; bỏ trống 1 nghĩa → nút promote disabled.
4. Backfill: chọn book fixture → dry-run hiện plan matched/pending/missing khớp seed → apply → đúng số từ được gán `audio_url`; chạy dry-run lại → matched=0; words ngoài scope KHÔNG đổi.
5. a11y: grid input có label gắn headword; dialog promote focus-trap; screenshots bằng chứng.

## Boundary (KHÔNG làm — đụng tới = flag, không code)

- KHÔNG sửa crawl runner/dashboard/control VU-32 — curation chỉ ĐỌC lake; KHÔNG UPDATE `crawl_entries.status`.
- KHÔNG sửa file tier-0 SF-1; KHÔNG đụng `admin-nav.tsx` + `vocabulary-catalog.tsx` (SF-2 song song); KHÔNG stub catalog page.
- KHÔNG LLM/tự sinh nghĩa VI — teacher-in-loop grid là thiết kế bắt buộc (meaningVi NOT NULL + no-LLM rule).
- KHÔNG đụng `admin.json`/`vocab-catalog.json`; KHÔNG public surfaces; KHÔNG VU-37 surfaces.
- KHÔNG playwright config mới; fixture `qa-cms-*`; workers 1.
