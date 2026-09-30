# SF-1 Context Pack — QA baseline + infra hygiene

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-29-qa-hardening-design.md` (§4 registry, §6 AC). Plan: `docs/superpowers/plans/2026-09-29-qa-hardening-plan.md`. Bracket: `docs/superpowers/brackets/<xem Story tab>`. Impact (touch map đầy đủ): `docs/superpowers/specs/2026-09-29-qa-hardening-impact.md`.

## Spec slice (chỉ phần SF-1 chịu trách nhiệm)

1. **Thứ tự task PHẢI theo plan** (P1-1): env-matrix ĐẦU → matrix → build → regression → registry → checklist → flaky → flag → lighthouse-pre → db-template CUỐI.
2. **env-matrix-verify:** `.env.local` cần `DATABASE_URL` (DB local `ilec`), `AUTH_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` (globalSetup e2e admin cần), `NEXT_PUBLIC_SITE_URL`. `GOOGLE_CLIENT_ID/SECRET` thiếu → GHI NHẬN trong evidence (OAuth không test được local — SF-3 cần biết), KHÔNG fail mơ hồ.
3. **matrix-rerun-baseline (trên HEAD hiện tại):** `npm test` (unit ~218) · `npm run test:rls` (18, cần DB migrated+seeded) · `npm run test:audit` (~13-15) · `npm run test:e2e` (admin) + `npm run test:e2e:dictation` (dictation+progress+i18n). Lane flaky (e2e `retries:0`): pass ≥2/3 runs = xanh; fail → registry kèm owner tier-1, KHÔNG chặn SF-1.
4. **prod-build-verify:** `npm run build` + `next start` — HEAD đã có 2 commit build-fix (`4d95320` drop turbopack, `3617eed` storage split); smoke /en /vi /lesson; guard dev-indicator (thấy dev indicator → sai build).
5. **regression-storage-import (RED→GREEN cho `3617eed`):** test chặn client bundle kéo `@vercel/blob` — (a) import-graph test đọc `src/lib/storage.ts` assert KHÔNG chứa import `@vercel/blob`; (b) mutation: revert tạm `3617eed` (đưa `putAudio` về storage.ts) → test ĐỎ → restore → GREEN. Đặt đúng lane vitest chính.
6. **registry-setup:** tạo `docs/superpowers/evidence/qa-hardening/findings-sf1.md` (ID **QA-1–99**) + skeleton `findings-sf{2..6}.md` (dải ID: sf2=100–199, sf3=200–299, sf4=300–399, sf5=400–499, sf6=500+). Row format + BY-DESIGN seed rows: xem spec §4 (relaxed toggle giữa chừng / naive split viết tắt / transcript-audio public / guest commit 1 tab).
7. **e2e-flakiness-audit:** dictation config ×3 + admin config ×3, đo fail rate; flaky thật → finding P1 (ứng viên số 1: cold compile action 60–115s sát timeout 60s). KHỐI LƯỢNG NẶNG — task độc lập, đừng gộp chạy 1 lượt.
8. **report-only-lighthouse-flag:** `scripts/lighthouse.mjs` — hiện `THRESHOLDS` hardcode (dòng 30, exit non-0 khi dưới ngưỡng) VÀ `OUT_DIR` hardcode vào `docs/superpowers/evidence/sf-8-production-audit/lighthouse` (dòng 44-45 — **chạy pre giờ sẽ GHI ĐÈ provenance VU-15**). Thêm: (a) env/flag report-only = **CHỈ nới perf** (a11y ≥0.95 vẫn hard exit); (b) param `LH_OUT_DIR` (default giữ nguyên). TDD nhỏ vào lane phù hợp.
9. **lighthouse-pre:** `LH_OUT_DIR=docs/superpowers/evidence/qa-hardening/lighthouse node scripts/lighthouse.mjs pre` — 7 URL median/3, chỉ trên `next start` (không phải dev). Exit thêm: **git status sạch trên dir evidence SF-8**.
10. **db-template + test-data-hygiene (CUỐI SF-1):** cleanup helper DB local (xoá theo email pattern `@test.ilec`, dry-run) + tạo 4 DB template `createdb ilec_sf2..sf5 -T ilec` — guard: không còn connection trên `ilec` (stop dev server; `createdb -T` fail nếu source còn connection).

## Touch map (files SF-1 tạo/sở hữu)

```
docs/superpowers/evidence/qa-hardening/          # baseline evidence + findings-sf{1..6}.md + lighthouse/
scripts/lighthouse.mjs                           # +report-only flag, +LH_OUT_DIR (mở rộng, không phá default)
src/lib/storage.import-graph.test.ts (hoặc vị trí lane chính hợp lệ)  # regression 3617eed
scripts/ (cleanup helper nếu cần)                # test-data hygiene
```
READ-ONLY: `src/**` (ngoài test file mới), 2 playwright baseline configs, `vitest*.config.ts` (chỉ đọc để hiểu lanes — test mới phải rơi vào lane hiện hữu; đặt sai include = test không chạy lane nào).

## ACCEPTANCE (user-visible)

- Chạy được trọn bộ lệnh baseline trên HEAD và biết SỐ THẬT từng lane (không phải "chắc chắn xanh") — đây là nền móng mọi SF sau dựa vào.
- Bug deploy `3617eed` giờ bị test chặn: revert fix → test đỏ ngay (không thể tái diễn âm thầm).
- 4 DB `ilec_sf2..sf5` sẵn sàng cho 4 SF song song; registry 6 file với dải ID cấp trước.
- Lighthouse có baseline `pre` (số local) ở evidence qa-hardening, VU-15 evidence nguyên vẹn.

## Boundary (KHÔNG làm)

- KHÔNG exploratory QA surface (SF-2..5), KHÔNG fix bug product (chỉ fix infra/test của chính SF-1).
- KHÔNG sửa 2 baseline playwright configs / vitest configs (chỉ đọc).
- KHÔNG đụng prod (SF-6), KHÔNG đụng `docs/superpowers/evidence/sf-8-*/` (READ-ONLY tuyệt đối — provenance).
- Registry: chỉ ghi findings surface-infra; bug product thấy được → ghi vào findings-sf1 để PM phân owner tier-1.
