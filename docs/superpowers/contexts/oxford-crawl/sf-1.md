# SF-1 Context Pack — Crawl-core: enumerate + fetch + parse + store + runner

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-04-oxford-vocab-crawl-design.md` (v4 — CHÂU TRỌNG đọc section Kiến trúc + Data model + Contracts pin). Bracket: `docs/superpowers/mindmaps/oxford-vocab-crawl.wakii`. Linear SF: (điền khi launch). Epic: VU-32.

## Spec slice (chỉ phần SF-1 chịu trách nhiệm)

1. **Migration 0004** — bảng `crawl_entries`: id identity, slug UNIQUE, word NULLABLE
   (null khi pending), source, raw jsonb, ipa_uk/ipa_us, audio_uk_url/audio_us_url
   (provenance), audio_uk_blob/audio_us_blob, pos, cefr, ox3000, status
   (pending|parsed|failed), attempts, last_error, fetched_at, created_at.
   Index: status + word. Cộng 2 cột additive: `words.cefr text`, `words.source text`.
   NOTE migration numbering: số kế tiếp sau `0003_quiz_hub_scope`; nếu VU-24 đã lấy
   0004 → thủ tục renumber: `git mv` + sửa `drizzle/meta/_journal.json` (idx/tag/when)
   + REGENERATE snapshot bằng `drizzle-kit generate` trên schema.ts đã merge (CẤM sửa
   snapshot tay) + verify `drizzle-kit migrate` trên DB sạch.
2. **Blob-only write helper** (P0) — trong `src/lib/storage-server.ts` (hoặc file kế
   bên SF-1 sở hữu): helper ghi Blob THROW khi thiếu `BLOB_READ_WRITE_TOKEN`. Bare
   `putAudio` có fallback ghi `public/` → local path leak vào prod = CẤM cho Oxford
   audio. Token nguồn: `.env.local` qua `vercel env pull` (convention
   `scripts/audio-sync.ts:28`); worktree không token → evidence = unit tests + ghi
   nhận manual run, KHÔNG stall.
3. **fetch lib (pure)** — `fetchEntry(slug)` → HTML: UA `ILEC-VocabBot/1.0
   (educational; +site-url)` (KHÔNG UA mang thương hiệu AI — robots.txt Disallow
   nhóm đó toàn site), redirect follow + LƯU SLUG CUỐI (tree_1→tree = 1 row 'tree';
   slug sitemap lệch đích → status parsed + last_error='redirect:<final>', không dup
   row), 404→null, timeout 15s, size cap 2MB, host allowlist
   (oxfordlearnersdictionaries.com + media host).
4. **parse lib (pure)** — `parseEntry(html)` → OxfordEntry: headword (BẮT BUỘC có —
   thiếu = parse fail), ipa{uk,us} (`span.phon`), audio uk/us mp3 (`data-src-mp3`),
   pos (`span.pos`), senses[] {def `span.def`, examples `span.x`}, cefr (A1–C2 thô),
   ox3000 (`ox3000="y"` attr trên h1.headword), idioms/phrasals giữ trong raw. Field
   entry không có → null (US-only entry = không UK audio là BÌNH THƯỜNG, không fail).
   Probe facts 2026-10-04: entry ~98KB, redirect tree_1→tree, selectors trên đã grep
   thấy thật trong HTML.
5. **sitemap lib** — fetch `/sitemap.xml` index → `/sitemap/english/sitemap{1,2,3}.xml`
   (≈63.949 slugs, chỉ nhận `/definition/english/*`), lọc theo robots Disallow
   (academic/collocations/...), upsert crawl_entries status=pending (slug mới thêm,
   slug cũ GIỮ nguyên trạng thái, slug mất KHÔNG xoá).
6. **robots runtime-guard** — trước mỗi run fetch `/robots.txt`, parse `User-agent: *`
   group; nếu `/definition/english/` xuất hiện Disallow → runner từ chối chạy + exit
   rõ ràng.
7. **rate limiter + retry** — token-bucket mặc định 2 req/s (`--rate N`), retry
   backoff cho 429/5xx; single-runner assumption (không lock/claim — document).
8. **store** — upsert batch 100, claim pending batch (single runner), mark
   parsed|failed (+attempts, last_error), stats counts theo status. `retry-failed`
   semantics: reset failed→pending với attempts < 5; giữ last_error.
9. **audio leg** — phase `audio`: mp3 uk+us → Blob `audio/oxford/{slug}.{uk|us}.mp3`
   QUA HELPER blob-only (addRandomSuffix:false → idempotent), resumable
   (`--skip-audio` cho text-only), chỉ tải từ media host allowlist.
10. **audio-sync exclusion** — `scripts/audio-sync.ts` planSync EXCLUDE prefix
    `audio/oxford/` (dictionary archive KHÔNG mirror git) + unit test. Phải xong
    TRƯỚC khi audio đầu tiên được tải.
11. **CLI runner** `scripts/oxford-crawl.ts` — phases: enumerate | fetch | audio;
    flags `--rate N --limit N --slug x --skip-audio --apply`; checkpoint mỗi 50
    entries + progress log; kill → resume không dup; dry-run MẶC ĐỊNH, `--apply`
    mới ghi. Node24 chạy .ts native (không cần build).
12. **unit tests** — mọi lib pure test với fetch impl INJECT (không gọi mạng trong
    test); fixtures = HTML excerpts ĐÃ TRIM (multi-POS, idiom, _2 homonym, US-only,
    404, redirect) — đặt chỗ cho e2e SF-3 tái dùng (KHÔNG author file trùng).
13. **docs README** — section crawl: phases, flags, token setup, politeness note.

## Touch map (files SF-1 tạo/sở hữu)

```
src/db/schema.ts                              (EDIT — thêm crawl_entries + 2 cột words)
drizzle/0004_*.sql + drizzle/meta/*           (TẠO — qua drizzle-kit generate)
src/lib/oxford/fetch.ts                       (TẠO)
src/lib/oxford/parse.ts                       (TẠO)
src/lib/oxford/sitemap.ts                     (TẠO)
src/lib/oxford/rate-limit.ts                  (TẠO)
src/lib/oxford/robots.ts                      (TẠO)
src/lib/oxford/store.ts                       (TẠO)
src/lib/oxford/*.test.ts + fixtures           (TẠO)
scripts/oxford-crawl.ts                       (TẠO)
src/lib/storage-server.ts                     (EDIT — thêm helper blob-only; putAudio
                                               hiện có READ-ONLY cho SF-1)
scripts/audio-sync.ts                         (EDIT — exclusion audio/oxford/)
package.json                                  (EDIT — script entry nếu cần)
README/docs                                   (EDIT — section crawl)
```

## ACCEPTANCE (user-visible)

1. `node scripts/oxford-crawl.ts enumerate --apply` → đúng số slugs sitemap trả về
   (≈63.949 tại 2026-10-04) pending trong DB; chạy lại → không dup.
2. `fetch --limit 50 --apply` → 50 entries parsed|failed; parsed có headword + raw;
   field đúng theo entry (US-only → không UK audio; không level → cefr null);
   lỗi → failed + attempts tăng.
3. `audio --limit 20 --apply` → tối đa 40 mp3 (đúng số mp3 các entry có) trên Blob
   `audio/oxford/`; thiếu token → THROW rõ (không silent local path).
4. `audio-sync` KHÔNG kéo audio/oxford/ vào git.
5. Kill runner giữa chừng → chạy lại tiếp đúng chỗ, không dup, không mất state.

## Boundary (KHÔNG làm)

- KHÔNG làm enrich/API/UI — SF-2/SF-3. KHÔNG đụng words ngoài 2 cột additive
  (cefr/source là cột của migration, nhưng fill là SF-2).
- KHÔNG gọi Oxford thật trong unit test (inject fetch); thật chỉ qua CLI manual.
- KHÔNG sửa `putAudio` hiện có (chỉ THÊM helper); KHÔNG đụng upload route import.
- KHÔNG tạo bảng phụ (crawl_runs...) — stats derived.
- KHÔNG dùng UA mang thương hiệu AI; KHÔNG đụng path robots Disallow.
