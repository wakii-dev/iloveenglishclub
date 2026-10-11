# Security Audit — VU-43 Phase 1 checkpoint (2026-10-11)

Scope: `git diff 0f2b530..fb4052c` (SF-1+2+3, 72 files +12,300/−41) trên story worktree.
Auditor: security-audit agent độc lập (dispatch bởi coordinator). Verdict nguồn: agent report 2026-10-11.

**PHASE-1 AUDIT: CLEAN (0 P0, 0 P1) — 4 P2 documented. Approved for Production: PASS checkpoint.**

## Checklist (7/7 PASS)
1. Authz per method — 8/8 route file × mọi method `assertAdmin()` đầu tiên, DB role re-check; pages gate qua admin layout (server-side).
2. Input validation — caps 500/200/100 + export 10k + scopeRequired + meanings validate-trước-mutation + mime 2MB + `escapeLikePattern` ở cả 2 store.
3. SSRF — fix P0 của SF-1 còn nguyên: host allowlist (dot-suffix chặn lookalike), 15s timeout, 2MB cap, re-check host sau redirect.
4. Injection — 100% drizzle parameterized; advisory lock key bookId (sort tăng dần chống deadlock), key space khớp bulk/promote; CSV filename cố định.
5. Secrets/hygiene — 0 secrets/exec-bit/lockfile-churn/file-lạ trong diff; cleanup helper dry-run mặc định.
6. DoS/cost — pagination clamp 200; count admin-only + index-supported (migration 0007); image upload có auth.
7. Cascade — dry-run 0 mutation; apply đếm `progressAffected` TRƯỚC vòng xoá.

## P2 findings (khóm vào Phase 2 — SF-4)
| ID | Vấn đề | Vị trí | Fix |
|---|---|---|---|
| P2-1 | CSV formula-injection (cell `=` `+` `-` `@` không neutralize) | `export-csv.ts:38-43` | prefix `'` khi `/^[=+\-@\t\r]/` + test pin |
| P2-2 | Promote `meaning_vi` không cap 500 (CRUD path có cap) | `crawl/promote/route.ts:38-41` | `> MEANING_MAX → meaningRequired` |
| P2-3 | Backfill `scope.wordIds` unbounded (inArray >65535 params → 500) | `audio-backfill/route.ts:39-43` | cap 500 trong `scopeFromBody` |
| P2-4 | Image mime tin `file.type` client (không magic-byte sniff) | `image/route.ts:58` | sniff PNG/JPEG/WebP signature |

P2-1 + P2-2: fix trong SF-4 (nhỏ, 1-3 dòng + test). P2-3 + P2-4: batch hardening follow-up, ghi improvements-log.

## Informational (không phải finding)
- Layout/page render song song: data load chỉ book id/slug/title — không leak.
- `offset` không cap — deep-offset admin-only.
- `createVocabularyWord` giữ advisory-lock-race pattern cũ (23505 → 500, không corrupt) — pre-existing theo schema comment.
