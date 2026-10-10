
## 2026-09-30 — SF-3 (VU-27) — 2 pattern đề xuất đưa vào kit/skill

1. **testMatch regex vs tên worktree** (playwright config per-SF): regex trống `/progress.*\.spec\.ts/` khớp cả ĐƯỜNG DẪN tuyệt đối của spec khi tên worktree chứa token đó (`sf-3-auth-progress-qa/e2e/dictation-guest.spec.ts` chứa "progress"!) → `--list` nhặt nhầm 17 tests/4 files. Fix: anchor biên path `[\\/]progress.*\.spec\.ts$`. Đề xuất: context-pack template "config checklist" ghi sẵn anchor form cho config per-SF (SF-5 cũng tự chạm — "testMatch anchor basename").
2. **users.id không có DB default** (drizzle `$defaultFn` = application-level): integration test insert users bằng SQL raw phải tự sinh UUID, иначе `null value in column "id"`. Đề xuất: ghi 1 dòng vào qa-checklist.md phần "viết integration test mới".

## 2026-10-10 — SF-4 (VU-41) — 4 pattern đề xuất đưa vào kit/skill

1. **postgres.js không serialize param chuỗi SQL-expression kèm cast** (`sql\`${'now() - interval 1 hour'}::timestamptz\`` → RangeError "Invalid time value" tại types.js serialize). Fix: Date param (serialize native) hoặc `sql\`now() - interval '1 hour'\`` fragment. Đề xuất: 1 dòng vào qa-checklist "fixture seed qua postgres.js".
2. **Click-with-retry cần click timeout NGẮN** (2.5s): retry loop với `click()` default timeout 30s × N vòng = treo test timeout 120s thay vì fail nhanh. Kèm: effect check sau click phải `.first()` khi RSC refresh đang swap old/new block (strict-mode throw trong effect → catch(false) → exhaust). Đề xuất: update lesson "pre-hydration click race" trong e2e-authoring với cả 2 chi tiết.
3. **Tailwind v4: `border-b-2.5` KHÔNG phải class hợp lệ** (fractional spacing `pt-4.5` OK, border width fractional KHÔNG — compiled CSS grep = 0, silent). Fix: `border-b-[2.5px]`. Đề xuất: checklist "copy pixel values từ proto" — mọi fractional border/radius phải bracket syntax.
4. **Copy SVG từ prototype phải kèm presentation attrs**: proto dùng CSS class `.ic {stroke:currentColor;fill:none...}` — copy markup không class = SVG render fill đen đặc. Đề xuất: checklist design-handoff "SVG copy nguyên vẹn bao gồm attrs inline, không dựa CSS của proto".
5. **Async server children KHÔNG render qua renderToString** (React RSC-only): SSR test cần components SYNC nhận `t` translator qua props (entry fetch). Đề xuất: ghi vào page.test.ts pattern note.
