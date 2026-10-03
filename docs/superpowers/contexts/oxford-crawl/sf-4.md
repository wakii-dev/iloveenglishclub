# SF-4 Context Pack — Convergence: public attribution + bulk rehearsal + QA

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-04-oxford-vocab-crawl-design.md` (v4). Bracket: `docs/superpowers/mindmaps/oxford-vocab-crawl.wakii`. Epic: VU-32. Đây là SF convergence tier 3 — kiểm TRÊN TỔNG HỢP của SF-1/2/3 (đã merged về nhánh đích), KHÔNG re-implement.

## Spec slice (chỉ phần SF-4 chịu trách nhiệm)

1. **Public attribution (LÀM TRƯỚC — full-chain e2e phụ thuộc)** —
   `getBookVocabulary` (`src/lib/content/queries.ts`) select thêm `source`; render
   dòng "Nguồn: Oxford Learner's Dictionaries" trên public vocabulary page khi
   `words.source = 'oxford-ld'`; i18n keys `messages/{en,vi}/vocabulary.json` CẢ HAI.
2. **Full-chain e2e** (sau attribution) — crawl (mock upstream) → enrich → public
   vocabulary page + flashcards: audio Blob phát được + IPA + example mới + tra từ
   thấy dữ liệu mới; contract 404 `not_in_vocabulary` của tra từ VẪN GIỮ NGUYÊN cho
   từ lạ (e2e/word-lookup.spec.ts không được vỡ).
3. **Bulk rehearsal THẬT** — `node scripts/oxford-crawl.ts fetch --limit 100 --apply`
   trên dev: kill giữa chừng → resume không dup; attempts tăng trên entry lỗi; số
   liệu thật (tốc độ, parse-fail rate) ghi runbook. Mechanism 60k rows cho perf =
   `enumerate --apply` (tạo ~64k pending rows trong vài phút — KHÔNG crawl 9h).
4. **Audio playback verify** — mp3 Blob `audio/oxford/` phát qua `resolveStoredAudioUrl`
   trên flashcards + vocabulary page; audio-sync không mirror.
5. **Perf** — dashboard + enrich match với crawl_entries ~60k rows (enumerate-pending);
   kiểm query dùng `crawl_entries_word_idx` (không seq-scan per-word).
6. **Security sweep** — assertAdmin mọi route crawl; SSRF 2-host allowlist; không
   secrets/.env trong diff; không exec-bit mới; KHÔNG có LLM/API key nào trong code.
7. **Lighthouse a11y** — trang đụng (admin crawl dashboard + public vocabulary).
8. **Full suite + build** — vitest + typecheck + lint + build + regression lanes TÊN
   RÕ: `test:e2e:vocabulary`, `word-lookup` (404 contract), import e2e.
9. **Runbook docs** — cron/nohup cách chạy, flags, `vercel env pull` cho token, rate
   default 2 r/s, storage budget SỐ THẬT từ rehearsal (~ước tính 5GB Blob / 300MB DB),
   thời gian ước tính, kill-switch (tắt runner + xoá crawl_entries + prefix blob nếu
   OUP yêu cầu dừng).
10. **Story verify** — `~/.claude/bin/story-verify` sạch toàn phase 2 trước merge cuối.

## Touch map (files SF-4 tạo/sở hữu)

```
src/lib/content/queries.ts                    (EDIT — select source; READ-ONLY phần khác)
src/app/(public)/[locale]/books/[book]/vocabulary/page.tsx (EDIT — attribution)
src/components/vocabulary/*                   (EDIT nhẹ — attribution render; KHÔNG đổi logic)
messages/{en,vi}/vocabulary.json              (EDIT — attribution key)
e2e/oxford-fullchain.spec.ts                  (TẠO)
docs/oxford-crawl-runbook.md (hoặc README section) (TẠO)
scripts/oxford-crawl.ts                       (READ-ONLY — chạy rehearsal qua nó)
src/app/api/admin/vocabulary/crawl/**         (READ-ONLY — sweep qua)
```

## ACCEPTANCE (user-visible)

1. Public vocabulary page: từ có `source='oxford-ld'` hiện attribution nguồn; từ
   teacher-only không hiện.
2. Từ đã enrich: flashcards phát audio Blob; tra từ hiện IPA/example mới; từ lạ
   vẫn 404 not_in_vocabulary.
3. Rehearsal 100 từ: kill → resume không dup; số liệu thật trong runbook.
4. Dashboard + enrich sống với ~60k rows pending (enumerate) — không timeout,
   match query dùng index.
5. Full suite + build xanh kể cả regression lanes tên rõ; security sweep không P0/P1.

## Boundary (KHÔNG làm)

- KHÔNG sửa crawl-core/API/UI logic của SF-1/2/3 (đã merged — bug tìm thấy → report
  + fix-nhỏ có flag, không re-architect).
- KHÔNG crawl thật > limit rehearsal (100) — full crawl là việc operator theo runbook,
  không phải việc story.
- KHÔNG merge vào primary (PR là việc người); KHÔNG set Done hộ SF khác.
