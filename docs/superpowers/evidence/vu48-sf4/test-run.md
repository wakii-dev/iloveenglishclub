# VU-48 SF-4 — Evidence test-run

## Environment
- DB: `ilec_dj_sf4` (local clone từ `ilec_dev`, migration journal tới `0007_daily_journey_foundation`; seed words 42 / books 7 / lessons 41 / profiles 357)
- ⚠ Env note (root-cause của 7 fail sweep đầu): `.env.local` copy từ primary mang `BLOB_READ_WRITE_TOKEN` → `storageDriver()`=blob → `resolveAudioUrl` trả path tương đối nguyên văn → audio 404 trên dev local (DB dùng path, không phải CDN URL). 7 fail sf3 (progress* XP specs) là **env misconfig, không phải code** — chứng minh: fail cả trên base `0409bc8` + fail trên DB `ilec_sf3`; PASS ngay sau khi bỏ token. Token đã bỏ khỏi `.env.local` (gitignored) cho worktree này.

## Chi tiết run (điền sau sweep)
Xem `convergence-run.md` — mọi `test:e2e:*` + vitest + rls + typecheck + build LIÊN TIẾP 1 LƯỢT.

## Suites SF-4 mới/sửa
| Suite | Kết quả | Ghi chú |
|-------|---------|---------|
| vitest streak-store.test.ts | 10/10 | identity + freeze-merge double-burn + cap + lookback |
| vitest vocab-xp-store.test.ts | 13/13 | +3 case SF-4 (identity/consume/gate) |
| vitest submit-attempt.test.ts | 5/5 | MỚI — identity dictation path |
| vitest learn-session-store.test.ts | 28/28 | mock-queue shift (2 awaits recompute) |
| vitest dashboard-store.test.ts | 20/20 | +freeze-aware LIVE read-only |
| e2e today-shield.spec.ts | 4/4 | A consume/identity B//me/mobile — port 3321 |

## Browser Rule-0 walkthrough (bằng mắt)
- `shield-userA-protected.png` — /today: "3 ngày" + box "Đang bảo vệ chuỗi — Khiên đã che ngày 2026-10-13 — chuỗi của bạn không đứt" + Credit: 0/2 + badge toast "Chuỗi 3 ngày" (milestone fire đúng)
- `shield-userB-neutral.png` — /today: "1 ngày" + shield box trung tính (copy MỚI — bỏ "sắp có mặt")
- `me-badges-shield-hint.png` — /me: streak tile hint "2 khiên còn lại", badge OWNED "Chuỗi 3 ngày" + locked kế tiếp, heatmap/books nguyên trạng
- `mobile-today-protected.png` / `mobile-me-badges.png` — 375px: layout sạch, không overflow
