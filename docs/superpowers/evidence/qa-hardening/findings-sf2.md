# Findings registry — SF-2 Dictation engine + player flow

Dải ID: **QA-100–199** (contract: findings-sf1.md — row format spec VU-24 §4).

## Findings

| ID | Sev | Surface | Repro | Root cause | Fix commit | Regression test | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| QA-101 | P1 | e2e config sf2 | `npx playwright test --list --config playwright.sf2.config.ts` với testMatch `/dictation.*\.spec\.ts/` liệt kê **17 tests / 4 files** (nhặt cả progress/i18n/admin specs) | testMatch regex chạy trên path TUYỆT ĐỐI — worktree tên `sf-2-dictation-qa` chứa "dictation" nên khớp mọi file `.spec.ts` (baseline configs không gặp vì worktree chính không chứa substring đó) | (commit task 1) | RED→GREEN config lane: trước = 17/4 files sai, sau = **6/1 file chỉ dictation** (`--list` output evidence test-run) | FIXED | test-run.txt |
| QA-102 | P2 | dictation input (type-panel) | Login user → part 1 → gõ 2001 ký tự (pressSequentially thật) → Enter check → server `MAX_TYPED_LEN=2000` (submit-attempt.ts:44, SF-3 read-only) reject → chỉ console.error → UI im lặng: không báo lỗi, XP chip vẫn hiển thị → **attempt/XP mất âm thầm** | TypePanel textarea thiếu `maxLength` — chặn input quá dài KHÔNG có ở lớp UI; server chặn nhưng silent (submit-attempt chỉ log) | (commit task 3) | RED: value 2001 ký tự (error-context RED run); GREEN: `pressSequentially` 2001 → value ĐÚNG 2000 + attempt row ghi DB (dictation-store-edge.spec.ts case QA-102) | FIXED | test-run.txt |
