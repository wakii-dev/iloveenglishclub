# SF-4 Context Pack — Stats dashboard + convergence QA (tier 2) — Phase 2/2

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-10-vocab-cms-design.md` (v2 — authority). Bracket plan: `docs/superpowers/plans/2026-10-10-vu43-bracket-plan.md`. Story: VU-43, dest `story-vu43-vocab-cms`, Phase 2/2 — **convergence SF**. **Tiền đề:** SF-1+SF-2+SF-3 đã merge về đích (Phase 1 checkpoint xong) — FULL CMS có trong worktree này.

## Spec slice (SF-4 chịu trách nhiệm)

1. **Page shell `/admin/vocabulary/stats`**: server component + `VocabularySubNav` (SF-1) active Stats — sau task này link sub-nav hết 404 (phase-1 dead-link được gỡ). i18n từ `vocab-stats.json` (skeleton SF-1).
2. **StatsCards** 5 thẻ wire `GET /api/admin/vocabulary/stats` (SF-1): tổng words, audio coverage %, image coverage %, orphan count, enrich coverage % (`source='oxford-ld'`); format % 1 chữ số thập phân, 0 → "0%"; loading/error state.
3. **CEFR histogram** horizontal bars thuần CSS (KHÔNG lib chart — nếu cần hướng dẫn đọc skill dataviz trước khi vẽ): buckets A1..C2 + `untagged` + `other` (shape §4), label + số, **UI assertion tổng bars = tổng words**.
4. **Bảng per-book**: tên book, số words, audio coverage per book — sort theo số words desc.
5. **Panel crawl/enrich**: reuse data `crawl` từ `/stats` (SF-1 đã gộp crawlStatsDb) — parsed/pending/failed + link sang crawl dashboard VU-32 (`/admin/vocabulary/crawl`) — KHÔNG làm lại control.
6. **i18n điền `messages/{vi,en}/vocab-stats.json`** (skeleton SF-1) — KHÔNG đụng `admin.json`/`vocab-catalog.json`/`vocab-curation.json`. Parity xanh.
7. **Route contract test stats khớp SQL trực tiếp** (§6.5): trên template DB — seed/mutable data, gọi route (hoặc store) so từng số với SQL `count(*)` viết tay trên cùng DB; histogram bucket test kể cả row bẩn `'b2 '`. Evidence số liệu.
8. **Convergence sweep trên merged base — FULL admin config + cross-SF assertions**: chạy toàn bộ `playwright.admin.config.ts` (admin e2e cũ + 3 spec mới `admin-vocabulary-{nav,catalog,curation}.spec.ts`) + 9 vocab configs + hub/lookup/quiz suites; **assertions chéo SF deferred nhận ở đây:** (a) §6.3 từ promoted (fixture SF-3 seed lại hoặc dùng data rehearsal) XUẤT HIỆN trong catalog UI `/admin/vocabulary`; (b) §6.7 "Từ vựng" active trên `/admin/vocabulary/curation`. KHÔNG đụng surfaces VU-37 (learn/review session UI, hub dashboard — nếu suites VU-37 chưa merge thì suite của base là chuẩn).
9. **Rehearsal dữ liệu thật trên template DB**: bulk assign 500 từ, export 5k, backfill scoped 200 (dry-run), promote 20 — đo thời gian từng op (không timeout — bài học Neon LIMIT-lớn), evidence số liệu; **chạy `e2e/helpers/cleanup-vocab-cms.ts --apply` sau rehearsal** để template reusable.
10. **a11y + mobile 375 screenshots + security-audit checkpoint Phase 2**: OWASP surface của routes mới (authz per method, input caps, upload mime/size) + repo-hygiene (secrets/.env trong diff, exec-bit mới, permissions, lockfile-deps) — audit sạch P0/P1 mới được checkpoint; story-verify cuối + evidence pack (screenshots desktop/375, kết quả suites, rehearsal timings) + merge/audit comment.

## Touch map (SF-4 sở hữu)

```
src/app/(admin)/admin/vocabulary/stats/page.tsx   (mới)
src/components/admin/vocab-stats-cards.tsx        (mới — hoặc gộp 1 file stats)
messages/{vi,en}/vocab-stats.json                 (điền — skeleton SF-1)
e2e/ (assertion bổ sung vào spec có sẵn hoặc admin-vocabulary-convergence helper)
+ component tests tương ứng
```
READ-ONLY: mọi file SF-1/2/3 (stats route/store, catalog, curation, primitives) — thiếu gì flag; crawl dashboard VU-32 (chỉ link); public pages (chỉ assert); surfaces VU-37 (CẤM đụng).

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. Admin mở `/vi/admin/vocabulary/stats`: 5 thẻ số đúng (so khớp SQL trực tiếp trên cùng DB); histogram bars tổng = tổng words; per-book table đúng.
2. Link Stats trên sub-nav hết 404 từ cả 3 trang catalog/curation.
3. Convergence: toàn bộ admin config (cũ + 3 spec mới) xanh trên merged base; từ promoted fixture THẤY trong catalog UI; nav "Từ vựng" active trên /curation; 9 vocab configs + hub/lookup/quiz xanh.
4. Rehearsal: bulk 500 / export 5k / backfill 200 / promote 20 hoàn tất không timeout, có timings; template sạch sau cleanup.
5. a11y + 375 screenshots đủ; security-audit sạch P0/P1; story-verify APPROVED (evidence ^tdd + hash).

## Boundary (KHÔNG làm — đụng tới = flag, không code)

- KHÔNG sửa stores/routes SF-1 hay UI SF-2/SF-3 (bug tìm thấy → report coordinator, fix qua task riêng nếu cần).
- KHÔNG đụng crawl control VU-32; KHÔNG public queries; KHÔNG VU-37 surfaces (learn/review session, hub, `vocab_activity`).
- KHÔNG thêm chart lib; histogram thuần CSS.
- KHÔNG playwright config mới; KHÔNG merge PR (human gate); phase-2 checkpoint = mốc cuối story, evidence pack đầy đủ trước khi nói STORY done.
