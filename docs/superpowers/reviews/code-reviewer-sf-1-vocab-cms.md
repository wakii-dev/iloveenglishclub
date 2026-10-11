# Code Review SF-1 (VU-44, story VU-43) — Vocabulary CMS foundation

- Diff: `0f2b530..1bbea82` (52 file, ~6.6k insertions) · Reviewer: code-reviewer độc lập (dispatch 2026-10-11)
- Spec docs đối chiếu: contexts/vocab-cms/sf-1.md + specs/2026-10-10-vocab-cms-design.md v2 (§4 contract, §5 bulk semantics, §7 boundary)
- Deterministic chạy lại bởi reviewer: tsc exit 0 · vitest 1019/1019 (85 files) · eslint 40 file đổi 0/0

> Ghi chú vận hành: agent reviewer bị deny Write (permission profile) — file này do executor
> ghi HỘ theo đúng nội dung verdict trả về (nguồn sự thật: review message 2026-10-11).

## Round 1 — VERDICT: CHANGES_REQUESTED

### P0 (1)
- **[P0] SSRF + không timeout/size-cap khi download audio backfill** (audio-backfill/route.ts:87, audio-backfill.ts:167-176):
  `download` dep là `fetch(url)` trần trên provenance URL `crawl_entries.audio_uk/us_url`
  (crawl parse từ `data-src-mp3`, KHÔNG validate host lúc parse). VU-32 đã có `downloadMp3`
  (oxford/audio.ts) cho cùng data: host allowlist Oxford + AbortSignal.timeout 15s + size cap 2MB +
  re-check host sau redirect — code mới bypass cả 4. OWASP A10; assertAdmin + opt-in + cap 100 chỉ
  mitigate. **Fix: route dùng `downloadMp3` làm dep; lỗi allowlist/cap rơi vào per-word catch →
  `report.errors`.** Kèm test repro: mock fetch global — host 169.254.169.254 phải bị chặn TRƯỚC fetch.

### P1 (0)
Không có — SQL composition, advisory-lock placement, revalidate counts, cap enforcement,
error-code mapping, orphan-WIN, OVERWRITE/COALESCE, duplicate predicate đều đúng spec §4/§5.

### P2 (4)
1. cms-bulk-store.ts:74 — bookIds giữ thứ tự input: 2 request song song ngược thứ tự cùng tập
   book → lock-order deadlock (40P01, self-heal). Fix: dedupe + sort tăng dần trước loop.
2. bulk route + export route — store throw → Next default 500 HTML thay `{ok:false,error:'generic'}`.
   Fix: bọc try/catch JSON nhất quán như promote/backfill/stats/entries.
3. audio-backfill.ts bulk UPDATE thiếu guard `and audio_url is null` — word gán audio tay giữa
   plan và update bị đè. Fix: thêm điều kiện (giữ marker cả lúc ghi).
4. image route multipart parse fail trả `imageMime` (nghĩa lệch). Fix: comment rationale (§4
   không có mã riêng cho body hỏng).

### CHECKLIST-4Q (Round 1) — 3 PASS / 1 FAIL ⇒ CHANGES_REQUESTED
1. Network/external call giữa DB Begin/Commit? **PASS** — tx bulk/promote chỉ lock+select+insert;
   download backfill NGOÀI mọi tx.
2. HTTP client/external call có timeout cụ thể? **FAIL** — fetch trần không AbortSignal (chính là P0).
3. Error best-effort để lại dấu vết đọc được? **PASS** — report.errors[] mọi per-item + console.error;
   path 23503 vẫn revalidate.
4. Partial-failure có compensation? **PASS** — assign per-book continue; delete per-id continue;
   promote single-tx all-or-nothing; backfill per-word try/catch.

### Surgical-scope + boundary
- 52 file = ĐÚNG touch map sf-1.md; KHÔNG đụng enrich/match (chỉ import), crawl runner/dashboard,
  admin.json, vocabulary-manager, public queries, VU-37 surfaces, playwright configs. Blob-write
  chỉ image route + allowDownload. scripts/test-rls.test.ts 4 fix: correct + intent-preserving.
- Deterministic: tsc 0 · vitest 1019 pass · eslint 0/0.

## Round 2 — VERDICT: APPROVED (fix commit c58243b, diff 1bbea82..c58243b)

Reviewer tự chạy lại deterministic độc lập: tsc exit 0 · vitest 1023/1023 (85 files) · eslint 0/0 trên 10 file đổi.

### Xác nhận từng finding round 1 — 5/5 RESOLVED
1. **P0 SSRF — RESOLVED**: route `download: (url) => downloadMp3(url)` — đủ 4 lớp (allowlist
   Oxford + AbortSignal.timeout 15s + cap 2MB + re-check host sau redirect, oxford/audio.ts:26-64);
   lỗi allowlist/cap rơi per-word catch → report.errors. Test repro meta-test đạt chuẩn:
   169.254.169.254 rejects /allowlist/ + fetchSpy KHÔNG gọi; host Oxford → fetch 1 lần.
2. **P2 lock-order — RESOLVED**: dedupe + sort tăng dần; test pin ['7','9'] cho input [9,7,9]
   (đỏ trên code cũ). promote-store lock 1 book/request → không cần đổi, nhất quán.
3. **P2 500-generic — RESOLVED**: bulk + export route wrap generic JSON + 2 test.
4. **P2 marker-guard — RESOLVED**: `and audio_url is null` + word đua tự loại khỏi leg
   allowDownload (re-scan theo marker) — đúng semantics, không đè.
5. **P2 imageMime — RESOLVED (comment rationale)** — chấp nhận.

### Câu hỏi `applied` = attempted khi có guard is null
**Chấp nhận được, không chặn** — spec §4 pin shape plan (không pin report apply); acceptance §6.4
fixture deterministic (applied == actual); hướng lỗi là over-report trong race hiếm trên surface
admin. Nice-to-have sau này: 1 dòng `.returning id` + đếm rows. → GHI vào audit log.

### Regression check
Không có regression mới. 2 note cân nhắc không flag: (a) dedupe đổi semantics `skipped` cho input
trùng book (client bug, spec không pin); (b) reviews file trong diff là OUTBOX artifact.

### CHECKLIST-4Q (round 2, trên c58243b) — 4/4 PASS
1. Network/external call giữa DB Begin/Commit? **PASS** (không đổi).
2. HTTP client có timeout cụ thể? **PASS** (round 1 FAIL → downloadMp3 AbortSignal.timeout(15s) +
   test pin).
3. Error best-effort để lại dấu vết? **PASS** — report.errors[] + console.error (+2 path generic).
4. Partial-failure có compensation? **PASS** — per-book/per-id continue, promote single-tx
   rollback, backfill per-word catch.

### Kết luận
> VERDICT: APPROVED — P0 SSRF đóng đúng bằng downloadMp3 + test repro, 4 P2 resolved,
> deterministic độc lập xanh, CHECKLIST-4Q 4/4 PASS. SF-1 đủ điều kiện merge về đích
> story-vu43-vocab-cms; đưa note `applied`=attempted + finding SSRF round 1 vào input
> security-audit checkpoint Phase 1 (spec §8).
