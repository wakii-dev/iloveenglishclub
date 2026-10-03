# SF-3 Context Pack — Admin UI: crawl dashboard + enrich panel + crawl-on-add

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-04-oxford-vocab-crawl-design.md` (v4 — section [api] + [ui] là CONTRACT shape, dùng đúng). Bracket: `docs/superpowers/mindmaps/oxford-vocab-crawl.wakii`. Epic: VU-32.

## Spec slice (chỉ phần SF-3 chịu trách nhiệm)

1. **Nav + page dashboard** — entry trong `src/components/admin/admin-nav.tsx` + nav
   key trong `messages/vi/admin.json` (admin runtime VI-ONLY — layout load
   messages/vi; en là parity mirror cho `src/messages.test.ts` — key phải CẢ HAI);
   page dashboard (`src/app/(admin)/admin/vocabulary/crawl/page.tsx` hoặc cùng cụm —
   theo cấu trúc admin hiện có) + stats client gọi `GET
   /api/admin/vocabulary/crawl/stats` (shape pin trong spec + context pack SF-2).
2. **Controls dashboard** — nút refresh-sitemap + retry-failed (POST control),
   hiển thị failed samples (slug + last_error), hint lệnh runner
   (`node scripts/oxford-crawl.ts fetch --apply` dạng copy-able), attribution
   "Nguồn: Oxford Learner's Dictionaries". Gate dùng dữ liệu SEEDED/MOCK — KHÔNG
   phụ thuộc crawl thật.
3. **Enrich panel per book** — trong trang quản lý vocabulary theo book hiện có
   (`admin/books/[book]/vocabulary`): nút "Điền dữ liệu thiếu từ Oxford" →
   dryRun preview counts ({candidates, fillableIpa, ...}) → confirm → apply →
   report per-word {word, filled[], skipped[], reason?}. Book >200 từ → loop batch
   continue-and-collect (chunk lỗi ghi report, không dừng loop).
4. **Crawl-on-add dialog** — input từ → `POST .../crawl/word` preview {found,
   from: 'cache'|'live', entry{slug, word, ipaUk, ipaUs, cefr, pos, audioUkBlob,
   audioUsBlob}} → hiện preview (IPA, pos, def từ raw?, audio preview play khi có
   blob) + ô nghĩa VI (bắt buộc — teacher gõ) → approve POST. Miss-path mock tái
   dùng fixture HTML SF-1 (KHÔNG author file trùng).
5. **CEFR badge + source marker** — cột/badge trong bảng words admin
   (`src/components/admin/vocabulary-manager.tsx` + mapping trong admin page) đọc
   cefr/source (SF-2 đã mở rộng store — chỉ đọc, KHÔNG sửa store).
6. **i18n** — keys mới vào `messages/vi/admin.json` + `messages/en/admin.json` CẢ
   HAI (parity test auto-enforce).
7. **e2e** — config riêng `playwright.oxford-crawl.config.ts` (PORT RIÊNG theo
   pattern vocabulary configs); bootstrap ASSERT migration 0004 đã chạy (DB template
   VU-24 ilec_sf2..sf5 KHÔNG có crawl_entries — không tái dùng mù); seed data từ
   seed helper SF-2; upstream mock bằng Playwright route (KHÔNG gọi Oxford thật);
   suites: dashboard stats hiển thị / enrich dryRun→apply flow / crawl-on-add
   cache-hit + miss / fill-empty contract (enrich không đụng field teacher đã nhập).
8. **Error toasts** — map mã lỗi route → message (pattern import report).

## Touch map (files SF-3 tạo/sở hữu)

```
src/components/admin/admin-nav.tsx                    (EDIT — nav entry)
src/app/(admin)/admin/vocabulary/crawl/page.tsx       (TẠO — dashboard)
src/components/admin/crawl-dashboard.tsx              (TẠO — client)
src/components/admin/crawl-enrich-panel.tsx           (TẠO — panel trong book page)
src/components/admin/crawl-add-dialog.tsx             (TẠO — crawl-on-add)
src/components/admin/vocabulary-manager.tsx           (EDIT — badge cefr/source + mount panel)
src/app/(admin)/admin/books/[book]/vocabulary/page.tsx (EDIT — mapping + mount)
messages/vi/admin.json + messages/en/admin.json       (EDIT — keys mới)
e2e/oxford-crawl*.spec.ts + playwright.oxford-crawl.config.ts (TẠO)
package.json                                          (EDIT — test:e2e:oxford script)
src/lib/admin/vocabulary-store.ts                     (READ-ONLY — SF-2 sở hữu)
src/app/api/admin/vocabulary/crawl/**                 (READ-ONLY — SF-2 sở hữu)
```

## ACCEPTANCE (user-visible)

1. Teacher mở dashboard thấy counts theo status + failed samples + nút
   refresh/retry + hint lệnh runner + attribution nguồn (dữ liệu seeded).
2. Bấm enrich theo book: preview counts hiện trước → chạy → report từng từ;
   book lớn loop batch không treo.
3. Crawl-on-add: gõ từ → preview hiện IPA/pos/audio → điền nghĩa VI → duyệt → từ
   vào book; cache-hit hiển thị tức thì.
4. Bảng words admin hiện badge CEFR + marker nguồn cho từ đã enrich.
5. e2e (mock upstream) dashboard/enrich/crawl-on-add + fill-empty xanh; i18n
   parity test xanh.

## Boundary (KHÔNG làm)

- KHÔNG sửa API/store/lib backend (SF-2 sở hữu) — bug → flag không sửa chéo.
- KHÔNG đụng public pages (SF-4: attribution public + full-chain e2e).
- KHÔNG gọi Oxford thật trong e2e/unit (mock + seed); KHÔNG chạy crawl thật trong
  gate (dữ liệu seeded).
- KHÔNG đụng runner CLI (SF-1).
