# Plan: SF-4 Streak shield consumption wiring + /me + convergence QA (VU-52)
Date: 2026-10-14 | Linear: VU-52 | Worktree: sf-4-daily-journey
Spec: `docs/superpowers/contexts/daily-journey/sf-4.md` (Phase 2/2 FINAL) · Epic: `docs/superpowers/specs/2026-10-13-daily-journey-design.md` v2

## 0. WHY
Shield SF-1/SF-2 display-only: `planFreezes`/`computeStreak` pure nhưng không path nào viết `streak_freezes` hay trừ `shield_credits` — user có credit vẫn mất streak khi lỡ ngày. SF-4 nối consumption vào 2 write-paths theo identity guarantee (0 credit + 0 freeze ⇒ byte-identical), rồi convergence QA toàn nền + security checkpoint để story CLOSE được.

## 1. Problem (intent, NOT solution)
User mua shield bằng nỗ lực (daily goal) nhưng cơ chế chưa "ăn" credit — hứa hẹn "streak không đứt" chưa đúng thực tế. Cần consume đúng một chỗ, không đổi bất kỳ hành vi XP/idempotency/quest nào.

## 2. Scope
- In scope: `recomputeStreakTx` (freeze-write owner DUY NHẤT) + rewire `submit-attempt` / `awardVocabXpTx`; dashboard streak LIVE freeze-aware; `/today` "protected" state; `/me` badge strip + shield hint; e2e `today-shield.spec.ts` (3321); convergence sweep; security-audit; runbook/evidence.
- Out of scope (boundary): XP rules/SRS/idempotency keys/leaderboard; goal engine/quest/badge pools; `daily-plan*.ts`; admin VU-43; crawl VU-32; `queries.ts`/`getMyStats` semantics; `today.json` i18n (flagged VU-48); PR merge (coordinator).
- Success criteria: ACCEPTANCE mục context pack — identity tests 2 path xanh; e2e shield A/B đúng; MỌI `test:e2e:*` + vitest + rls (3 base-parity fail loại trừ) + typecheck + build xanh liên tiếp 1 lần; security-audit 0 P0/P1.

## 3. Touch map
- CREATE: `src/lib/gamification/streak-store.ts` + `.test.ts`; `e2e/today-shield.spec.ts`; `src/lib/actions/submit-attempt.test.ts` (identity dictation path); `docs/superpowers/runbooks/2026-10-14-vu48-merge-runbook.md` + evidence.
- MODIFY: `src/lib/actions/submit-attempt.ts` (hunk recompute duy nhất ~175-184); `src/lib/vocabulary/vocab-xp-store.ts` (~157-169); `src/lib/vocabulary/dashboard-store.ts` (streak ~109 — giữ fallback try/catch); `src/components/today/today-streak.tsx` (additive protected state + prop); `src/app/(public)/[locale]/me/page.tsx` (badge strip reuse + shield hint + inline reads); `messages/{en,vi}/gamification.json` (`me.shieldHint`…); `e2e/today-fixture.ts` (additive shield users A2/B2).
- KHÔNG modify (khác touch map dự kiến): `stats-cards.tsx` — data-driven qua `items: {label, value: ReactNode}` đủ dùng, shield hint nhét vào streak tile value từ page.tsx (ít blast radius hơn).
- READ-ONLY: SF-1 pure libs (import), today-store + `/api/today/goal` (SF-2), SF-3 components khác, e2e configs khác.

## 4. Design
- Approach **A — write-time tx rewire, shared helper** (Phase 0: reject consume-on-read — credit burn khi browse + 5 store blast; reject per-path inline — duplicate freeze-merge contract = drift).
- `recomputeStreakTx(tx, userId, today)` — PRECONDITION: caller đã `SELECT profiles ... FOR UPDATE` trong cùng tx (kiểu `Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]`):
  1. Load `daily_activity` dates (limit 400 desc, pattern hiện hành) + `streak_freezes` dates (limit đủ lookback+streak: 400) + `profiles.shield_credits`.
  2. `planFreezes(activeDates ∪ existingFreezeDates, today, credits)` — **freeze-merge contract** (chống double-burn khi recompute lặp cùng ngày: INSERT no-op PK nhưng UPDATE credits vẫn chạy nếu không merge).
  3. INSERT freeze rows `onConflictDoNothing` + `UPDATE profiles SET shield_credits = creditsLeft` (chỉ khi freezeDates > 0 — tránh write thừa).
  4. Return `computeStreak(dates, today, freezeSetAll)`.
- Identity: credits=0 ∧ freezes=∅ ⇒ planFreezes no-op ⇒ computeStreak(dates, today) — byte-identical (pin test 2 path).
- Gate asymmetry GIỮ NGUYÊN (design, không "sửa"): dictation recompute theo `isFirstToday` (first-attempt-per-part), vocab theo `!existingToday` (day-transition).
- Dashboard LIVE: read freeze-set pattern today-store (`select date from streak_freezes where user_id`) → `computeStreak(dates, today, freezeSet)` — KHÔNG consume, giữ fallback 0.
- `/today` protected: `TodayStreakCard` nhận thêm prop `freezeDates: string[]` (snapshot.shield.freezes đã có từ SF-2); protected = có freeze date nằm trong gap kế trên streak hiện tại (freeze ∈ window giữa last-active-date tiếp liền và hôm nay) → banner "được bảo vệ" thay/ vendor mô tả shieldDesc trung tính.
- `/me`: `TodayBadgeStrip` reuse nguyên khối (owned ids đọc inline `user_badges`); shield hint = key `gamification.me.shieldHint` ("Còn N khiên…") gắn streak tile; heatmap/books không đổi.
- E2E (3321, config `playwright.today.config.ts`): fixture ADDITIVE user A2 (`qa-today-shield-a@…`, credits=1, daily_activity hôm-nay-kia + hôm-nay, shield_grants tháng hiện tại pre-seed CHẶN auto-grant) + B2 (credits=0, cùng dates). A2 làm 1 part dictation mới ⇒ streak nhảy về tính từ hôm-nay-kia (≥2), freeze row hôm-qua + credits 0; B2 tương tự ⇒ streak = 1, không freeze row. Header streak & `/today` card khớp sau write. B cũ (assert "Credit: 0/2") không đổi.

## 5. Implementation outline (TDD từng slice, atomic commits)
- [ ] S1 `streak-store`: `recomputeStreakTx` + tests (identity, freeze-merge double-burn, cap 2, PK idempotent, credits UPDATE) — vi.mock @/db chain pattern vocab-xp-store.test.ts
- [ ] S2 rewire 2 write-paths + identity tests: `submit-attempt.test.ts` (mới) + cập nhật mock queue `vocab-xp-store.test.ts` (thêm freezes read) — giữ nguyên mọi hunk khác
- [ ] S3 `dashboard-store.ts` LIVE freeze-aware + test
- [ ] S4 `/today` protected state (`today-streak.tsx` + snapshot prop) + `/me` (page.tsx badge strip + hint) + i18n `me.shieldHint` vi/en — browser Rule-0 walkthrough port 3322
- [ ] S5 e2e `today-shield.spec.ts` + fixture additive — workers:1, dùng DB `ilec_dj_sf4` qua E2E_PORT 3321 riêng
- [ ] S6 convergence: liên tiếp MỌI `test:e2e:*` (sf3, sf4, vocabulary*, dictation, oxford*, today, top-users-vocab, hub…) + `npm test` + `npm run test:rls` (3 base-parity fail loại trừ) + typecheck + build — evidence một lần xanh
- [ ] S7 security-audit agent (OWASP surface: /api/today/goal, snapshot tx, shield consume race/TZ/burn, rewire anti-farm; repo hygiene: secrets/exec-bit) + runbook merge + evidence pack + close-out VU-52

## 6. Risks (từ Phase 0, đã mitigation trong design)
1. Freeze-merge double-burn → union dates + pinned test (S1).
2. E2E drive sai path → pin dictation cho browser-level; vocab day-transition pin unit (S2).
3. Fixture auto-grant phá assert credits → pre-seed shield_grants tháng hiện tại (S5).
4. Streak >400 ngày không tồn tại — cap 400 hợp lý theo hiện hành.
5. Neon/local flake class → workers:1, port riêng 3321, kill stale dev server trước sweep.
