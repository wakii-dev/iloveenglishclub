# Plan: SF-3 Dictation core lib (VU-18)
Date: 2026-09-29 | Linear: VU-18 | Worktree: sf-3-dictation-lib
Spec: `docs/superpowers/specs/2026-09-29-sf-3-dictation-core-lib-design.md` (rev 2, spec-critic APPROVED)

## 0. Root cause analysis (WHY)
### Root cause
Platform dictation cần điểm (accuracy/XP) đáng tin: client preview và server recompute phải ra CÙNG kết quả → logic phải tách khỏi UI/DB thành pure module dùng chung, khoá bằng test contract (epic §5).
### Current state (before feature)
SF-1 xong (scaffold+auth+i18n+CI `npm test`); chưa có module dictation nào. SF-4/SF-5/SF-6 blocked bởi thiếu lib.
### Expected outcome
`src/lib/dictation/diff.ts` + `src/lib/dictation/store.ts` + `src/lib/content/split-sentences.ts` export API ổn định, Vitest 100% nhánh, test suite xanh.
### Constraints & hardships
KHÔNG UI/Server Action/audio handling; đổi signature sau publish phải note commit; merge song song SF-2 → lockfile regen tại merge (không resolve tay); target ES2017 → tránh regex literal ES2018 (lookbehind/`\p{}`) — dùng string-constructed regex + scan thủ công.
### High-level strategy
TDD từng pure function theo bảng scoring rules (test = living spec); store Zustand vanilla factory (test không DOM); coverage thresholds scope hẹp vào đúng module SF-3.

## 1. Problem (intent, NOT solution)
Người học gõ lại câu nghe được chấm đúng/thiếu/thừa + XP chống gian lận — nhưng hiện chưa có logic chấm nào tồn tại để UI (SF-4) và server (SF-6) dùng chung.

## 2. Scope
- In scope: `diff.ts` (tokenize/normalize strict-relaxed/diffWords positional/computeAccuracy/computeWpm/computeXp/scoreAttempt), `split-sentences.ts`, Zustand store §5.4 (14 actions, guard tường minh), coverage config, tests 100% nhánh.
- Out of scope: UI/component (SF-4), Server Action/DB/persist (SF-6), audio file/element handling, admin import (SF-5), đổi file SF-1 sẵn có (ngoài vitest.config.ts).
- Success criteria (observable): `npx vitest run --coverage` exit 0 + 100% branches/statements/functions/lines trên module SF-3; test phủ đúng ví dụ contract: `"cat."`≠`"cat"` strict = `"cat"` relaxed; `don’t`=`don't` 1 token; accuracy mẫu số transcript (thừa từ 1/2, thiếu từ 1/3); XP 10/8/5/0 (8 qua luồng store hint→check-đầu); check-sai→sửa→check-lại OK; skip/next-sai không cộng done; complete chỉ khi mọi part done-or-skipped.

## 3. Touch map
- Files create: `src/lib/dictation/diff.ts`, `src/lib/dictation/diff.test.ts`, `src/lib/dictation/store.ts`, `src/lib/dictation/store.test.ts`, `src/lib/content/split-sentences.ts`, `src/lib/content/split-sentences.test.ts`
- Files modify: `vitest.config.ts` (coverage include + thresholds 100), `package.json` (script `test:coverage` — deps đã commit sẵn)
- Consumers/regression: SF-4 (store+hook), SF-5 (splitSentences), SF-6 (scoreAttempt recompute) — chưa tồn tại, chỉ khoá contract
- Shared surfaces: export API của 3 module (contract); KHÔNG đụng queries.ts/messages (SF-2 song song)

## 4. Design
- Approach chosen: **A — positional index-aligned diff** (spec §1.2, spec-critic approved); alternatives: LCS (bị loại — accuracy 1.0 dù thừa từ rác, gaming vector), React-context store (bị loại — spec bắt buộc Zustand thuần).
- Key semantics (đã chốt trong spec rev 2): hint = diff TƯƠI từ input hiện tại; part RESOLVED đóng băng (check/hint/skip/setInput no-op); XP bank ở check đầu GIỮ khi skip/next-sai; `mode` là công tắc duy nhất (XP relaxedModifier derive từ mode); lesson 0 part → complete ngay; `ACTIVE`={playing,input,checked}.
- Edge cases: token strip về `""` (relaxed) = matched với `""`; transcript 0 từ → accuracy 0; durationMs ≤0 → wpm 0; input rỗng check → accuracy 0 tiêu first attempt (có chủ đích); text không dấu kết → 1 câu; `What?!` 1 câu.
- Non-functional: pure (zero I/O — không có surface security); deterministic (server-parity); test node-env không DOM.

## 5. Implementation outline
- Tasks (DAG, deps →; plan-critic: PROCEED, max tier 2):
  - [ ] T1 `diff-core`: tokenize + apostrophe normalize + strict/relaxed normalize (TDD)
  - [ ] T2 `diff-match-scoring`: diffWords positional + computeAccuracy + computeWpm (deps T1)
  - [ ] T3 `xp-score-attempt`: computeXp bảng 10/8/5/0 + scoreAttempt (deps T2)
  - [ ] T4 `split-sentences`: scan thủ công `.?!` giữ dấu câu + known-limitation test (không deps — song song T1)
  - [ ] T5 `player-store`: Zustand vanilla factory + 14 actions + derived helpers + state-machine tests (deps T3). *Note plan-critic P1-2: hook wrapper `useDictationStore` là function export — node smoke test assert throw-outside-render để giữ 100% function coverage (quyết tại T5, không đợi T6 đỏ); nếu RED→GREEN stall → tách store-core (state+advance) khỏi store-actions thay vì grind.*
  - [ ] T6 `coverage-gate`: vitest.config.ts thresholds + script test:coverage + full gate run. **Exit criteria (plan-critic P1-1/P2-3): (1) `npx vitest run --coverage` exit 0 + 100% branches/statements/functions/lines; (2) `npm test` vẫn xanh (CI path không thresholds); (3) evidence `docs/superpowers/evidence/sf-3-dictation-lib/test-run.txt` đã ghi (HEAD hash + `tdd: RED→GREEN` + log coverage).** (deps T4, T5)
- File structure: `src/lib/dictation/`, `src/lib/content/` (đúng touch map context pack); style theo `storage.ts` (JSDoc tiếng Việt tham chiếu § spec).
- Testing strategy: **TDD RED→GREEN từng task** (superpowers:test-driven-development); test node-env; store qua factory `createDictationStore()` mới mỗi test; gate = `npx vitest run --coverage` exit 0 + 100% nhánh; evidence `docs/superpowers/evidence/sf-3-dictation-lib/test-run.txt` (hash HEAD + `tdd: RED→GREEN` + log coverage).

## 6. Risks & unknowns
- Must verify: zustand v5 `useStore(store, selector)` binding cho hook wrapper (đọc docs khi T5); TS5.5 chấp nhận `new RegExp(string)` với `\p{}` (runtime Node OK, không phải regex literal nên không bị type-check chặn).
- Unverified assumptions: không — mọi semantics đã khóa trong spec rev 2 qua spec-critic; 4 defaults REQUIREMENT-GAP đã post epic VU-15.
- Process: merge convention — sau merge regen lockfile, KHÔNG resolve tay (bracket boundary).
