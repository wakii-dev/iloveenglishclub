# Code Review SF-2 (VU-45, story VU-43) — Catalog UI toàn cục /admin/vocabulary

- Diff tổng: `8e082ae..7ff26e0` (5 commits: e20576f feat · c187143 e2e · 5789f8f lint · c4330e4 fix r1 · 7ff26e0 fix r2) · Reviewer: code-reviewer độc lập (dispatch 2026-10-11, 3 vòng)
- Spec docs đối chiếu: contexts/vocab-cms/sf-2.md + specs/2026-10-10-vocab-cms-design.md v2 (§2.1, §4, §5, §6, §7, §8)
- Ghi chú vận hành: reviewer bị deny Write — file này do executor ghi HỘ theo verdict trả về (nguồn sự thật: review messages 2026-10-11, 3 vòng)

## Deterministic chạy lại bởi reviewer (tự chạy, không tin lời)
- Round 1 (8e082ae..5789f8f): tsc exit 0 · vitest 1049 passed | 8 skipped · eslint exit 0
- Round 2 (5789f8f..c4330e4): tsc exit 0 · vitest 1052 passed | 8 skipped · eslint exit 0
- Round 3 (c4330e4..7ff26e0): tsc exit 0 · vitest 1052 passed | 8 skipped · eslint exit 0

## Round 1 — VERDICT: CHANGES_REQUESTED

### P1 (1)
- **[P1] Upload ảnh → Lưu thất bại trên FS-driver (local dev không BLOB token)** (vocabulary-catalog.tsx:626): route /image driver FS trả url TƯƠNG ĐỐI (`/images/words/…` — storage-server.ts:44) nhưng PATCH validateImageUrlInput chỉ nhận http(s) tuyệt đối → 400 invalidImageUrl, từ KHÔNG lưu được sau upload. e2e t4 xanh do env có blob token. Audio tránh bẫy nhờ resolveStoredAudioUrl — image không có resolver. **Fix: absolutize trước khi set state (`new URL(body.url, window.location.origin)`).**

### P2 (3)
1. Dialog THÊM từ thiếu field image optional (spec §2.1 liệt kê) — POST nhận đủ nhưng UI không expose lúc tạo.
2. Race selection ↔ delete plan: checkbox không disable trong lúc dry-run → plan đếm set CŨ, apply xoá set MỚI.
3. Lỗi giữa các chunk mất báo cáo partial-success (throw ở chunk k → chunk đã áp không aggregate/toast). Note cross-SF: spec §4 "client gửi kèm progressAffected" không khả thi — bulk route SF-1 không nhận param (drift SF-1↔spec, apply đếm lại server-side).

### CHECKLIST-4Q (Round 1) — 4 PASS / 0 FAIL (gate này không chặn; chặn ở P1)
1. Network-in-tx PASS · 2. HTTP timeout PASS (list có AbortController; bulk/export/upload user-initiated + busy-guard) · 3. Best-effort traces PASS · 4. Partial-fail PASS (idempotency 3 action)

## Round 2 — VERDICT: CHANGES_REQUESTED

4 finding round 1: P1 absolutize ĐÓNG (helper pure + wire 2 nơi + test meta 3 case + repro e2e FS-driver `env -u BLOB_READ_WRITE_TOKEN` t4 PASS) · P2 image-optional ĐÓNG (add dialog upload + POST image_url khi set + reset) · P2 delete-race ĐÓNG (snapshot setDeleteIds cùng plan) · P2 partial-success ĐÓNG (3 runner restructure catch + aggregate applied).

### P1 (1) — REGRESSION round-2
- **[P1] 3 bulk runner mất setBulkBusy(false) trên nhánh lỗi** (:469/:519/:597): restructure xoá `finally` — chunk fail → bulkBusy kẹt true → MỌI nút submit dialog + bulk bar chết tới reload; compensation re-run không chạy được (chính kịch bản partial-success nhắm tới). **Fix: setBulkBusy(false) trước return ở 3 catch (hoặc try/finally).**

### CHECKLIST-4Q (Round 2) — 3 PASS / 1 FAIL ⇒ CHANGES_REQUESTED
Q4 FAIL: report CÓ nhưng compensation bị khóa bởi busy kẹt — sửa P1 xong tự PASS.

## Round 3 — VERDICT: APPROVED

- Round-2 P1 ĐÓNG: setBulkBusy(false) đủ 3 nhánh lỗi (:469/:521/:600) — position-verify trên 7ff26e0; full state-machine audit: 5 nơi setBulkBusy(true) đều có reset đạt được (addWord/saveEdit giữ finally round 1); guard sớm return TRƯỚC set true — đúng.
- Q4 mở lại PASS: nhánh lỗi nhả busy → selection.clear() + refetch → re-run ngay (assign skip, tag OVERWRITE idempotent, delete re-dry-run).
- Ledger tổng 3 vòng: P1 absolutize (r1) + P2 image-optional (r1) + P2 delete-race (r1) + P2 partial-success (r1) + P1 busy-regression (r2) — TẤT CẢ ĐÓNG, không finding mở.

### CHECKLIST-4Q (Round 3) — 4 PASS / 0 FAIL ⇒ APPROVED
1. Network/external call giữa DB Begin/Commit? **PASS** — diff 0 dòng DB/transaction (client UI; mutation qua route SF-1 đã review riêng).
2. HTTP client/external call có timeout cụ thể? **PASS** — list fetch AbortController (unmount/đổi params); bulk/export/upload user-initiated + busy-guard nhả đúng cả nhánh lỗi; external-call server-side timeout pin ở SF-1 (downloadMp3 15s).
3. Error best-effort để lại dấu vết đọc được? **PASS** — partial áp-dụng console.error kèm report object + error (3 nhánh); toast per-item count; loadError role=alert; export fail toast kèm code.
4. Partial-failure có compensation/report rõ? **PASS** — aggregate applied chunks + success toast + error toast; re-run khả thi ngay sau lỗi nhờ idempotency 3 action.

## Surgical-scope check (3 vòng cộng gộp)
- Chỉ file trong touch map SF-2 (10 file): page.tsx(+test), vocabulary-catalog.tsx(+test), admin-nav.tsx(+test), messages/{vi,en}/vocab-catalog.json, 2 e2e specs → tier-0/SF-1/SF-3 sạch toàn bộ, zero drive-by, không playwright config mới, fixture qa-cms- + cleanup helper trong afterAll ✓.

## Coverage pass
10/10 file có verdict (chi tiết từng file trong review messages 2026-10-11); NEEDS VERIFICATION cuối: trống.

VERDICT: APPROVED — CHECKLIST-4Q 4/4 (round 3 trên 7ff26e0); deterministic tsc 0 · vitest 1052|8 · eslint 0.
