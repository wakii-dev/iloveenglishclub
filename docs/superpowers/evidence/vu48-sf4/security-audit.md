# VU-48 SF-4 — Security checkpoint (cuối story)

Agent: security-audit độc lập · Diff `0409bc8..HEAD` · 2026-10-14

## VERDICT: CLEAN (0 P0/P1) — approved cho story close

## Surface đã audit (tất cả ĐẠT)
1. `/api/today/goal` — auth session-only userId, Number.isInteger + range 5..120, 401/400/500 phân loại sạch, không rò rỉ internal.
2. Snapshot auto-record tx (today-store) — monthly grant ledger-guarded (INSERT shield_grants ON CONFLICT + RETURNING-gated `least(+1,2)`), quest/badge ledger ON CONFLICT DO NOTHING; KHÔNG read-path nào consume.
3. **Shield consume (SF-4)** — FOR UPDATE precondition cả 2 caller (submit-attempt:102-110, vocab-xp-store:65-69); freeze-merge contract chống double-burn (planFreezes trên daily_activity ∪ existing freezes + PK idempotent, pinned test); burn bounded cap 2 + credits-bounded; TZ vnToday nhất quán toàn chuỗi.
4. Rewire write-paths — anti-farm giữ nguyên (count-before-insert, idempotency keys, XP-first-only, server recompute); không SQLi (drizzle parameterized toàn bộ); không dead code (inline block cũ xoá sạch).
5. Read-only freeze reads (dashboard-store + today-store) — SELECT thuần; writers toàn nền: duy nhất `recomputeStreakTx` (streak-store.ts:76) + grant least-guarded (today-store.ts:531).
6. `/me` — mọi read theo session userId sau auth redirect; không IDOR.
7. E2E fixtures — QA users `qa-today-*@test.ilec` prefix + teardown cleanup; static bcrypt hash test-only.
8. Repo hygiene — 0 secrets, 0 exec-bit mới, i18n JSON well-formed ×4, lockfile không đổi.

## P2 documented (không chặn)
| ID | Vấn đề | Khuyến nghị |
|----|--------|-------------|
| P2-1 | Không rate-limit `/api/today/goal` (pattern chung các route authed, không do SF-4 tạo) | throttle app-level nếu surface lớn hơn |
| P2-2 | `vnToday` tính trước khi mở tx ở submit-attempt (đêm giao thừa VN — correctness only) | move 1 dòng vào trong tx — follow-up |

## Relay M-1 / M-2 từ Phase-1 checkpoint (epic VU-48) — đối chiếu surface SF-4
| ID | Finding Phase-1 | Đối chiếu SF-4 diff `0409bc8..HEAD` |
|----|-----------------|--------------------------------------|
| M-1 | Backfill idempotency | SF-4 KHÔNG chứa backfill path nào. Ledger SF-4 sở hữu đều idempotent: streak_freezes PK (user_id,date) ON CONFLICT + freeze-merge chống double-burn (pinned test); shield_grants RETURNING-gated; quest_completions/user_badges ON CONFLICT DO NOTHING. Backfill owner (audio backfill VU-46) out-of-scope — relay giữ nguyên. |
| M-2 | Credential echo | grep toàn src diff: 0 hit password/credential ngoài fixture QA (bcrypt tĩnh test-only, .env.local gitignored, ADMIN creds local-only không commit). KHÔNG echo. |

**VERDICT TỔNG SF-4: CLEAN (0 P0/P1)** — P2-1 rate-limit + P2-2 vnToday-trước-tx documented (không chặn).
