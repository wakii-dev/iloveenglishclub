# SF-4 Context Pack — Streak shield consumption wiring + /me + convergence QA + security checkpoint
> Đọc file này THAY VÌ tự tổng hợp từ story .wakii + epic + comments. Epic spec: `docs/superpowers/specs/2026-10-13-daily-journey-design.md` (v2). Story .wakii: `docs/superpowers/mindmaps/daily-journey.wakii`. Phase 2/2 — FINAL. SF-1 (libs+migration), SF-2 (snapshot+engine), SF-3 (/today UI + e2e 3321) đã merge; Phase-1 checkpoint audit đã sạch.

## Spec slice (chỉ phần SF-4 chịu trách nhiệm)
1. **`recomputeStreakTx(tx, userId, today)`** — `src/lib/gamification/streak-store.ts` MỚI: trong tx (với profiles row đã FOR UPDATE theo caller): (a) load daily_activity dates lookback + `streak_freezes` dates + `profiles.shield_credits`; (b) `planFreezes` (SF-1 pure — consume order, cap 2, lookback 7); (c) INSERT freeze rows `streak_freezes (user_id, date)` cho mỗi freezeDate kế hoạch (PK idempotent) + `UPDATE profiles SET shield_credits = creditsLeft`; (d) trả `computeStreak(dates, today, freezeSet)` (SF-1). CHỈ hàm này được tạo freeze rows.
2. **Rewire 2 write-paths** (thay inline-recompute, GIỮ nguyên mọi hành vi khác — tx shape, FOR UPDATE, idempotency):
   - `src/lib/actions/submit-attempt.ts` block ~167-177 → gọi `recomputeStreakTx` (tx đang có).
   - `src/lib/vocabulary/vocab-xp-store.ts` block ~158-169 → tương tự.
   - Identity guarantee: user 0 credit + 0 freeze → kết quả streak byte-identical trước/sau rewire (test pinned trên cả 2 path).
3. **`dashboard-store.ts` dòng ~106**: `getDashboardSummary` streak chuyển LIVE freeze-aware (đọc freeze-set như today-store SF-2 — KHÔNG consume).
4. **`/today` shield active state** (files SF-3, additive nhỏ): khi snapshot.shield.freezes có date covering gap gần nhất → `TodayStreakCard` hiển thị "được bảo vệ" (state active Phase 2).
5. **`/me` integration** (spec §1 + §4): `/me` page + `StatsCards` — thêm badge section (REUSE components strip SF-3 — KHÔNG viết component mới) + streak card shield hint ("còn N shield"); heatmap + `getMyStats` KHÔNG đổi semantics (verify). i18n keys vào `messages/{en,vi}/gamification.json` (namespace `me.*`) — vi/en parity.
6. **E2e `today-shield.spec.ts`** (vào config 3321 sẵn): user A: seed daily_activity HÔM NAY + HÔM KIA (bỏ trống HÔM QUA = gap 1 ngày) + credits 1 → hoạt động lại hôm nay ⇒ streak tính TỪ HÔM KIA (freeze row hôm qua tạo, credits −1); user B: cùng seed, 0 credit ⇒ streak = 1 (chỉ hôm nay — semantics `computeStreak` thật). Verify header cache + live khớp sau write.
7. **Convergence QA**: full sweep MỌI `test:e2e:*` package.json (kể 3310/3319/3320/3321/3330/3340/3210/3211/3212...) liên tiếp xanh; `npm test` vitest; `npm run test:rls`; typecheck; build; back-compat sweep URL cũ + guest flows; a11y/mobile 375 sweep các thay đổi; VU-32 coexistence (`words` read-only) + VU-43 admin không regression.
8. **Security-audit checkpoint cuối** (agent security-audit, OWASP surface + repo-hygiene): surface mới toàn story — `/api/today/goal` (auth/scoping/validation), snapshot auto-record tx (idempotency, no-farm), shield consume (race, timezone, credit burn), rewire write-paths (không regress anti-farm XP), secrets/.env/exec-bit trong diff. Sạch P0/P1 mới STORY-COMPLETE.
9. **Runbook + evidence pack + PR prep**: SF→issue→merge-hash map, hướng dẫn merge cho người, evidence screenshots.

## Touch map (files SF-4 tạo/sở hữu)
```
src/lib/gamification/streak-store.ts + .test.ts   CREATE
e2e/today-shield.spec.ts                          CREATE
src/lib/actions/submit-attempt.ts                 MODIFY (recompute block ~167-177 — hunk duy nhất)
src/lib/vocabulary/vocab-xp-store.ts              MODIFY (recompute block ~158-169)
src/lib/vocabulary/dashboard-store.ts             MODIFY (dòng ~106 streak live freeze-aware)
src/app/(public)/[locale]/me/page.tsx             MODIFY (badge section + shield hint)
src/components/gamification/stats-cards.tsx       MODIFY (shield hint)
src/components/today/today-streak-card.tsx        MODIFY (additive: "được bảo vệ" state)
messages/{en,vi}/gamification.json                MODIFY (me.* keys mới)
docs/superpowers/... runbook/evidence             CREATE
```
READ-ONLY: pure libs SF-1 (planFreezes/computeStreak — import), `today-store.ts` + API (SF-2), page/components khác SF-3 (chỉ streak-card additive), e2e configs khác, `queries.ts` (getMyStats KHÔNG đổi), `daily-plan*.ts` (dead).

## ACCEPTANCE (user-visible / nghiệm thu)
- Browser (seed fixture): user A lỡ hôm qua (có credit) học lại hôm nay ⇒ streak card + header streak KHÔNG đứt (bằng mạng: số giữ liên tục từ hôm kia); user B không credit ⇒ streak = 1. Freeze row + credits −1 đúng (DB check).
- Hoạt động dictation + vocab đều chạy qua recompute mới mà streak/XP/daily_activity hành vi như cũ (identity tests + suites cũ xanh).
- `/me`: thấy badge đã nhận + shield hint ("còn N shield"); heatmap/vô hiệu hóa semantics như trước (screenshot so).
- `/today` streak card hiện "được bảo vệ" khi có freeze covering gap.
- MỌI `test:e2e:*` + vitest + rls + typecheck + build xanh liên tiếp một lần (convergence run ghi evidence).
- Security-audit: 0 P0/P1 (P2 phải documented).
- STORY-COMPLETE checklist: PR dest→primary mở + MERGEABLE (coordinator chạy — xem skill story-workflow CLOSE).

## Boundary (KHÔNG làm)
- KHÔNG đổi XP rules / SRS / idempotency keys / leaderboard view.
- KHÔNG đổi goal engine semantics + quest/badge pools (SF-1/2 sở hữu).
- KHÔNG thêm tính năng mới ngoài spec (email/push, claim, shop, admin CRUD...).
- KHÔNG merge PR vào primary (human gate) — agent chỉ push dest + mở PR + verify MERGEABLE.
- KHÔNG đụng `daily-plan*.ts` (dead), admin VU-43, crawl VU-32.
