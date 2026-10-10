# VU-37 SF-5 — Convergence + QA (VU-42) — plan

Spec slice: `docs/superpowers/contexts/vocab-memrise/sf-5.md` · Epic spec: `docs/superpowers/specs/2026-10-04-vocab-memrise-design.md` (v2, §6.8 SQL-side + risk register) · Design hand-off USER-APPROVED: `docs/superpowers/designs/vocab-memrise/vocab-memrise-direction.md` (+ `proto-A.html` nguồn pixel) · Bracket: `docs/superpowers/plans/2026-10-04-vu37-bracket-plan.md` §SF-5.

Worktree `sf-5-convergence-qa` · base dest `wakii-dev/story-vu37-vocab-memrise` @ `f574323` (SF-1/2/3/4 đã merge) · Linear VU-42 (task orca `task_d21de9731856`).
Vai trò: **Tester độc lập** — chứng minh đầu-cuối + tìm lỗi; fix NHỎ thuộc surface có sẵn làm trực tiếp + ghi audit; tính năng mới/mở scope → KHÔNG, report.
Boundary: KHÔNG merge PR (coordinator) · KHÔNG set Linear Done · KHÔNG đụng VU-32 admin crawl ngoài dry-run · KHÔNG seed/hít prod data · KHÔNG xoá evidence/decision · KHÔNG sửa engine/design theo ý riêng.

Quyết định path evidence: context pack ghi `evidence/vocab-memrise/convergence/` nhưng gate story-verify B1 glob `evidence/sf-5*/test-run.txt` (FI-440 sai slug = FAIL loop) → dùng `docs/superpowers/evidence/sf-5-convergence-qa/` (slug worktree, convention SF-3), runbook nằm trong đó.

## Phase 0 (compact — epic đã P0; context pack = impact analysis)

- **Touch map**: evidence dir mới + runbook · `e2e/top-users-vocab.spec.ts` + config port **3340** (3320 trùng oxford-crawl — review P1; coverage /top-users vocab-only THIẾT — progress-leaderboard.spec chỉ phủ guest view) · `scripts/rehearsal-vocab-5k.ts` temporary (xoá sau chạy) · aggregator lane package.json · fix nhỏ file SF-1..4 khi bug rõ.
- **Multi-dim**: functional (8 ACCEPTANCE) · arch/data (9 suite chung Neon → chạy TUẦN TỰ workers:1, fixture qa-* prefix riêng; rehearsal teardown SẠCH) · perf (session build + dashboard aggregate < vài trăm ms @5k; query-shape vitest SF-2 giữ xanh) · security (session POST grading/idempotency/scoping/injection; goal PATCH auth; secrets/exec-bit/lockfile) · backward-compat (?tab/?word/?scope/scope=all/guest redirect/404 learn lạ) · UX (keyboard, reduced-motion, touch ≥44, 375 screenshots) · ops (Linear 429 → wrapper; kill stale server; E2E_PORT riêng) · maintenance (runbook cho người merge) · skip: business (epic chốt), migrations (SF-5 không có migration mới).
- **Direction A** (duy nhất dưới boundary): tái sử dụng 9 suite + suite top-users (port 3340) cho lỗ coverage + rehearsal script temporary; B (framework coverage mới) bị cấm mở scope.
- **Rủi ro**: ISR 60s /top-users → seed TRƯỚC server bind (pattern fixture lanes) · dev server stale chéo worktree (QA-2) → kill ports trước · node24 strip-only cho script (cấm parameter properties).

## Tasks

- [x] T1. Baseline env + aggregator lane: npm ci + `.env.local` (đã làm đầu run) · kill ports 3310–3320 · xác nhận `test:e2e:vocabulary-review` (3311) VẮNG khỏi package.json · thêm lane `test:e2e:vocab-convergence` chạy 9 suite TUẦN TỰ (3310, 3312, 3313, 3314, 3315, 3316, 3317, 3318, 3319) fail-fast · DB connectivity sanity
- [x] T2. Full vocab suites liên tiếp XANH (context pack mục 3): chạy aggregator 1 lệnh → log đầy đủ evidence; đỏ → fix nhỏ thuộc surface (ghi audit) → re-run đến khi liên tiếp xanh trong MỘT lần chạy — **`test:e2e:vocab-convergence` EXIT 0: 10 lane / 40 tests liên tiếp** (fix: 12 từ qa-ls mồ côi xoá; hub-library 3 test stale; learn-flow 2 test stale + fixture streak daily_activity)
- [x] T3. Back-compat sweep (mục 1): `?tab=library|quiz` nguyên trạng · `/me/vocabulary?word=<id>` prefill · `?scope=book&book=` · `href="/me/vocabulary?scope=all"` từ mọi nơi (grep callers) · guest → login redirect · 404 learn route book lạ — e2e có sẵn phủ phần nào thì trích, thiếu thì manual browser từng URL + evidence — `back-compat-sweep.md`
- [x] T4. Suite mới 3320 `top-users-vocab` (mục 2): config `playwright.top-users-vocab.config.ts` (E2E_PORT 3320, seed TRƯỚC server bind né ISR 60s) + fixture `qa-tu-*` (user vocab-only XP, 0 dictation) + spec: (a) user hiện bảng weekly `/top-users`; (b) all-time khớp `profiles.xp`; (c) `/me` streak giữ khi ngày chỉ học vocab (presence `daily_activity`) · lane `test:e2e:top-users-vocab` — **3/3 xanh**
- [x] T5. Rehearsal scale (mục 4): `scripts/rehearsal-vocab-5k.ts` (node strip-only) seed `qa-rehearsal-*` ~5k rows → đo learn-session build + dashboard aggregate (ngưỡng < 1s assertion, mục tiêu vài trăm ms) → query-shape vitest SF-2 (learn-session-store load-all assertions) vẫn xanh → teardown sạch verify 0 rows còn sót → XOÁ script; 6-từ degenerate prod-shape: 3310 fixture + walkthrough không crash
- [x] T6. a11y + mobile walkthrough tổng thể (mục 5): keyboard toàn phiên học + review + dashboard (e2e 3317 a11y + manual Tab/Enter/Space) · `prefers-reduced-motion` · touch ≥44px · screenshots 375 TỪNG màn hình (learn intro/MC/listen/type/summary, review, dashboard, hub, top-users, /me) → evidence PNG
- [x] T7. Design fidelity (mục 6): checklist đối chiếu `vocab-memrise-direction.md` từng màn (token/spacing/màu) + screenshot so `proto-A.html` → bảng chênh lệch; fix nhỏ trực tiếp / escalate — KHÔNG đổi direction
- [x] T8. VU-32 coexistence (mục 7): gọi enrich `dryRun:true` (admin API — counts, không ghi) SONG SONG flow học → verify `words` chỉ READ: `source='oxford-ld'`/`cefr` không đổi, learn/review/lookup không ghi `words` (audit INSERT paths) → evidence
- [x] T9. Rule 0 BROWSER VERIFY 3 tầng: DOM (eval hỗ trợ) · VISUAL (screenshot 375 từng màn — chung T6, so direction) · **FLOW chuẩn duy nhất**: login → dashboard → learn 5 từ → nhận XP → `/top-users` THẤY tên mình weekly → review (seed due) → logout. Screenshot fail / flow đứt → NÓI THẬT, fix trước khi qua review
- [x] T10. Security-audit (mục 8): dispatch `security-audit` agent trên diff vocab (session POST grading server-side/idempotency/user scoping/injection `response`, goal PATCH auth/validate, secrets/.env diff, exec-bit, permissions, lockfile-deps) — P0/P1 → fix nhỏ/report; không dừng Phase checkpoint khi còn P0/P1
- [x] T11. Docs runbook + evidence pack (mục 9): `evidence/sf-5-convergence-qa/runbook.md` (migration đã áp, env cần, feature map URL mới/cũ, hướng dẫn merge) + evidence pack (screenshots + suites log + audit)
- [x] T12. code-reviewer ĐỘC LẬP trên diff SF-5 — KHÔNG tự duyệt; CHANGES-REQUESTED → fix → re-review; APPROVED → comment VU-42 kèm literal `CHECKLIST-4Q`
- [x] T13. Final: `story-verify sf-5-convergence-qa` sạch (429 false-FAIL khi APPROVED đã post → note evidence + dừng) · Epic audit comment VU-37 (SF→merge-hash map + hướng dẫn merge) · push `wakii-dev/sf-5-convergence-qa` · report DONE — KHÔNG merge, KHÔNG set Done

## ACCEPTANCE (context pack — verifier Phase 5 kiểm TỪNG dòng)

1. Click-through thật: đăng nhập → dashboard → learn 5 từ → XP → /top-users THẤY tên mình weekly; sang ngày (seed) review đúng hàng đợi
2. Tất cả URL cũ hoạt động đúng (mục 1) — không regression nào sót
3. Một lệnh chạy cả bộ vocab suites xanh liên tiếp (evidence log); 3311 biến mất khỏi lanes
4. Rehearsal 6 từ + 5k từ: phiên build < vài trăm ms, không seq-scan toàn bảng (assertions SF-2 pass), không crash
5. Screenshots 375 từng màn: keyboard-only đi được, reduced-motion tắt animation, contrast OK
6. Design fidelity: mỗi màn screenshot + checklist hand-off, chênh lệch liệt kê + phân ánh (fix/escalate)
7. Security-audit: không P0/P1 còn mở; secrets/permission sạch
8. Epic audit comment đầy đủ SF→merge-hash + PR ready (dest pushed — phía coordinator)
