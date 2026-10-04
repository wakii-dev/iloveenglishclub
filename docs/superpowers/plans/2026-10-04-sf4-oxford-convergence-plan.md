# Plan — SF-4 Convergence: public attribution + bulk rehearsal + QA (VU-36)

- **Story:** VU-32 Oxford Vocabulary Crawl — SF-4/4 (tier 3, convergence)
- **Linear:** VU-36 · **Worktree:** `sf-4-convergence-public-attribution` (base fa478ab = story head, SF-1/2/3 merged)
- **Spec:** context pack `docs/superpowers/contexts/oxford-crawl/sf-4.md` + epic spec `2026-10-04-oxford-vocab-crawl-design.md` v4 (epic ĐÃ trả lời mọi câu — không re-ask; Phase 2 brainstorm: 6 câu plan-template tự trả lời từ context pack + code recon, không REQUIREMENT-GAP)
- **Phase 0:** impact analysis posted VU-36 — key finding: dev DB đã có `crawl_entries` 83 parsed + 63.854 pending (≈63.9k sitemap) → perf đo trên state này, KHÔNG re-enumerate; single-runner verified (fetch cuối 2026-10-03T21:22, watchdog chỉ sf-4 RUNNING).

## 0. Root cause

Story cần 1 SF convergence vì SF-1/2/3 merged riêng lẻ: attribution nguồn chưa lộ ra public (SF-2 enrich ghi `words.source` nhưng public page không render), chưa có e2e đi TRỌN chuỗi crawl→enrich→public+flashcards+lookup, chưa có rehearsal thật đo số liệu, chưa kiểm perf ở scale 63.9k rows, runbook chưa có số thật. Chiến lược: verify trên tổng hợp + 1 feature nhỏ (attribution) + rehearsal/perf là evidence-first.

## 1. Problem

Người dùng cuối cần thấy nguồn từ điển (attribution — quy định OUP posture của epic §Rủi ro 3) trên trang public; team cần bằng chứng chuỗi end-to-end sống sau 3 lần merge + số liệu thật để operator chạy full crawl an toàn (runbook).

## 2. Scope

**In:** attribution public (query + render + i18n en/vi) · full-chain e2e (crawl-on-add mock → enrich → public page + flashcards audio + lookup + 404 contract) · rehearsal thật 100 từ (kill/resume/no-dup/attempts) · perf 63.9k rows (EXPLAIN + API sống) · security sweep · lighthouse a11y 2 trang đụng · full suite + build + regression lanes tên rõ · runbook số thật · story-verify sạch.
**Out (boundary):** sửa crawl-core/API/UI logic SF-1/2/3 (bug → fix-nhỏ có flag) · crawl thật >100 từ · merge vào story branch (coordinator) · set Done.

**Success criteria (user-visible):** ACCEPTANCE 1-5 của context pack — attribution hiện đúng điều kiện; audio Blob phát được trên flashcards + vocabulary page; tra từ thấy IPA/example mới, từ lạ vẫn 404 `not_in_vocabulary`; rehearsal kill→resume không dup; dashboard + enrich sống với 63.9k pending; full suite + build xanh; security sweep không P0/P1.

## 3. Touch map

| File | Thao tác |
|---|---|
| `src/lib/content/queries.ts` | EDIT — getBookVocabulary select thêm `source` (additive, READ-ONLY phần khác) |
| `src/app/(public)/[locale]/books/[book]/vocabulary/page.tsx` | EDIT — render attribution khi `entry.source === 'oxford-ld'` |
| `messages/{en,vi}/vocabulary.json` | EDIT — key `source` ("Source: Oxford Learner's Dictionaries" / "Nguồn: Oxford Learner's Dictionaries") |
| `e2e/oxford-fullchain-fixture.ts` + `-global-setup.ts` + `-global-teardown.ts` + `oxford-crawl-fullchain.spec.ts` | TẠO — prefix riêng `qa-sf4-`/`qasf4-`, KHÔNG đụng fixture SF-3 |
| `playwright.oxford-fullchain.config.ts` | TẠO — port riêng 3330 (E2E_PORT), pattern oxford-crawl config |
| `package.json` | EDIT — lane `test:e2e:oxford-fullchain` |
| `docs/oxford-crawl-runbook.md` | TẠO — số thật từ rehearsal/perf |
| `docs/superpowers/evidence/sf-4-convergence-public-attribution/*` | TẠO — test-run/demo-run/screenshots |
| `scripts/oxford-crawl.ts`, crawl routes, crawl-core libs | READ-ONLY (sweep + chạy rehearsal qua nó) |

## 4. Design (quyết định đã chốt từ recon)

- **Attribution per-word:** mỗi `<li>` có `entry.source === 'oxford-ld'` render dòng muted "Nguồn: Oxford Learner's Dictionaries"; từ teacher-only (source null) không render gì — khớp literal ACCEPTANCE 1 + nhất quán badge "Oxford" per-row của dashboard SF-3. Điều kiện so sánh CHÍNH XÁC `'oxford-ld'` (không phải "non-null").
- **Full-chain e2e hermetic (0 gọi Oxford thật):** seed `crawl_entries` `qasf4-tree` status `parsed` (mirror seedCrawlEntry, raw senses từ fixture HTML SF-1) → leg "crawl" = crawl-on-add preview/approve qua REAL API (preview cache-miss được fulfill ở tầng browser như SF-3; approve payload CÓ `audioUkBlob` dạng đường dẫn tương đối `audio/qa-sf4/sample.mp3` → word tạo kèm audio_url KHÔNG download Blob — đọc approveWordDb confirm lúc làm, fallback: word không audio và audio do leg enrich chứng minh) → leg "enrich" = enrich REAL dryRun+apply fill-empty từ crawl entry seeded (audio fill qua `audio_uk_blob` pass-through — resolveStoredAudioUrl ra `/audio/qa-sf4/sample.mp3` static) → leg "public" = vocabulary page attribution + WordPlayButton phát được (audio.play() resolve + icon Play→Pause) + flashcards review phát được + lookup IPA/example mới + từ lạ 404 `not_in_vocabulary` (contract word-lookup.spec giữ nguyên).
- **Audio sample:** copy 1 mp3 nhỏ từ `e2e/fixtures/` vào `public/audio/qa-sf4/sample.mp3` (committed, vài KB — public/audio KHÔNG gitignore; khác prefix `oxford/` để không vướng audio-sync mirror).
- **Rehearsal thật:** `node scripts/oxford-crawl.ts fetch --limit 100 --apply` trên dev DB (real Oxford, robots guard pass; rate 2/s → ~1-2ph). Kill giữa chừng (SIGKILL sau ~10 fetch) → đếm trạng thái → chạy lại → không dup (mỗi slug đúng 1 row, attempts tăng trên failed). Baseline ghi trước: 83 parsed / 63.854 pending.
- **Perf:** EXPLAIN (ANALYZE) 3 query nóng trên 63.9k rows: fetchCandidates (batch enrich), stats GROUP BY, claimPending LIMIT; + đo wall-time enrich dryRun book 201 từ QA SF-4 + GET crawl/stats. Nguyên tắc: 1 scan/batch chứ KHÔNG seq-scan per-word.
- **Lighthouse:** chạy `npx -y lighthouse@12` TRỰC TIẾP cho 2 trang đụng (public vocabulary + admin crawl dashboard qua `--extra-headers` cookie session nếu khả thi) N=3 median a11y ≥ 0.95 — KHÔNG sửa scripts/lighthouse.mjs (VU-15 provenance); không khả thi phần dashboard → e2e a11y assertions + ghi trung thực.

## 5. Impl outline — Tasks (tick sau khi có bằng chứng)

- [x] **T1. Attribution (TDD RED→GREEN).** ✅ 1885027 — RED (li oak thiếu dòng nguồn, /tmp/sf4-fullchain-red.log) → GREEN 2/2 exit=0 (/tmp/sf4-fullchain-green4.log): VI+EN attribution đúng điều kiện + audio sample.mp3 play thật (Stop audio state). Unit queries 3/3 + tsc sạch. RED: fullchain spec case attribution (fixture book qa-sf4 có 1 từ source='oxford-ld' + 1 từ teacher-only; assert dòng nguồn CHỈ trên từ enriched) chạy FAIL trước. GREEN: queries.ts select `source` + BookVocabWord type; i18n key `source` en+vi; page render. Commit atomic `feat(sf4): public attribution ...`.
- [x] **T2. Full-chain e2e.** ✅ 15d3bdf — 5/5 pass exit=0 (/tmp/sf4-fullchain-t2e.log): attribution VI/EN + audio play thật; crawl-on-add cache-hit REAL → approve (source + audio relative, 0 Blob write); enrich REAL counts→apply→DB truth (teacher giữ nguyên) → revalidate → attribution xuất hiện post-enrich + lookup 200 mới + 404 not_in_vocabulary giữ nguyên; flashcards play thật + grade → due giảm. tdd: skipped-tdd (test-only — chain code SF-2/3 đã merge). tsc + eslint sạch. Fixture + config port 3330 + lane npm. Chain: crawl-on-add preview (browser-route mock) → approve REAL → enrich dryRun counts → apply → vocabulary page (attribution + audio play + IPA + example mới) → flashcards review audio → lookup hit mới + từ lạ 404. RED trước (case không pass khi thiếu fixture/impl) → GREEN. Commit `test(sf4): full-chain e2e ...` (+ fix nhỏ nếu bắt bug — fix-nhỏ có flag, không re-architect SF-1/2/3).
- [ ] **T3. Bulk rehearsal thật 100 từ.** Baseline counts → run → kill -9 giữa chừng → đếm → resume → assert no-dup + attempts tăng trên entry lỗi → metrics (tốc độ từ/ph, parse-fail rate, attempts) → evidence `rehearsal-run.txt` + log. Commit (nếu có fix-nhỏ) hoặc evidence-only.
- [ ] **T4. Perf 63.9k rows.** EXPLAIN ANALYZE 3 query + wall-time dashboard stats API + enrich dryRun 201 từ → evidence `perf-run.txt` (kết quả EXPLAIN + kết luận index/scan). Không timeout dashboard/enrich (curl đo). Evidence-only trừ khi phát hiện query chậm → fix-nhỏ có flag.
- [ ] **T5. Security sweep.** assertAdmin trên MỌI route crawl (`crawl/stats|enrich|control|word|word/approve`) — code read + unit test có sẵn; SSRF 2-host allowlist (fetch.ts + audio.ts); scan diff: không secrets/.env, không exec-bit mới, không LLM/API key. Evidence `security-sweep.txt`. Fix ngay nếu P0/P1.
- [ ] **T6. Lighthouse a11y.** 2 trang đụng, N=3 median ≥ 0.95 (a11y HARD) → evidence `lighthouse/`. Dashboard authed: thử cookie header; không được → e2e assertions + note trung thực.
- [ ] **T7. Full suite + build + regression lanes.** `npm test` (vitest toàn bộ) · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run test:e2e:vocabulary` · `npm run test:e2e:vocabulary-lookup` (404 contract) · `npm run test:e2e:oxford` (7 test SF-3 không vỡ) · `npm run test:e2e:oxford-fullchain` (mới). Evidence `test-run.txt` (hash HEAD~1 parent-convention + dòng `tdd:`).
- [ ] **T8. Runbook.** `docs/oxford-crawl-runbook.md`: cron/nohup cách chạy, flags 3 phase, `vercel env pull` cho token, rate 2 r/s, storage budget SỐ THẬT rehearsal (KB/từ × 63.9k ước tính Blob + MB/entry × 63.9k DB), thời gian ước tính từ tốc độ đo được, kill-switch (tắt runner + xoá crawl_entries + prefix blob audio/oxford/). Commit `docs(sf4): runbook ...`.
- [ ] **T9. Evidence + verify + push.** Browser verify walkthrough (CHECK 4 — login → vocabulary public attribution/audio → flashcards → tra từ → dashboard 63.9k) + screenshots; `~/.claude/bin/story-verify sf-4-convergence-public-attribution` sạch; `git push -u origin wakii-dev/sf-4-convergence-public-attribution`; DONE report VU-36.

**Rolling review (CHECK 3):** Review A (code-reviewer độc lập) sau T1-T4 — diff nhóm attribution + fullchain + rehearsal/perf evidence; Review B sau T5-T8 — nhóm sweep/a11y/suite/runbook. Verdict post VU-36 với literal `CHECKLIST-4Q`.

## 6. Risks

- Oxford fetch flake/SSL → retry 30s ×3 (protocol); robots guard có thể đổi — nếu denied → BLOCKED report (không vòng qua).
- Neon shared-DB flake trên batch lớn → rehearsal chỉ 100 từ; enumerate KHÔNG re-run; EXPLAIN đọc-only.
- unstable_cache `content` stale trong e2e → fixture seed TRƯỚC server bind (pattern vocabulary config); attribution case revalidate khi enrich apply (revalidateContent).
- e2e port 3330 phải KHÁC mọi config khác (đã kiểm: 3010/3110/3210/3211/3310/3320 đã dùng).
- Kill-mid-rehearsal để attempts dở trên shared DB → mechanism thiết kế đúng; resume chứng minh; không cần dọn (attempts là data thật).
- Lighthouse dashboard authed có thể không đo được → fallback trung thực (e2e assertions), không fake score.
