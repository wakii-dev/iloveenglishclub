
## 2026-09-30 — SF-3 (VU-27) — 2 pattern đề xuất đưa vào kit/skill

1. **testMatch regex vs tên worktree** (playwright config per-SF): regex trống `/progress.*\.spec\.ts/` khớp cả ĐƯỜNG DẪN tuyệt đối của spec khi tên worktree chứa token đó (`sf-3-auth-progress-qa/e2e/dictation-guest.spec.ts` chứa "progress"!) → `--list` nhặt nhầm 17 tests/4 files. Fix: anchor biên path `[\\/]progress.*\.spec\.ts$`. Đề xuất: context-pack template "config checklist" ghi sẵn anchor form cho config per-SF (SF-5 cũng tự chạm — "testMatch anchor basename").
2. **users.id không có DB default** (drizzle `$defaultFn` = application-level): integration test insert users bằng SQL raw phải tự sinh UUID, иначе `null value in column "id"`. Đề xuất: ghi 1 dòng vào qa-checklist.md phần "viết integration test mới".
