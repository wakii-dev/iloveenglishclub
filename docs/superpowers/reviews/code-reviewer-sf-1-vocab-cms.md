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

## Round 2 — verdict post-fix (xem section dưới sau re-review)
