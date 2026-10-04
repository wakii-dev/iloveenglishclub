# Spec: Oxford Vocabulary Crawl — crawl TOÀN BỘ từ điển về hệ thống ILEC

**Date:** 2026-10-04 · **Status:** v4 FINAL (spec-critic PASS; plan-critic PASS sau sửa P0×1 + P1×8)
**Epic:** [VU-32](https://linear.app/vu/issue/VU-32) · **Dest branch:** `story-vu32-oxford-vocab-crawl`
**Probe facts đã verify thật (2026-10-04):** sitemap `/sitemap/english/sitemap{1,2,3}.xml`
= **63.949 URL** entry; robots.txt `User-agent: *` KHÔNG cấm `/definition/english/`
(chỉ cấm academic/collocations/info/search/autocomplete/pronunciation); Oxford
publish sitemap cho crawler; default UA → 403, browser UA → 200 (entry ~98KB HTML,
đầy đủ IPA uk/us + mp3 uk/us + pos + def + examples + CEFR/ox3000); browse A-Z
JS-rendered → KHÔNG dùng (sitemap là nguồn chuẩn).

## IDEA-BRIEF (8 chiều)

- **Task** — crawl TOÀN BỘ data từ vựng của oxfordlearnersdictionaries.com về hệ
  thống: enumerate 63.949 entries từ sitemap → fetch + parse từng entry (IPA uk/us,
  POS, mọi senses + definitions + examples, CEFR, ox3000) → lưu DB; tải audio phát
  âm uk/us về Blob. Crawl chạy nền dạng job resumable (script runner), không cần
  người trông.
- **Output** — crawl-core lib + resumable CLI runner (`scripts/oxford-crawl.ts`) +
  schema (crawl_entries + queue state) + admin API + admin UI (crawl dashboard,
  enrich-fill-empty per book, crawl-on-add) + docs runbook.
- **Users** — admin/teacher: theo dõi crawl dashboard, enrich book, thêm từ mới;
  learners: flashcards/quiz/tra từ/vocabulary page có IPA + audio + ví dụ đầy đủ.
- **Constraints (MUST / MUST-NOT)**
  - MUST obey robots.txt `User-agent: *` tại runtime (guard tự check trước mỗi
    run — Disallow `/definition/english/` xuất hiện → runner từ chối chạy); UA
    riêng định danh `ILEC-VocabBot/1.0 (educational; +site-url)` — KHÔNG dùng UA
    mang thương hiệu AI (nhóm anthropic-ai/CCBot/GPTBot bị Disallow toàn site);
    rate mặc định 2 req/s (cấu hình được), retry backoff 429/5xx.
  - MUST NOT: đụng `/definition/academic|collocations/` (bị Disallow); break
    import CSV/JSON; break e2e contract 404 `not_in_vocabulary` của tra từ; đụng
    `words.meaning_vi` (teacher-owned — xem quyết định 1).
  - Chỉ tải audio từ host media oxfordlearnersdictionaries.com (allowlist cứng).
    `words.audio_url` KHÔNG BAO GIỜ chứa hotlink Oxford — chỉ URL Blob
    (`https://…`) hoặc path local dev.
  - Migration additive; số tiếp theo sau `0003_quiz_hub_scope` (VU-24 song song).
    **Thủ tục renumber khi collision:** `git mv` file migration + sửa
    `drizzle/meta/_journal.json` (idx/tag/when) + REGENERATE snapshot bằng
    `drizzle-kit generate` chạy trên schema.ts đã merge (CẤM sửa snapshot tay) +
    verify `drizzle-kit migrate` trên DB sạch.
- **Input** — sitemap XML chính chủ (63.949 slugs); HTML entry pages; mp3 URLs
  trong entry HTML.
- **Context** — vocabulary module vừa merge (words/book_words/SRS/quiz/lookup);
  VU-24 QA hardening có thể chạy lại song song (collision: schema.ts, migration
  number, playwright configs — SF dùng port riêng theo pattern hiện có).
- **Success criteria** — (a) runner chạy thật: enumerate đủ slugs sitemap trả về,
  fetch resumable (kill giữa chừng → chạy lại không dup), parsed entries đầy đủ
  trường; (b) admin enrich 1 book → words thiếu IPA/audio/example được điền từ
  crawl_entries, audio phát được trên public; (c) crawl-on-add thêm từ mới (audio
  theo điều kiện P0-3 bên dưới); (d) full suite xanh; (e) docs runbook đủ để
  operator chạy crawl đêm không cần dev.
- **Out-of-scope** — học thuật hoá (semantic search, word embeddings); dịch nghĩa VI
  tự động (user cấm LLM); public dictionary search UI; crawl các dictionary khác
  (academic/collocations bị Disallow — không đụng); UI xem chi tiết entry Oxford.

## Quyết định đã duyệt (user, 2026-10-04)

| # | Vấn đề | Quyết định |
|---|---|---|
| 1 | meaning_vi | **KHÔNG dùng LLM** (user sửa). `meaning_vi` = teacher-owned, crawl KHÔNG BAO GIỜ sinh/đụng nghĩa VI. Từ mới thêm qua crawl: teacher điền nghĩa trên form preview (field bắt buộc giữ nguyên) |
| 2 | Kích hoạt | **Crawl TOÀN BỘ** (user sửa): runner script resumable crawl cả ~63.949 entries nền; admin dashboard theo dõi + enrich per book; KHÔNG còn mô hình batch-chọn-tay làm chính |
| 3 | Tra từ fallback | **B — không làm**; tra từ giữ nguyên bộ từ của book (follow-up) |
| 4 | Audio | **Tải về Vercel Blob** (user sửa từ hotlink): phase riêng của runner, uk+us, prefix riêng `audio/oxford/` |
| 5 | Crawl-on-add | **Có** — cache-first (crawl_entries trúng → không gọi Oxford), miss → live fetch |

Guardrails mặc định (không hỏi lại): rate 2 r/s + backoff; cache-first mọi lookup;
attribution "Nguồn: Oxford Learner's Dictionaries" hiển thị ở admin (dashboard +
enrich report) VÀ public vocabulary page khi `words.source = 'oxford-ld'`
(SF-4 sở hữu phần public); robots runtime-guard; audio-sync EXCLUDE prefix
`audio/oxford/` (dictionary archive không mirror git — SF-1 làm trước khi audio
đầu tiên được tải).

## Kiến trúc

```
[enum]  sitemap index → /sitemap/english/sitemap{1..3}.xml → slugs
        (chỉ nhận /definition/english/*, lọc Disallow) → upsert crawl_entries
[fetch] crawl-core pure lib: fetchEntry(slug) → HTML (UA riêng, redirect follow,
        timeout 15s, size cap 2MB, host allowlist)
        + token-bucket 2 r/s + retry/backoff
        Redirect: LƯU slug CUỐI (tree_1 → tree = 1 row duy nhất dưới 'tree').
        Nếu redirect đích ≠ slug trong sitemap → slug sitemap bị đánh dấu
        parsed-thay-the (status parsed, last_error='redirect:<final>') — KHÔNG
        tạo row dup.
[parse] parseEntry(html) → OxfordEntry: headword, ipa{uk,us}, audio{uk,us} mp3,
        pos, senses[] {def, examples[]}, cefr, ox3000, idioms/phrasals (raw).
        Parse thành công = headword CÓ MẶT (bắt buộc); field khác null khi entry
        không có (US-only → không UK audio; không level → cefr null). Parse không
        thấy headword = failed.
[store] crawl_entries upsert (batch 100) — raw jsonb + trường derive; status
        machine 3 TRẠNG THÁI bền: pending → parsed | failed
        (fetch+parse nguyên tử — KHÔNG có trạng thái 'fetched' riêng).
        - parsed: headword có mặt, raw lưu, field thiếu = null (KHÔNG phải failed).
        - failed: fetch lỗi (network/404/429-after-retry) HOẶC 200 nhưng không
          tìm thấy headword (selector miss). attempts +1, last_error lưu.
        - retry-failed: reset failed→pending với attempts < 5 (cap; quá cap ở lại
          failed — dashboard hiển thị riêng); last_error GIỮ để debug.
        Single-runner assumption: KHÔNG cơ chế claim/lock — chỉ 1 runner chạy
        trong 1 thời điểm (documented; violating = tự chịu).
[audio] phase riêng: mp3 uk+us → Blob `audio/oxford/{slug}.{uk|us}.mp3`
        (putAudio addRandomSuffix:false → re-run idempotent; resumable,
        --skip-audio cho text-only).
        BLOB-ONLY WRITE HELPER (P0 plan-critic): helper ghi Blob trong
        storage-server.ts THROW khi thiếu BLOB_READ_WRITE_TOKEN — bare
        putAudio có fallback ghi public/ (silent local path leak vào prod,
        CẤM). Cả runner audio phase SF-1 lẫn approve SF-2 dùng helper này;
        approve catch throw → word vẫn tạo KHÔNG audio (không bao giờ local
        path). Token nguồn: `.env.local` qua `vercel env pull` (convention
        scripts/audio-sync.ts); worktree không có token → evidence = unit
        tests + ghi nhận manual run, KHÔNG stall.
        audio-sync planSync EXCLUDE audio/oxford/ (SF-1 làm — task duy nhất;
        SF-2 chỉ verify test SF-1 vẫn xanh).
[runner] scripts/oxford-crawl.ts — node24-native TS, phases:
        enumerate | fetch | audio, --rate N --limit N --slug x --skip-audio,
        checkpoint mỗi 50 entries + progress log; kill → resume không dup;
        dry-run MẶC ĐỊNH, --apply mới ghi
[match] QUY TẮC GHÉP words ↔ crawl_entries (P0-1 — contract SF-2/SF-3):
        normalizeMatch(x) = trim + lowercase + strip suffix `_\d+$` + đổi '-'
        thành space + collapse whitespace. Đối sánh words.word (qua
        normalizeMatch) với CẢ HAI: crawl_entries.word (headword, chuẩn hoá
        riêng: trim+lowercase, không strip) và crawl_entries.slug (qua
        normalizeMatch). Ưu tiên: (1) headword exact > slug match; (2) nhiều
        crawl_entries khớp (homograph bank_1/bank_2): chọn entry có cefr
        non-null, rồi id nhỏ nhất — deterministic. Fill từ ĐÚNG 1 entry thắng.
[enrich] builder: crawl_entries (entry thắng theo [match]) → fill-EMPTY-only
        cho words của book:
        - ipa: uk → fallback us → skip
        - example: example đầu của sense 1 → skip nếu entry không có
        - cefr: giá trị thô → skip nếu null
        - audio_url: audio_uk_blob → fallback audio_us_blob → skip
          (BLOB-ONLY — không fallback hotlink; thiếu blob → report 'noAudioBlob'
          và gợi ý chạy phase audio)
        - words.source = 'oxford-ld' CHỈ KHI có ≥1 field được fill
        'empty' = NULL (giá trị teacher đã nhập — kể cả rỗng chuỗi sau trim —
        được tôn trọng). Đánh giá emptiness lúc APPLY (re-read DB), không phải
        lúc preview. Sau apply gọi revalidateContent() (cùng pattern
        importVocabulary — public pages đọc words).
[api]   admin-only (assertAdmin). ROUTE PATHS PIN (P1 plan-critic — SF-2/SF-3
        dùng đúng, không tự chế):
        POST /api/admin/vocabulary/crawl/enrich
             {bookId | wordIds[], dryRun?} — dryRun:true → 200
             {candidates, fillableIpa, fillableExample, fillableCefr,
             fillableAudio} KHÔNG ghi; thiếu dryRun → apply + report per-word
             {word, filled: ('ipa'|'example'|'cefr'|'audio')[], skipped[]
             (vì đã có giá trị), reason?}. Cap 200 từ/request — SF-3 UI loop
             batch (continue-and-collect: chunk lỗi ghi vào report, KHÔNG
             dừng cả loop).
        GET  /api/admin/vocabulary/crawl/stats →
             {counts: {pending, parsed, failed, failedMaxAttempts}, samples:
             failed[] (slug+last_error, ≤20), lastRun: max(fetched_at)} —
             last-run DERIVED, không có bảng crawl_runs (cấm tự chế bảng).
        POST /api/admin/vocabulary/crawl/control {action}:
          - 'refresh-sitemap': fetch 3 XML + diff → upsert CHỈ slugs mới;
            delta > 2000 rows → {deltaTooLarge: true, hint} (không upsert
            cưỡng bức trong request)
          - 'retry-failed': reset failed→pending với attempts < 5
          Runner là script ngoài (cron/nohup) — API KHÔNG chạy crawl.
        POST /api/admin/vocabulary/crawl/word {word, bookId?} → preview:
             {found: boolean, from: 'cache'|'live',
              entry: {slug, word, ipaUk, ipaUs, cefr, pos,
                      audioUkBlob, audioUsBlob} | null} — crawl-on-add;
             cache-first (crawl_entries trúng → không gọi Oxford), miss →
             live fetch+parse (không ghi DB).
        POST /api/admin/vocabulary/crawl/word/approve
             {entry (payload y như preview trả), meaning_vi (teacher gõ,
             bắt buộc), bookId} → tạo word + link book + cefr +
             source='oxford-ld'. Word ĐÃ TỒN TẠI → reuse + attach book
             (idempotent như createVocabularyWord) + vẫn set cefr/source.
             AUDIO (P0-3): ngoại lệ có chủ đích — approve tải ĐÚNG 1 mp3 UK
             (fallback US nếu không có UK) về Blob QUA HELPER BLOB-ONLY trong
             request (~50KB; NGOẠI LỆ được ghi nhận của nguyên tắc "API
             không crawl"); throw (thiếu token/network) → word VẪN được tạo
             KHÔNG audio (không hotlink — enrich sau bổ sung).
[ui]    SF-3: crawl dashboard (stats + progress + failed + refresh + retry +
        hint lệnh runner + attribution), enrich panel per book (dryRun counts →
        chạy → report; loop batch >200), crawl-on-add dialog (preview + nghĩa VI
        teacher điền + audio preview khi có blob), CEFR badge + source marker
        bảng words admin. SF-3 gate dùng dữ liệu seeded/mock — KHÔNG phụ thuộc
        crawl thật.
```

**Tách lớp data:** `crawl_entries` = data lake (toàn bộ từ điển, không đụng bảng
words); `words` = curated layer (teacher tạo, enrich chỉ điền chỗ trống). 60k+ từ
crawl không tạo row words — không flood bảng curated, không đụng flow import hiện
có (import vẫn hoạt động y nguyên; word đã có trong crawl_entries sẽ được enrich ở
lần enrich kế).

## Data model (migration 0004 — additive)

```sql
CREATE TABLE crawl_entries (
  id integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  slug text NOT NULL UNIQUE,          -- vd 'tree', 'three-d_2' (từ sitemap;
                                      -- sau redirect lưu slug CUỐI)
  word text,                          -- headword từ entry parse — NULLABLE,
                                      -- null khi đang pending (chưa parse);
                                      -- UI hiển thị COALESCE(word, pretty(slug))
  source text NOT NULL DEFAULT 'oxford-ld',
  raw jsonb,                          -- toàn bộ entry đã parse (null = chưa parse)
  ipa_uk text, ipa_us text,
  audio_uk_url text, audio_us_url text,   -- URL mp3 gốc (provenance)
  audio_uk_blob text, audio_us_blob text, -- URL Blob sau khi tải (nullable)
  pos text, cefr text, ox3000 boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending', -- pending|parsed|failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crawl_entries_status_idx ON crawl_entries (status);
CREATE INDEX crawl_entries_word_idx ON crawl_entries (word); -- enrich match per-word,
                                    -- không seq-scan 60k rows mỗi request enrich

ALTER TABLE words ADD COLUMN cefr text;      -- nullable raw level (A1–C2 thô)
ALTER TABLE words ADD COLUMN source text;    -- nullable 'oxford-ld' khi enrich fill
```

CEFR: lưu text thô (Oxford A1–C2), KHÔNG map vào enum `vocab_level` của lessons
(hai thang khác nhau; enum đổi tốn migration). Parse không thấy level → null.

meaning_vi & LLM: **không có LLM trong story này** — không thêm SDK, không thêm
API key. `meaning_vi` chỉ teacher nhập (form thêm/sửa/import hiện có + form
crawl-on-add).

## Phân rã SF (bracket — plan-critic sẽ mài)

- **SF-1 (tier 0) — Crawl-core: enumerate + fetch + parse + store + runner**
  (~13 tasks) fixtures đa entry-type (multi-POS, idiom, _2 homonym, US-only
  không UK audio, 404, redirect — dùng chung cho e2e SF-3 sau, KHÔNG author
  file trùng); migration 0004 (word nullable + identity + index status + index
  word; ghi nguyên thủ tục renumber VU-24 vào task text); **blob-only write
  helper storage-server.ts (throw khi thiếu token — P0)**; fetch lib (redirect
  lưu slug cuối); parse lib pure (headword bắt buộc, field thiếu = null);
  sitemap lib (+lọc Disallow); rate limiter + retry; store upsert/stats (status
  3 trạng thái, single-runner); robots runtime-guard; audio leg Blob QUA HELPER
  (token từ .env.local qua `vercel env pull`; không token → evidence = unit
  test + manual run note) + audio-sync exclusion audio/oxford/ + test; CLI
  runner resumable 3 phases; unit tests (inject fetch, không gọi mạng);
  docs README.
  Demo: `node scripts/oxford-crawl.ts fetch --limit 20 --apply` → 20 dòng
  crawl_entries parsed (field đúng theo entry); kill giữa chừng → chạy lại tiếp,
  không dup.
- **SF-2 (tier 1, dep SF-1) — Enrichment + admin API** (~11 tasks) match rule
  (normalizeMatch + winner rule) + unit test; fill-empty builder (apply-time
  emptiness, revalidateContent, source marker) + unit test KHÔNG đụng field có
  sẵn; **mở rộng store: listVocabulary select cefr/source + WordInput thêm
  cefr/source + create/approve path ghi (vocabulary-store.ts)**; POST
  .../crawl/enrich (dryRun counts + apply report + cap 200); GET .../crawl/stats
  (last-run derived — không bảng mới); POST .../crawl/control (refresh-sitemap
  diff + delta cap; retry-failed cap 5); POST .../crawl/word (cache-first
  preview, shape pin trong spec) + /approve (audio 1-mp3 QUA HELPER BLOB-ONLY,
  duplicate-word = reuse+attach, throw → word vẫn tạo); crawl_entries seed
  helper (export — SF-3 e2e tái dùng); verify audio-sync test SF-1 vẫn xanh;
  SSRF (2-host allowlist, dùng fetchEntry SF-1) + assertAdmin là ASSERTIONS
  trong unit test routes, không task build riêng.
  Demo (blob provenance pin): chạy `audio --limit 1` (SF-1 runner) TRƯỚC để có
  audio_uk_blob thật → curl enrich dryRun → apply → words thiếu dữ liệu được
  điền đúng entry thắng, audio URL blob phát được; crawl-on-add preview
  cache-hit không gọi Oxford.
- **SF-3 (tier 2, dep SF-2) — Admin UI: dashboard + enrich + crawl-on-add**
  (~12 tasks) **nav + page dashboard** (admin-nav.tsx + messages/vi/admin.json
  nav key + page + stats client — admin runtime vi-only, en là parity mirror);
  **controls dashboard** (refresh-sitemap, retry-failed, hint lệnh runner,
  attribution nguồn); enrich panel per book (dryRun preview → chạy → report;
  loop batch >200 continue-and-collect); crawl-on-add dialog (preview shape
  theo pin + nghĩa VI + audio preview; miss-path mock tái dùng fixture SF-1);
  CEFR badge + source marker (đọc cefr/source do SF-2 mở rộng store;
  vocabulary-manager.tsx + admin page mapping); i18n vi+en parity (parity test
  auto-enforce); wire APIs + error toasts; seed helper từ SF-2 dựng e2e data;
  e2e config riêng (port riêng, bootstrap ASSERT migration 0004 đã chạy — DB
  template VU-24 ilec_sf2..sf5 KHÔNG có crawl_entries, không tái dùng mù) +
  e2e dashboard/enrich/crawl-on-add + fill-empty contract (Playwright route
  mock — KHÔNG gọi Oxford thật); e2e enrich không đụng field teacher đã nhập.
  Demo: teacher mở dashboard (dữ liệu seeded) thấy stats; bấm enrich → report;
  thêm từ mới qua preview.
- **SF-4 (tier 3, dep SF-2 + SF-3) — Convergence + bulk rehearsal + QA**
  (~10 tasks) **public attribution TRƯỚC** (getBookVocabulary select extension
  src/lib/content/queries.ts + messages/{en,vi}/vocabulary.json + render badge
  nguồn khi source='oxford-ld'); full-chain e2e crawl(mock)→enrich→public
  (chạy SAU attribution); bulk rehearsal THẬT (--limit 100, kill/resume
  verify; mechanism 60k rows cho perf = `enumerate --apply` đầy đủ tạo ~64k
  pending rows trong vài phút — KHÔNG crawl thật 9h); audio playback blob;
  perf dashboard + crawl_entries ~60k rows (index check — word_idx của 0004);
  security sweep (auth/SSRF/secrets/exec-bit); lighthouse a11y trang đụng;
  full suite + build VỚI regression lanes tên rõ: test:e2e:vocabulary +
  word-lookup (404 not_in_vocabulary) + import e2e; runbook docs (cron/nohup,
  rate, vercel env pull token, storage budget ước tính ~5GB Blob / ~300MB DB,
  thời gian ~9h @2r/s fetch + ~18h audio, số thật từ rehearsal); story verify.
  Demo: crawl rehearsal 100 từ chạy thật trên dev, resume không dup; học viên
  thấy audio + IPA + attribution trên flashcards cho từ đã enrich.

Chống-duplicate: migration/fixtures/CLI/audio-sync-exclusion chỉ SF-1 (SF-2 chỉ
verify test cũ); API chỉ SF-2; UI/i18n chỉ SF-3; public attribution chỉ SF-4;
e2e SF-3 (UI flows, mock upstream) ≠ e2e SF-4 (full-chain + rehearsal thật);
unit test là Zweck mỗi SF. Không pattern lặp ≥2 SF.

Phased release: **Phase 1** = SF-1 + SF-2 (pipeline + API — shippable: runner chạy
được, enrich qua API); **Phase 2** = SF-3 + SF-4 (UI + convergence). Checkpoint +
security-audit mỗi phase.

## Rủi ro & unknowns

1. **VU-24 song song** — schema.ts/migration số/playwright configs: thủ tục
   renumber ghi ở Constraints; SF dùng port riêng. Trước launch: story-watchdog
   status (2026-10-04: không có sf-worktree nào đang chạy).
2. **Oxford HTML stability** — parser chết thầm lặng nếu redesign → fixtures =
   contract test (SF-1); runner log parse-fail rate, dashboard thấy failed tăng.
3. **ToS pháp lý (khác robots.txt)** — robots CHỈ là khai báo kỹ thuật; © Oxford
   University Press vẫn áp dụng cho nội dung. User đã quyết crawl cho platform
   giáo dục nội bộ (đã nêu trade-off); posture: crawl đúng đường được phép, rate
   thấp, cache, attribution, audio blob chỉ phục vụ playback trong app (không
   hotlink, không phân phát lại). Ghi vào runbook: nếu OUP yêu cầu dừng → tắt
   runner + xoá dữ liệu (xoá crawl_entries + prefix blob là đủ).
4. **Sitemap thay đổi (thêm/sửa entries)** — refresh-sitemap là upsert diff (slug
   mới thêm pending; slug mất KHÔNG xoá dữ liệu đã crawl); delta lớn → runner.
5. **Blob cost** — ~128k mp3 ≈ 4-6GB + 128k write ops; --skip-audio cho text-only
   nếu cần cắt; số thật đo ở rehearsal ghi vào runbook.
6. **Neon row limits/size** — ~64k rows jsonb ~300MB ước tính: đo thật ở rehearsal.
7. **Function timeout** — runner là script ngoài, KHÔNG chạy crawl trong request;
   API control-plane có cap (enrich 200 từ, refresh-sitemap delta 2000, crawl-on-
   add audio = ngoại lệ 1 mp3 đã ghi rõ).

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. `node scripts/oxford-crawl.ts enumerate --apply` → đúng số slugs sitemap trả
   về (≈63.949 tại 2026-10-04) pending trong DB; chạy lại → không dup.
2. `fetch --limit 50 --apply` → 50 entries có trạng thái parsed|failed; mọi
   entry parsed có headword + raw; các field khác đúng theo entry cung cấp
   (US-only → không UK audio; không level → cefr null); entry lỗi → failed +
   attempts tăng.
3. `audio --limit 20 --apply` → TỐI ĐA 40 mp3 — đúng bằng số mp3 các entry đó
   có (uk+us; entry thiếu variant thì ít hơn) trên Blob `audio/oxford/`;
   `audio-sync` KHÔNG kéo chúng vào git.
4. Dashboard admin: counts theo status + failed samples + refresh-sitemap +
   retry-failed + hint lệnh runner + attribution nguồn.
5. Enrich per book: dryRun hiện counts trước; apply → words thiếu IPA/example/
   audio/cefr được điền từ entry thắng theo match rule; words ĐÃ CÓ giá trị
   KHÔNG bị đụng (contract fill-empty có test); `words.source` chỉ set khi có
   fill; revalidate chạy (public thấy ngay).
6. Public: từ đã enrich phát audio Blob trên vocabulary page + flashcards; tra
   từ hiện IPA/example mới; attribution nguồn hiển thị khi source='oxford-ld'.
7. Crawl-on-add: gõ từ → preview cache-first → teacher điền nghĩa VI → duyệt →
   từ vào book (cefr + source='oxford-ld'); audio: UK mp3 tải về Blob trong
   approve — nếu tải fail, từ vẫn được tạo không audio (không hotlink), enrich
   sau bổ sung.
8. Không route nào thiếu assertAdmin; outbound fetch chỉ 2 host
   (oxfordlearnersdictionaries.com + media của nó); không LLM/API key nào trong
   code.
9. e2e (mock upstream) xanh; vitest/typecheck/lint/build xanh; runbook docs có
   số liệu thật từ rehearsal.
