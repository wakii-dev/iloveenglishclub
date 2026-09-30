# Findings registry — MERGED (toàn story QA hardening VU-24)

Merge một lần của `findings-sf{1..6}.md` (SF-6 task 10, spec VU-24 §4). Row format:
`QA-<n> | Sev | Surface | Repro | Root cause | Fix commit | Regression test | Status | Evidence`.
Chi tiết đầy đủ từng row (repro/root-cause/evidence dài) giữ nguyên ở file per-SF —
bảng này là bản tổng hợp có trỏ nguồn. **Verification AC#2: 0 OPEN** (mới nhất: QA-7
OPEN của SF-1 đã fix trong SF-6 — 9716d6f).

Đếm cuối story: **17 FIXED · 7 BY-DESIGN · 7 DEFERRED + 1 residual note (đủ sign-off + Recommendations) · 0 OPEN.**

## FIXED (20)

| ID | Sev | Surface | Tóm tắt | Fix commit | Regression | Nguồn |
|---|---|---|---|---|---|---|
| QA-1 | P1 | infra/test-data | DB `ilec` dơ chéo run (unit e2e cũ) làm test rls sai | (hygiene) DELETE FK-order | chính test rls | sf1 |
| QA-2 | P1 | infra/e2e-runner | `reuseExistingServer` bắt nhầm server worktree khác DB khác → 5/6 timeout | (ops) kill + khuyến nghị `!CI` — đã áp 9716d6f | — | sf1 |
| QA-7 | P1 | infra/e2e-runner | `next dev --turbopack` webServer chết 1/4-1/7 lần start (race font) — suite fail trắng | 9716d6f (SF-6) — 6 webServer → webpack dev | probe boot 3/3 + audit RED | sf1→sf6 |
| QA-101 | P1 | e2e config sf2 | testMatch regex khớp path tuyệt đối — nhặt sai 17 tests/4 files | commit task sf2-1 | `--list` 6/1 file | sf2 |
| QA-102 | P2 | dictation input | >2000 ký tự: server reject silent, UI im lặng — XP mất âm thầm | commit task sf2-3 | e2e QA-102 RED→GREEN | sf2 |
| QA-103 | P1 | part-nav › | `›` nhảy advance-to-pending (part 3) thay vì part kề bên | commit task sf2-6 | unit `nextPart` + e2e RED→GREEN | sf2 |
| QA-106 | P1 | a11y keyboard trap | Tab bất kỳ → preventDefault + replay — không Tab-ra được (WCAG 2.1.2) | commit task sf2-10 | e2e focus DI CHUYỂN RED→GREEN | sf2 |
| QA-107 | P2 | tabs row mobile 390 | tabs row tràn — XP chip cắt, Part label trôi | commit task sf2-10 | boundingBox assert RED→GREEN | sf2 |
| QA-200 | P1 | auth `next` guard | open-redirect `//evil.com` + `/\evil.com` (WHATWG) → Application error | af52872 + review-P0 commit | e2e 2 probe RED→GREEN | sf3 |
| QA-302 | P1 | admin units | create/update unit thiếu `revalidateTag` — public stale 300s | 8bf43a1 | unit revalidate + e2e probe RED→GREEN | sf4 |
| QA-303 | P1 | split script | >200 câu chèn ngầm 200 + toast đếm raw — data loss không báo | commit sf4 task 6 | parts-logic contract RED→GREEN + e2e | sf4 |
| QA-304 | P2 | split i18n | nút "Gộp với dòng dưới" render key thô `merge` (thiếu key cả 2 locale) | 4dfbb49 | e2e click theo label RED→GREEN | sf4 |
| QA-401 | P2 | seo auth pages | login/register: 0 canonical/hreflang/og + description EN cứng | 7352829 | e2e metadata 4 test RED→GREEN | sf5 |
| QA-501 | P1 | db/compat delete | PG17+ RESTRICT raise 23001 ≠ 23503 — admin 500 thay vì toast hasAttempts; test-rls sẽ FAIL trên prod PG18 | 40b56ec (SF-6) | unit mock 23001 RED→GREEN + superset assert | sf6 |
| QA-502 | P1 | infra/env | `.env.local` worktree chính trỏ Neon PROD — test suite suýt chạy trên prod | (ops coordinator) env → localhost ilec | — (ops) | sf6 |
| QA-503 | P1 | infra/build | `next build` fail lint react/no-children-prop (error.test.ts) — không có artifact prod | c9ed6c0 (SF-6) | build RED→GREEN | sf6 |
| QA-505 | P2 | e2e admin-users (test-race) | click combobox trên trang chưa settle/pre-hydration → dropdown không mở, option không render (RED 4/4 sf4 config) | thiếu chờ settle + click pre-hydration (product OK — probe dropdown mở đẹp) | 8c80401 (`pickRole` click-with-retry) | RED 4/4 → GREEN 4/4 (28.8s) | sf6 |

> 16 rows FIXED đủ ở bảng trên (gồm fix hygiene/ops không có commit code: QA-1,
> QA-2, QA-502). Chi tiết per-row đầy đủ = nguồn sf1/sf2/sf3/sf4/sf5/sf6.

## BY-DESIGN (4 + seed re-verified)

| ID | Surface | Hành vi | Rationale (nguồn) |
|---|---|---|---|
| QA-3 | dictation | relaxed toggle giữa chừng đổi mode check ngay | thiết kế VU-15 §3.8 — re-verify SF-2 (sf2 QA-104 khớp) |
| QA-4 | admin/split | naive splitter cắt viết tắt sai — manual fix là path chính | v1 by-design (sf1 seed) |
| QA-5 | public | transcript/audio không cần đăng nhập | core free (sf1 seed) |
| QA-6 | dictation | guest commit 1 tab (sessionStorage) | v1 by-design (sf1 seed) |
| QA-104 | relaxed XP giữ mức check đầu | XP bank attempt đầu = contract §5.5 | sf2 (re-classify BY-DESIGN kèm e2e) |
| QA-300 | baseline admin config testMatch thoáng | boundary: không sửa baseline — config sf4 anchored | sf4 |
| QA-402 | JSON-LD nested `@context` | JSON-LD 1.1 hợp lệ, Google parse OK | sf5 |

## DEFERRED (6 — rationale + sign-off, chi tiết qa-recommendations.md §4)

| ID | Sev | Nội dung | Sign-off nguồn |
|---|---|---|---|
| QA-105 | P2 | mobile tap targets < 44 (WCAG AA 24px PASS) | epic 19:13 29-09 — default-approved |
| QA-106 residual | P2 | Tab trong textarea không Tab-ra (literal spec §5) | cùng batch 19:13 — đề xuất exempt Shift+Tab ở direction B |
| QA-108 | P2 | header chrome mobile 390 (direction B sở hữu) | cùng batch 19:13 |
| QA-201 | ENV-LIMIT | OAuth Google cần creds | env-matrix ghi nhận; sign-off PM theo comment epic |
| QA-202 | P2 | guest relaxed commit drift (cap 10 XP/part, không corrupt) | out-of-scope schema — PM sign-off trong comment epic |
| QA-305 | P2 | khóa user thiếu cột `profiles.banned` | REQUIREMENT-GAP VU-15 trong code + spec §4 |
| QA-504 | P2 | `/admin/users` cắt im lặng ở 20 user mới nhất (limit 20, không phân trang — search vẫn tìm được) | DEFERRED product enhancement — pagination/count indicator; sign-off PM (batch audit comment SF-6) |
| QA-506 | P2 | dict baseline lane (113 test) + sf2 lane flake — fail ngẫu nhiên 1-10 test/round, khác nhau mỗi round; toàn bộ PASS isolated + prod build Rule 0 15/15 | DEFERRED test-infra robustness (hydration-retry helpers, tách lane, CI retry) — owner tier-1; sign-off PM (batch SF-6) — chi tiết sweep-final.md |

## Conclusion

- **0 OPEN** trên toàn story. Mọi FIXED có fix commit + regression RED→GREEN (hoặc
  ops-hygiene có evidence). Mọi BY-DESIGN/DEFERRED có rationale + sign-off nguồn và
  DEFERRED đều nằm trong Recommendations.
- Prod state: DB sạch 0 test data (dry-run 30-09 — prod-cleanup-dryrun.md); Blob
  chưa kiểm (GAP #3d) — liệt kê rõ, rủi ro orphan thấp (0 content `[QA*]` trên prod).
