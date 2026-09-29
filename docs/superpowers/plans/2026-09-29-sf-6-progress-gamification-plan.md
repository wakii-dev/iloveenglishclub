# SF-6 Progress + Gamification — Plan (VU-21)

Date: 2026-09-29 · Story: VU-15 · Spec: `docs/superpowers/specs/2026-09-28-iloveenglishclub-design.md` §4+§7 · Context pack: `docs/superpowers/contexts/sf-6.md` · Design hand-off: `docs/superpowers/designs/vu15-dictation-direction.md` (hướng B)

## Root cause / WHY
SF-4 ship player in-memory — điểm chỉ sống trong Zustand store, mất khi reload, guest không lưu được. Epic cần vòng lặp động lực (XP/streak/leaderboard//me) để học viên quay lại hằng ngày (success criterion §4+§7).

## Scope (từ context pack — không mở rộng)
Server action submit-attempt (transaction, trust boundary), streak TZ Asia/Ho_Chi_Minh (unit test 3 case), XP chỉ attempt đầu, progress upsert, leaderboard tuần+all-time (view SF-2 có sẵn), trang /top-users, trang /me (stats + heatmap 12 tuần + phút nghe distinct + book progress 0-skip), guest login giữa chừng → commit, wire player SF-4, header streak+XP, E2E progress.
KHÔNG: sửa state machine SF-4, schema, SEO metadata (SF-7), admin (SF-5).

## Design decisions (đã phân tích Phase 0)
1. **Transaction** (pattern `registerAction`): `SELECT profiles FOR UPDATE` (serialize submit cùng user) → count attempts (user,part) → `INSERT attempts ON CONFLICT (user,part,client_attempt_id) DO NOTHING RETURNING` (idempotent; duplicate → ok:true không cộng gì) → nếu first: `scoreAttempt` (SF-3) → `profiles.xp += xp` + streak cache → `daily_activity` upsert (distinct-part-today check) → streak recompute từ daily_activity → `user_lesson_progress` upsert (done_parts = count DISTINCT accuracy=1 của lesson; best_accuracy = GREATEST).
2. **Mode server-side** từ `profiles.relaxed_mode` (XP economy); `used_hint` = event flag từ client (không phải score).
3. **daily_activity.parts_done** = distinct parts có ≥1 attempt trong ngày → re-check part cũ hôm nay vẫn +1 ngày đó (giữ streak đúng "học ≥1 part/ngày"), re-check cùng part cùng ngày không phình counter.
4. **Client stable attempt-id** `partId|text|relaxed|hint` → uuid cache module-level: double-Enter nhanh = cùng id = unique constraint chặn còn 1 row; re-check text khác = attempt mới (log đầy đủ).
5. **Guest commit** = cùng submit effect: bỏ unmount-reset (doStart đã reset — không stale), login client-nav quay lại lesson qua `?next=` → effect thấy user + parts có attempts → submit từng part (id cũ → idempotent). FLAG coordinator: đụng 1 effect SF-4 ngoài "wire submit".
6. **Part done suy từ `accuracy >= 1`** (không đổi schema; extra-token là edge chấp nhận — ghi evidence).

## Tasks
1. `lib/gamification/streak.ts` (vnToday, computeStreak) + tests — TDD RED→GREEN
2. `lib/gamification/attempt-key.ts` (client stable uuid) + tests — TDD
3. `lib/actions/submit-attempt.ts` (transaction, guard published, FOR UPDATE, idempotent)
4. `lib/gamification/queries.ts` (leaderboard, myStats, bookProgress, heatmap) + messages gamification
5. Trang `/top-users` + `/me` + components gamification (leaderboard-table, stats-cards, heatmap)
6. Header UserMenu: XP + streak + links (readMyStats action + event refresh)
7. Wire dictation-lesson (submit effect + guest commit) + login-banner `?next=`
8. `e2e/progress.spec.ts` (đăng ký → học → XP header → học lại không tăng → double-Enter → /me → guest → login giữa chừng → commit → /top-users)

## Verify
- Unit: streak 3 case bắt buộc + chain/gap; attempt-key dedup; không regression 159 test cũ
- E2E progress flow + 6 test SF-4 không vỡ
- tsc + eslint sạch; Rule 0 browser 3 tầng (DOM/visual/flow guest→login giữa chừng→leaderboard)
- ACCEPTANCE từng dòng context pack §ACCEPTANCE
