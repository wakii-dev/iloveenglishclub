# VU-48 Daily Journey — Merge runbook (human gate)

> SF→issue→branch→merge-hash map + hướng dẫn merge thủ công. Coordinator owns
> Story CLOSE (PR dest→primary). KHÔNG auto-merge từ agent.

## 1. Map SF → Linear issue → branch

| SF | Linear | Branch (merge vào dest) | Merge hash | Ghi chú |
|----|--------|------------------------|------------|---------|
| SF-1 libs + migration 0007 | VU-49 | (merged trước checkpoint) | — | planFreezes/computeStreak pure + 4 bảng ledger |
| SF-2 snapshot + engine | VU-50 | (merged trước checkpoint) | — | today-store + /api/today/goal |
| SF-3 /today UI + nav dot | VU-51 | (merged trước checkpoint) | — | hero/quests/badges + e2e 3211 |
| SF-4 shield wiring + /me + convergence | VU-52 | `story-vu48-daily-journey-sf-4` | _điền sau merge_ | recomputeStreakTx + 2 write-paths + e2e 3321 |

Dest story branch: `story-vu48-daily-journey` · Primary: `story-vu15-iloveenglishclub`.

## 2. Merge SF-4 vào dest (người chạy)

```bash
git fetch origin
git checkout story-vu48-daily-journey && git pull
git merge --no-ff story-vu48-daily-journey-sf-4   # resolve nếu ghi đè lockfile: chấp nhận CỦA SF-4
npm ci && npm run build                            # smoke
npm test && npm run test:e2e:today                 # re-verify nhanh 2 suite then-chốt
git push origin story-vu48-daily-journey
# Điền merge hash vào bảng trên + comment VU-52
```

## 3. Checklist Story CLOSE (coordinator)

- [ ] SF-4 merged, MERGEABLE dest→primary (PR mở bởi coordinator)
- [ ] Convergence evidence: MỌI `test:e2e:*` + vitest + rls (3 base-parity fail loại trừ) + typecheck + build xanh liên tiếp 1 lần — xem `docs/superpowers/evidence/vu48-sf4/`
- [ ] Security checkpoint 0 P0/P1 (P2 documented) — xem evidence/security-audit.md
- [ ] Browser acceptance screenshots (shield A/B + /me badges + /today protected) — xem evidence/screenshots/
- [ ] Linear VU-52 close-out comment posted
- [ ] story-verify sf-4 xanh (gates B1/B3 — B4/B5 coordinator)
