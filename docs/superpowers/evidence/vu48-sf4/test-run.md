# VU-48 SF-4 — Evidence test-run

## Environment
- DB: `ilec_dj_sf4` (local clone từ `ilec_dev`, migration journal tới `0007_daily_journey_foundation`; seed words 42 / books 7 / lessons 41 / profiles 357)
- ⚠ Env note (root-cause của 7 fail sweep đầu): `.env.local` copy từ primary mang `BLOB_READ_WRITE_TOKEN` → `storageDriver()`=blob → `resolveAudioUrl` trả path tương đối nguyên văn → audio 404 trên dev local (DB dùng path, không phải CDN URL). 7 fail sf3 (progress* XP specs) là **env misconfig, không phải code** — chứng minh: fail cả trên base `0409bc8` + fail trên DB `ilec_sf3`; PASS ngay sau khi bỏ token. Token đã bỏ khỏi `.env.local` (gitignored) cho worktree này.

## Sweep-33 — VÒNG KẾT LUẬN S6 (directive coordinator sau ~30 vòng)
- **15/16 e2e suites PASS** liên tiếp 1 lượt: sf3 26 · sf4 46 · today 11 · vocabulary 2 · vocabulary-quiz 3 · vocabulary-lookup 1 · vocabulary-hub 7 · vocabulary-hub-quiz 4 · vocabulary-learn 4 · vocabulary-dashboard 6 · vocabulary-learn-session 5 · vocabulary-review-upgrade 5 · top-users-vocab 3 · dictation 114 · oxford 7
- **vitest PASS 1029** · **typecheck PASS** · **build PASS**
- **rls: PASS-BASE-PARITY 6 fail** (bộ fail đã biết — chứng minh trên base `0409bc8` cùng DB: 6/20 như HEAD; SF-4 diff không đụng scripts/ hay schema)
- **FAIL còn lại 1/16 suite (trung thực, không nuốt)**: `oxford-fullchain.spec.ts:237` "full-chain: review session audio Blob" — fail 2/2 attempts TRONG sweep-condition (sweep 32, 33), retries 1 guard đã bật (không che được); standalone HEAD PASS nhiều lần + **base `0409bc8` standalone PASS** → root-cause class: dev-hiccup/RSC trong chuỗi 14 suites trước (audio-Blob play + grading POST), KHÔNG phải regression SF-4 (surface oxford/crawl là read-only co-existence VU-32, SF-4 không đụng). Recommend follow-up: điều tra dev-server stream stability khi chạy chuỗi >14 suites.
- Tổng số vòng sweep: 33 (fix từng lớp: env-token → DB-content base-parity ×5 → race hydration/pre-hydration ×7 → cache/CDP guest-session → compile-cold timeouts). Mọi fix là e2e-hardening; app code KHÔNG đổi vì flake (boundary).

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
