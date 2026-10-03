# Convergence pack — Vocabulary Hub — ILEC

Sinh: 2026-10-04

## SF
- sf-1 [done] Navbar item + hub shell + tab Tổng quan (aggregate my-words)
- sf-2 [done] Tab Thư viện (search/filter/pagination toàn bộ từ — gồm từ độc lập)
- sf-3 [done] Review SRS tổng (rebrand) + Quiz tổng (scope book/all/multi)

## Bằng chứng
- vitest 498/498 (hub contract 14+13 + SRS/quiz/parse scope mới; không rớt test cũ)
- e2e: hub-overview 4/4 · hub-quiz 4/4 (sau fix race grading + fixture cleanup) — 2 lượt liên tiếp
- typecheck 0 · lint 0 errors
- Navbar item "Vocabulary" i18n vi/en · guest: Thư viện mở, Tổng quan redirect login

## Việc sau merge
- migration 0003 ĐÃ áp lên DB trước PR (quiz_attempts.book_id nullable — additive)
- Deploy Vercel tự chạy sau merge PR

## Flow
Kit workflow portable: coordinator launch thủ công (ILEC ngoài Linear) + 3 worker
passes + PR = cửa user duyệt (driver không merge).
