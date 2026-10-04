# Plan: SF-2 Enrichment fill-empty + admin API (VU-34)

**Spec:** `docs/superpowers/specs/2026-10-04-oxford-vocab-crawl-design.md` (v4 FINAL) · **Context pack:** `docs/superpowers/contexts/oxford-crawl/sf-2.md` (CONTRACT — route paths, shapes, caps 200/2000/5 pin)
**Worktree:** `sf-2-oxford-enrich` (base `wakii-dev/story-vu32-oxford-vocab-crawl` — SF-1 merged fb62c58) · **Linear:** VU-34
**Boundary:** KHÔNG UI (SF-3) · KHÔNG đụng `src/lib/oxford/{store,fetch,parse,sitemap,audio,robots,rate-limit}.ts` + `scripts/oxford-crawl.ts` (SF-1 READ-ONLY) · KHÔNG migration mới · KHÔNG LLM/API key · `meaning_vi` teacher-owned.

## Quy ước
- TDD RED→GREEN từng task; commit atomic `<type>(<scope>): ...` per task; plan checkbox tick + commit nhỏ sau mỗi task.
- Lib pure (inject) theo pattern SF-1; DB leg dùng drizzle `@/db` theo pattern `vocabulary-store.ts`; route mỏng `assertAdmin` đầu mỗi method (pattern `/api/admin/vocabulary/route.ts`, `authError` helper 401/403).
- Test route: mock lib + mock `@/lib/content/guards` (assertAdmin throw ForbiddenError('not-authenticated')→401 / 'not-admin'→403) — pattern `src/app/api/vocabulary/lookup/route.test.ts`.

## Tasks

- [x] **T1 — match rule** `src/lib/oxford/match.ts` + `match.test.ts`
  `normalizeMatch(x)` = trim + lowercase + strip `_\d+$` + '-'→space + collapse whitespace; `normalizeHeadword` = trim+lowercase (không strip). Winner: headword exact > slug match → cefr non-null → id nhỏ nhất. PURE.
- [x] **T2 — fill builder (pure)** trong `enrich.ts` + test
  `buildFill(word{ipa,example,cefr,audioUrl}|null, entry)` → fills theo rule: ipa uk→us→skip · example senses[0].examples[0]→skip · cefr thô→skip nếu null · audio audio_uk_blob→audio_us_blob→skip('noAudioBlob'). Empty = CHỈ `null` (chuỗi rỗng teacher = tôn trọng). `filled[]`/`skipped[]`/`reason?` derive từ fills.
- [x] **T3 — enrich DB leg + seed helper** trong `enrich.ts` + test (mock `@/db`)
  `enrichWordsDb({bookId|wordIds, dryRun})`: resolve ≤200 words (JOIN book_words khi bookId) → fetch candidates (1 query batch: slug IN bases + slug ~ ANY `^base_[0-9]+$` + lower(trim(word)) = ANY) → winner qua T1 → dryRun counts `{candidates, fillableIpa, fillableExample, fillableCefr, fillableAudio}` | apply re-read DB (apply-time emptiness) → UPDATE chỉ field fill + `source='oxford-ld'` khi ≥1 fill → report per-word `{word, filled[], skipped[], reason?}` ('noMatch' khi không có entry thắng) → `revalidateContent()`. `seedCrawlEntry(sql, row)` export (test + SF-3 e2e).
- [x] **T4 — store mở rộng** `vocabulary.ts` + `vocabulary-store.ts` + test update
  `WordInput` thêm `cefr?/source?` optional; `createVocabularyWord` ghi 2 trường (insert + duplicate-path COALESCE giữ giá trị có sẵn — 6 importer hiện có KHÔNG break); `listVocabulary` select thêm cefr/source.
- [ ] **T5 — route enrich** `POST /api/admin/vocabulary/crawl/enrich` + test
  assertAdmin · body {bookId | wordIds[], dryRun?} · cap 200 (vượt → 400) · dryRun:true → counts, thiếu dryRun → apply report. Shape pin đúng context pack §4.
- [ ] **T6 — route stats** `GET /api/admin/vocabulary/crawl/stats` + test
  assertAdmin · `{counts:{pending,parsed,failed,failedMaxAttempts}, samples: failed[](slug+last_error, ≤20), lastRun: max(fetched_at)}` — DERIVED, không bảng mới; counts qua query riêng trong enrich.ts (import `RETRY_ATTEMPTS_CAP` từ store SF-1 — không sửa file).
- [ ] **T7 — route control** `POST /api/admin/vocabulary/crawl/control` + test
  assertAdmin · `refresh-sitemap`: fetchSlugs (SF-1) → diff vs DB slugs → delta >2000 → `{deltaTooLarge:true, hint}` KHÔNG ghi; ≤2000 → upsert chỉ slug mới (drizzle chunk 100, `UPSERT_BATCH_SIZE` import) → `{inserted}` · `retry-failed`: reset failed→pending attempts<5 → `{reset}`. Action khác → 400.
- [ ] **T8 — route word preview** `POST /api/admin/vocabulary/crawl/word` + test
  assertAdmin · `{word, bookId?}` → cache-first (crawl_entries parsed, winner theo T1) → `{found, from:'cache'|'live', entry:{slug,word,ipaUk,ipaUs,cefr,pos,audioUkBlob,audioUsBlob}|null}` · miss → fetchEntry+parseEntry (SF-1 — SSRF allowlist), KHÔNG ghi DB · outbound CHỈ qua fetchEntry (assertion test).
- [ ] **T9 — route word approve** `POST /api/admin/vocabulary/crawl/word/approve` + test
  assertAdmin · `{entry (payload y như preview), meaning_vi (bắt buộc), bookId}` → tạo word (ipa uk→us, cefr, source='oxford-ld') + link book (duplicate → reuse + attach + COALESCE cefr/source) · AUDIO 1-mp3 exception: audioUkBlob payload → DB row blob → download qua `downloadMp3`+`putBlobAudio` (blob-only, UK→US) → throw → word VẪN tạo KHÔNG audio (không hotlink).
- [ ] **T10 — suite xanh** — `npm test` (audio-sync exclusion SF-1 vẫn xanh) + `typecheck` + `lint` + `test:store` (nếu DB).
- [ ] **T11 — demo + verify + ship** — audio `--limit 1 --apply` blob thật → seed words demo → curl dryRun/apply/stats/control/word/approve trên DB dev (admin session thật) → evidence `docs/superpowers/evidence/sf-2-oxford-enrich/test-run.txt` + `demo-run.txt` → code-reviewer ĐỘC LẬP trên diff SF → push `wakii-dev/sf-2-oxford-enrich` → DONE comment VU-34 → `story-verify sf-2`.

## Verify checklist (ACCEPTANCE context pack — Phase 5 kiểm từng dòng)
1. audio blob thật → enrich dryRun counts đúng → apply điền đúng entry thắng; audio blob phát được.
2. Teacher values không bị đụng (fill-empty contract test + demo chứng minh).
3. `source` chỉ set khi có fill; revalidate chạy.
4. Preview cache-hit không gọi Oxford; approve nghĩa VI bắt buộc; audio fail → word vẫn tạo.
5. Mọi route 401/403 khi thiếu admin; shape đúng pin; caps 200/2000/5 đúng.
