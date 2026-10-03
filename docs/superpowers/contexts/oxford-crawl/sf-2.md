# SF-2 Context Pack — Enrichment fill-empty + admin API

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-04-oxford-vocab-crawl-design.md` (v4 — section Kiến trúc [match]/[enrich]/[api] + Data model là CONTRACT, không tự ý đổi). Bracket: `docs/superpowers/mindmaps/oxford-vocab-crawl.wakii`. Epic: VU-32.

## Spec slice (chỉ phần SF-2 chịu trách nhiệm)

1. **Match rule (contract — SF-3 phụ thuộc hành vi, SF-2 sở hữu impl)** —
   `normalizeMatch(x)` = trim + lowercase + strip suffix `_\d+$` + đổi '-' thành
   space + collapse whitespace. Đối sánh `words.word` (qua normalizeMatch) với CẢ
   HAI `crawl_entries.word` (headword trim+lowercase, không strip) và
   `crawl_entries.slug` (qua normalizeMatch). Winner: headword exact > slug match;
   nhiều entry khớp (homograph bank_1/bank_2): entry có cefr non-null trước, rồi id
   nhỏ nhất — deterministic. Fill từ ĐÚNG 1 entry thắng. Index `crawl_entries_word_idx`
   (0004 của SF-1) phục vụ query này.
2. **Fill-empty builder** — chỉ điền field đang NULL (giá trị teacher có sẵn — kể cả
   chuỗi rỗng sau trim — TÔN TRỌNG, không đụng). ipa: uk→fallback us→skip; example:
   example đầu sense 1→skip; cefr: thô→skip nếu null; audio: audio_uk_blob→
   audio_us_blob→skip (BLOB-ONLY — KHÔNG hotlink; thiếu blob → reason 'noAudioBlob').
   `words.source='oxford-ld'` CHỈ khi ≥1 field được fill. Emptiness đánh giá lúc
   APPLY (re-read DB). Sau apply gọi `revalidateContent()` (pattern
   `importVocabulary`).
3. **Mở rộng store (SF-2 sở hữu — SF-3 chỉ đọc)** — `vocabulary-store.ts`:
   `listVocabulary` select thêm cefr/source; `WordInput` (src/lib/admin/vocabulary.ts)
   thêm cefr/source optional; create/approve path ghi 2 trường này. CHÚ Ý 6 importer
   hiện có của vocabulary.ts — additive, không break.
4. **Routes (path + shape PIN — dùng đúng)** — tất cả `assertAdmin`, runtime nodejs,
   pattern `/api/admin/vocabulary/route.ts`:
   - `POST /api/admin/vocabulary/crawl/enrich` {bookId | wordIds[], dryRun?} —
     dryRun:true → {candidates, fillableIpa, fillableExample, fillableCefr,
     fillableAudio}; apply → report per-word {word, filled: ('ipa'|'example'|'cefr'|
     'audio')[], skipped[], reason?}. Cap 200 từ/request.
   - `GET /api/admin/vocabulary/crawl/stats` → {counts:{pending,parsed,failed,
     failedMaxAttempts}, samples: failed[] (slug+last_error, ≤20), lastRun:
     max(fetched_at)} — last-run DERIVED, CẤM tạo bảng crawl_runs.
   - `POST /api/admin/vocabulary/crawl/control` {action:'refresh-sitemap'|
     'refresh-sitemap' diff delta>2000 → {deltaTooLarge:true, hint}; 'retry-failed':
     reset failed→pending attempts<5}.
   - `POST /api/admin/vocabulary/crawl/word` {word, bookId?} → {found, from:
     'cache'|'live', entry: {slug, word, ipaUk, ipaUs, cefr, pos, audioUkBlob,
     audioUsBlob} | null} — cache-first, miss → live fetch+parse (KHÔNG ghi DB).
   - `POST /api/admin/vocabulary/crawl/word/approve` {entry (payload y như preview),
     meaning_vi (bắt buộc — teacher gõ), bookId} → tạo word + link book + cefr +
     source='oxford-ld'. Word đã tồn tại → reuse + attach book (idempotent như
     createVocabularyWord) + vẫn set cefr/source. AUDIO: ngoại lệ 1 mp3 UK
     (fallback US) tải về Blob QUA HELPER BLOB-ONLY của SF-1 trong request; throw →
     word VẪN tạo KHÔNG audio (không hotlink, không local path).
5. **Seed helper** — export crawl_entries seed helper (unit test dùng; SF-3 e2e tái
   dùng — serial dep nên free).
6. **Audio-sync verify** — test exclusion của SF-1 vẫn xanh (KHÔNG viết test mới).
7. **Guards là ASSERTIONS** — SSRF (2-host allowlist qua fetchEntry SF-1) +
   assertAdmin kiểm trong unit test routes; không task build riêng.
8. ** Không LLM, không API key** — meaning_vi KHÔNG BAO GIỜ do crawl sinh.

## Touch map (files SF-2 tạo/sở hữu)

```
src/lib/oxford/match.ts                       (TẠO — match rule)
src/lib/oxford/enrich.ts                      (TẠO — fill builder + seed helper export)
src/lib/oxford/*.test.ts                      (TẠO)
src/app/api/admin/vocabulary/crawl/enrich/route.ts     (TẠO)
src/app/api/admin/vocabulary/crawl/stats/route.ts      (TẠO)
src/app/api/admin/vocabulary/crawl/control/route.ts    (TẠO)
src/app/api/admin/vocabulary/crawl/word/route.ts       (TẠO)
src/app/api/admin/vocabulary/crawl/word/approve/route.ts (TẠO)
src/app/api/admin/vocabulary/crawl/**/*.test.ts        (TẠO)
src/lib/admin/vocabulary-store.ts             (EDIT — listVocabulary + create path)
src/lib/admin/vocabulary.ts                   (EDIT — WordInput optional cefr/source)
src/lib/oxford/store.ts                       (READ-ONLY — SF-1 sở hữu)
scripts/oxford-crawl.ts                       (READ-ONLY — demo chạy qua nó)
```

## ACCEPTANCE (user-visible)

1. Chạy `audio --limit 1` (runner SF-1) cho có blob thật → `POST .../crawl/enrich`
   dryRun hiện counts đúng → apply → words thiếu IPA/example/audio/cefr được điền
   đúng entry thắng; audio URL blob phát được.
2. Words ĐÃ CÓ giá trị (teacher nhập) không bị đụng — test contract fill-empty
   chứng minh.
3. `words.source` chỉ set khi có fill; revalidate chạy (public thấy ngay).
4. crawl-on-add: preview cache-hit không gọi Oxford (from='cache'); approve tạo word
   + link book + nghĩa VI teacher gõ là bắt buộc; audio tải fail → word vẫn tạo
   không audio.
5. Mọi route: thiếu admin → 401/403; shape trả về đúng pin; cap 200/2000/5 đúng.

## Boundary (KHÔNG làm)

- KHÔNG làm UI — SF-3 (badge/panel chỉ đọc store SF-2 mở rộng).
- KHÔNG đụng crawl-core libs (fetch/parse/sitemap/robots — SF-1 sở hữu, READ-ONLY);
  bug SF-1 → flag, không sửa chéo.
- KHÔNG đụng public pages (SF-4 attribution); KHÔNG đụng e2e configs (SF-3).
- KHÔNG overwrite field teacher; KHÔNG hotlink Oxford vào words.audio_url.
