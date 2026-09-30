# Recommendations — QA hardening VU-24 (SF-6 task 11)

Tổng hợp cho người merge + story kế tiếp. Mọi DEFERRED của registry (AC#2) nằm ở đây
đầy đủ rationale + sign-off nguồn.

## 1. Dep upgrades (ngoài story — quyết định user #3, 29-09)

- **Next 16:** eux lợi: Turbopack dev ổn định (gốc `QA-7` — webServer e2e đang chạy
  webpack để bypass race font; Next 16 hứa sửa tận gốc, lúc đó có thể trả `dev` về
  turbopack cho e2e nếu muốn). Rủi ro breaking changes — lên nhánh riêng, chạy full
  sweep này lại trước merge.
- **drizzle-kit upgrade:** theo spec §5 (out-of-scope story) — chạy `db:generate`/
  `db:migrate` kiểm idempotent trên DB clone trước khi áp prod.

## 2. CI (không có lane e2e/rls hiện tại)

- Thêm CI lane: `npm test` + `test:rls` + `test:audit` (cần Postgres service, seed
  template — quy ước DB template `ilec_sf*` đã có trong story này) + 1 e2e suite
  smoke (baseline dictation) mỗi PR. e2e full 6 config để nightly.
- `QA-501` là ví dụ đúng lớp CI này bắt được: local PG16 pass, PG17+ (prod) break —
  CI nên chạy Postgres version KHỚP prod (18.x).

## 3. Checklist re-run SAU khi người merge (convergence §5.6)

- Chạy lại trên HEAD master sau merge PR: unit + rls + audit + e2e baseline ×2 —
  số test ≥ số trong `qa-final-report.md`. Không pre-authorize merge (directive user).

## 4. DEFERRED registry (sign-off nguồn ghi ở từng row findings.md)

| ID | Nội dung | Hướng xử lý |
|---|---|---|
| QA-105 | Mobile tap targets < 44px (speed 36 / PartNav 38 / shortcuts 34 / relaxed ~28) | Direction B redesign sở hữu visual surface; WCAG 2.2 AA 24px PASS. Sign-off: default-approved epic comment 19:13 29-09 (không phản đối tới checkpoint) |
| QA-106 residual | Tab đang focus trong textarea không Tab-ra được (literal spec §5 "Tab = replay trong exercise") | PM cân nhắc exempt **Shift+Tab** (thoát ngược chuẩn) trong direction B. Cùng batch sign-off 19:13 |
| QA-108 | Header chrome mobile 390px ("Sign up" cắt, logo wrap) | Direction B redesign; ngoài touch map SF-2/5. Cùng batch sign-off 19:13 |
| QA-201 | OAuth Google chưa test round-trip thật | Cần GOOGLE_CLIENT_ID/SECRET prod — khi có, mở `progress-oauth` suite (đã viết sẵn 2 probe + graceful-off được e2e chặn) |
| QA-202 | Guest relaxed → login commit drift preview 5 vs server 10 | Cần quyết product/schema (persist guest prefs pre-auth) — hiện cap 10 XP/part, không corrupt. Hướng an toàn: chấp nhận + document |
| QA-305 | Khóa user (ban) thiếu cột `profiles.banned` | Schema migration chủ đích ngoài story — làm kèm direction B hoặc epic riêng |

## 5. Thiết bị thật / IME

Không trong khả năng agent (emulation only): keyboard IME tiếng Nhật/Hàn thật,
safe-area iOS thật, autoplay policy Safari/iOS thật. Checklist mobile SF-2 đã đo
boundingBox + Enter; khi có thiết bị: chạy lại `dictation-mobile` suite manual +
probe start-gate (audio unlock) trên Safari iOS thật.

## 6. Nhánh mặc định GitHub

Repo đang default `master` (product) + nhánh story riêng. Khi story ổn định: cân nhắc
đổi default branch về `master` thường xuyên sync + xoá nhánh story cũ sau archive
(bracket + Linear audit giữ vĩnh viễn).

## 7. Vận hành học được trong story (cho PM/skill — ngoài phạm vi report merge)

- KHÔNG BAO GIỜ copy `.env.local` từ worktree chính cho DB task (QA-502 — Neon prod
  suýt bị test suite chạm; coordinator đã sửa + verify sạch).
- Postgres version lệch local vs prod bắt được bằng assertion SQLSTATE: viết test
  chấp nhận superset codes (`["23503","23001"]`) khi đụng FK errors (QA-501).
- Headless fullPage screenshot mất tile chứa CSS animation infinite (`anim-float`) —
  dùng `animations: "disabled"` + scroll-pass (rule0-browser.md §artifact).
