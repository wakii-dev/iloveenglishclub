# SF-4 Context Pack — Admin CMS + storage/upload QA

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-29-qa-hardening-design.md` (§3 SF-4, §4 registry). Plan: `docs/superpowers/plans/2026-09-29-qa-hardening-plan.md` (SF-4). Impact: `specs/2026-09-29-qa-hardening-impact.md` §2a.

## Dispatch constants (P0-4)

- **DB riêng:** `ilec_sf4` (template từ SF-1) · **Port:** `3010` · **Config:** `playwright.sf4.config.ts` (MỚI)
- **Registry:** `findings-sf4.md`, ID **QA-300–399** · **Content test:** prefix `[QA-SF4]` trong tên; account `sf4-…@test.ilec`
- **Spec e2e mới prefix `admin-*`** (baseline admin testMatch `/admin-.*\.spec\.ts/` — anti-orphan P1-3)

**Config checklist** (P1-5 — copy từ `playwright.admin.config.ts`): testMatch chỉ `admin-*` mình · workers:1 · retries:0 · `timeout: 90_000` · `expect.timeout: 15_000` · **`globalSetup` riêng** (tạo admin trên `ilec_sf4`) · **`locale: "vi-VN"`** (dễ quên) · port 3 chỗ hoặc `E2E_PORT` · webServer `npm run dev -- --port 3010`, DATABASE_URL → `ilec_sf4`.

**Bootstrap worktree (task 1):** copy `.env.local` + `DATABASE_URL` → `ilec_sf4` + bảo đảm `ADMIN_EMAIL/ADMIN_PASSWORD` (globalSetup bắt buộc — thiếu = throw mơ hồ).

**⚠ RE-RUNNABLE RULE (P1-4):** mọi spec e2e admin mới PHẢI chạy lại được trên DB BẤT KỲ (sweep cuối chạy lại trên `ilec`): unit số = slug unique per run (`Date.now()` suffix, đừng dùng số cố định va seed), tự dọn cuối spec (xoá unit/lesson `[QA-SF4]` vừa tạo) — lesson từ `admin-lesson.spec.ts` cũ là ví dụ số va nhau (`90 + Date.now() % 50`).

## Spec slice (chỉ phần SF-4 chịu trách nhiệm)

1. Gating 2 lớp probe: guest → redirect; user thường → layout layer redirect `/`; JWT forge không qua lớp 2 (role re-check DB). Sau MỌI fix chạm auth → re-run `npm run test:rls` (18/18) + assertAdmin 16 call site không suy yếu.
2. Dashboard stats khớp DB thật (totals đúng).
3. Units CRUD edge: validation, duplicate tên/số, delete unit có lesson (RESTRICT/cascade đúng), delete có attempts.
4. Lessons CRUD edge: tạo/sửa/xoá, điều hướng editor.
5. Split-sentences UI: dán script → tách tự động (import module SF-3/VU-15 `split-sentences`) + manual fix; unicode; known-limitation viết tắt (Mr., e.g.) = BY-DESIGN.
6. Upload edge: size limit, MIME sai, per-file status, retry riêng file fail, **numeric sort** (2.mp3 trước 10.mp3), mismatch handling (số file ≠ số câu).
7. Upload trên CẢ 2 driver: local (không token) + blob (nếu có `BLOB_READ_WRITE_TOKEN` local — nếu không, test code-path local + ghi nhận blob vào findings/evidence, không fail mơ hồ).
8. Publish gate: validation chặn (thiếu audio/script) / cho; **revalidateTag firing thật** — publish → trang public thấy bài (cache invalidate không phải xu).
9. Audio replace: duration failsoft đúng (không crash khi không đọc được duration).
10. Users mgmt: đổi role (runtime enum validate), chặn tự-đổi role mình; gap "khóa user" (thiếu cột `profiles.banned` — comment trong `users.ts:11`) → **DEFERRED candidate**: ghi finding + DEFERRED theo §4 (dep/schema out-of-scope), đừng tự migrate.
11. **triage-fix:** fix TDD mọi finding trong `findings-sf4.md` + e2e expansion (`admin-*.spec.ts` re-runnable).

## Touch map (files SF-4 tạo/sở hữu)

```
playwright.sf4.config.ts, e2e/global-setup (variant sf4 nếu cần tách)  # MỚI
e2e/admin-*.spec.ts                             # expansion MỚI
docs/superpowers/evidence/qa-hardening/findings-sf4.md
src/lib/actions/admin/**, src/lib/admin/**, src/app/api/admin/upload/route.ts,
src/components/admin/**, src/lib/storage-server.ts (fix bug nếu tìm thấy — surgical)
```
READ-ONLY: dictation (SF-2), auth actions/submit-attempt/gamification (SF-3), seo (SF-5), evidence VU-15, `src/lib/storage.ts` (client-safe — sửa nếu bug thật nhưng giữ tách client/server của `3617eed` + regression test SF-1 phải vẫn GREEN).

## ACCEPTANCE (user-visible)

- Admin đăng nhập được, dashboard đúng số liệu; user thường/guest không vào được `/admin` (2 lớp).
- Nhập được unit → lesson → script → tách câu → upload audio (per-file status, retry, sort đúng) → publish → bài hiện trên site NGAY (revalidate thật).
- Upload lỗi (file hỏng/quá lớn/sai MIME) xử lý êm, retry được từng file.
- Mọi bug trong surface: FIXED có regression, hoặc DEFERRED có sign-off (vd khóa user).

## Boundary (KHÔNG làm)

- KHÔNG đụng auth flow user thường (SF-3), dictation (SF-2), seo/sitemap của content mới (SF-5 — nhưng verify publish ảnh hưởng sitemap nếu bug thật → findings chéo).
- KHÔNG tự migrate schema (khóa user → DEFERRED), KHÔNG đổi dep, KHÔNG sửa baseline configs.
- KHÔNG đụng prod (SF-6); upload test data chỉ trên DB mình, content `[QA-SF4]`.
