# Findings registry — SF-3 Auth/session + progress/gamification

Dải ID: **QA-200–299** (contract: findings-sf1.md — row format spec VU-24 §4).

## Findings

| ID | Sev | Surface | Repro | Root cause | Fix commit | Regression test | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| QA-200 | P1 | auth/login — `next` open-redirect guard | `/en/login?next=//evil.com/pwn` → login đúng tài khoản → trang nổ "Application error" (client-side exception), user không vào được app | Guard server+client chỉ `startsWith("/")` — protocol-relative `//evil.com` VƯỢT guard; NEXT_REDIRECT đẩy Next router push external URL → exception. evilHit=null (không có request off-origin — open-redirect thực sự bị Next chặn, nhưng UX vỡ hoàn toàn) | (commit task 3) `internalNext()` trong `src/app/actions/auth.ts` + guard `!startsWith("//")` trong `login-form.tsx` | `e2e/progress-login.spec.ts` probe protocol-relative (RED 30s timeout trên code cũ → GREEN sau fix; evilHit=null + hostname localhost + không Application error) | FIXED | mutation RED run 30/09; test:rls 18/18 sau fix |

> Chưa có finding. Ghi theo format trên; mọi BY-DESIGN/DEFERRED bắt buộc rationale. SF-6 merge tất cả về findings.md (AC#2: 0 OPEN).
