# Runbook — VU-37 vocab-memrise Convergence (SF-5, VU-42)

> Dành cho NGƯỜI merge/coordinator: story đã xong Phase 2/2 — nhánh SF-5
> `wakii-dev/sf-5-convergence-qa` chứa convergence QA (fix nhỏ + evidence).
> Dest: `wakii-dev/story-vu37-vocab-memrise`. PR do coordinator tạo (cửa người).

## 1. Migration đã áp (theo thứ tự, chưa dùng ở prod)

| Migration | Nội dung |
|---|---|
| `drizzle/0002_wooden_union_jack.sql` | bảng vocab: `words`(mở rộng cefr/source/audio_url/example/ipa) · `book_words` · `user_word_progress` · `vocab_activity` · `daily_activity` |
| `drizzle/0005_shocking_hardball.sql` | `profiles.daily_goal_words` + index queue `(user_id, due_at)` |
| `drizzle/0006_warm_gunslinger.sql` | view `leaderboard` mới: weekly = UNION ALL `attempts.xp` + `vocab_activity.xp` (tuần GMT+7) · all_time = `profiles.xp` |

Áp: `npx drizzle-kit migrate` với `DATABASE_URL` trỏ DB đích (Neon template
`ilec_sf5` đã có đủ 0000–0006).

## 2. Env cần

- Không có env MỚI so với hiện trạng app. `DATABASE_URL` (đã có), NextAuth
  secrets (đã có). Feature vocab KHÔNG đọc env khác.
- Ports e2e: mỗi lane port riêng — 3310/3312–3319 + **3340 mới (top-users
  vocab — 3320 đã bị lane oxford-crawl chiếm, review P1 VU-42)**; lane 3311
  `test:e2e:vocabulary-review` ĐÃ RETIRED (xoá ở SF-3 — route client-trusted
  quality `POST /api/vocabulary/review` không sống sót).

## 3. Feature map URL mới/cũ

| URL | Trạng thái |
|---|---|
| `/[locale]/vocabulary` | dashboard Memrise-style (SF-4) — `?tab=library\|quiz` giữ nguyên (contract); continue CTA href **bookId số** (SF-5 fix — slug gây 404 learn route) |
| `/[locale]/vocabulary/learn/[book]` | phiên learn mới (SF-3) — bookId số; không hợp lệ/sách lạ → 404 |
| `/[locale]/me/vocabulary` | phiên review gõ-từ (SF-3) — `?word=<id>` prefill, `?scope=book&book=`, `?scope=all` giữ nguyên |
| `/api/vocabulary/session` | GET build phiên / POST chấm server-side (SF-2) — thay route review cũ |
| `/api/vocabulary/goal` | PATCH daily goal (SF-4) |
| `/[locale]/top-users` | leaderboard — weekly CỘNG XP vocab (view 0006) |
| `ReviewFlashcards` + `POST /api/vocabulary/review` | **ĐÃ XOÁ** (SF-3) — grep `review-flashcards` = 0 |

## 4. Lệnh xác minh (sau merge, trên dest)

```bash
npm ci
npx drizzle-kit migrate            # nếu DB đích chưa có 0002/0005/0006
npm test                           # vitest unit (863+ passed)
npm run test:e2e:vocab-convergence # MỘT lệnh — 10 lane vocab liên tiếp xanh
npm run build                      # next build xanh
```

Evidence chi tiết: `docs/superpowers/evidence/sf-5-convergence-qa/`
(`test-run.txt` — tổng hợp tất cả, `suites-run-final2.log`, `flow-*.png`,
`visual-*.png`, `vu32-coexistence.txt`, `design-fidelity-checklist.md`,
`rehearsal-5k.txt` + `rehearsal-explain.txt`, `back-compat-sweep.md`).

## 3b. Fix P1 SF-5 bắt được (đã sửa trong nhánh)

**Continue CTA → 404**: dashboard SF-4 href `/vocabulary/learn/[slug]` nhưng
route learn SF-3 đòi bookId `^\d+$` → user mới bấm "Học tiếp" rơi 404. Hai e2e
của SF-3/SF-4 đều không chạm seam này (SF-4 chỉ assert href, SF-3 đi thẳng
bookId). Fix 1 dòng (`card.bookId`) + cập nhật assertion unit + e2e 3319 —
commit `6cc5563`. Rule 0 FLOW đi trọn vòng sau fix.

## 5. Lưu ý vận hành

- **Neon shared-DB**: các e2e lane dùng chung DB — KHÔNG chạy 2 lane song song
  (aggregator đã tuần tự); fixture `qa-*` tự dọn ở teardown. Nếu thấy test
  count-assert đỏ kiểu "expected 3 → 15": kiểm từ mồ côi
  `select word from words where word like 'qa-%'` (đã gặp: `qa-ls-*` của
  worktree crash — xoá theo prefix).
- **Words table có 6 từ template** (`a`, `abacus`, `fifth-generation`,
  `twenty-four seven`, `wander`, `zzz-no-match-word`) — sort trước `qa-*` và
  4/6 có audio: các test count hub-library đã tính dynamic (SF-5).
- **ISR `/top-users` revalidate=60** — dữ liệu mới seed sau khi server sống có
  thể trễ ≤60s trên render đầu (suite top-users seed TRƯỚC bind nên không dính).
- **VU-32 enrich**: chạy song song an toàn — vocab flow KHÔNG ghi `words`
  (static grep + runtime dryRun trong `vu32-coexistence.txt`); enrich apply
  vẫn phải đi admin route (`assertAdmin`).

## 6. Bước merge cho coordinator

1. `git fetch && git log --oneline wakii-dev/sf-5-convergence-qa` — duyệt
   commits SF-5 (fix test + evidence + suite top-users).
2. PR `wakii-dev/sf-5-convergence-qa` → `wakii-dev/story-vu37-vocab-memrise`
   (hoặc merge thẳng nếu story hub quản fuse — merge là cửa người).
3. Sau merge: chạy lại `npm run test:e2e:vocab-convergence` trên dest (post-
   merge smoke), rồi mới set Linear VU-42/VU-37 Done.
