# SF-5 Context Pack — SEO/i18n/public pages QA

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-29-qa-hardening-design.md` (§3 SF-5, §4 registry). Plan: `docs/superpowers/plans/2026-09-29-qa-hardening-plan.md` (SF-5). Impact: `specs/2026-09-29-qa-hardening-impact.md` §2a.

## Dispatch constants (P0-4)

- **DB riêng:** `ilec_sf5` (template từ SF-1) · **Port:** `3212` · **Config:** `playwright.sf5.config.ts` (MỚI)
- **Registry:** `findings-sf5.md`, ID **QA-400–499** · **Fixture:** `sf5-…@test.ilec` (thường read-only)
- **Spec e2e mới prefix `i18n-*`** (baseline testMatch chứa `i18n` — anti-orphan P1-3)

**Config checklist** (P1-5): copy từ baseline `playwright.config.ts`: testMatch chỉ `i18n-*` + suite mình · workers:1 · retries:0 · timeout 60s · port 3 chỗ hoặc `E2E_PORT` · webServer `npm run dev -- --port 3212`, DATABASE_URL → `ilec_sf5`.

**Bootstrap worktree (task 1):** copy `.env.local` + `DATABASE_URL` → `ilec_sf5`. **`NEXT_PUBLIC_SITE_URL`**: giữ giá trị main (local) khi test local; test canonical domain thật là việc SF-6 (prod).

## Spec slice (chỉ phần SF-5 chịu trách nhiệm)

1. generateMetadata locale parity: /en và /vi cùng trang → title/description đúng ngôn ngữ; canonical + hreflang là CẶP (en↔vi) trỏ cùng resource.
2. Sitemap: chỉ bài published; mọi URL trong sitemap resolve 200 (fetch thật); robots.txt khớp.
3. JSON-LD: parse được (không syntax error), round-trip escape `<` (`jsonldScript()` có meta-test — giữ GREEN), fields schema.org đúng loại.
4. OG images động: render đúng title/locale (không crash, không placeholder localhost trong prod-path — local chỉ verify code-path).
5. Fallback chain `vi → en → raw`: content thiếu translation render đúng bậc kế (đối chiếu `localize()`).
6. robots + middleware matcher: `/admin` bị exclude đúng, KHÔNG lấn route public hay `/api/*`.
7. Browse flow: home (carousel mới `82bbb3b` — slide/arrows/progress hoạt động, không layout break) → books → book → unit → lesson.
8. **404 + error boundary (P0-2):** URL không tồn tại → not-found render đúng en/vi (`e1e5967` + catch-all); trigger error boundary → `error.tsx` render đúng + recovery.
9. Messages parity THẬT theo key (không chỉ số dòng): `npm test` có `src/messages.test.ts` — mọi key en phải có vi và ngược lại; key thừa/thiếu = finding.
10. **triage-fix:** fix TDD mọi finding trong `findings-sf5.md` + e2e expansion (`i18n-*.spec.ts`). Chạm messages → sửa CẢ en+vi + `npm test` parity GREEN.

## Touch map (files SF-5 tạo/sở hữu)

```
playwright.sf5.config.ts                        # MỚI
e2e/i18n-*.spec.ts                              # expansion MỚI
docs/superpowers/evidence/qa-hardening/findings-sf5.md
src/lib/seo/**, src/app/sitemap.ts, src/app/robots.ts (nếu có),
messages/{en,vi}/** (fix parity nếu thiếu),
src/app/(public)/** layout-level fix (surgical — không redesign)
```
READ-ONLY: dictation components (SF-2), auth (SF-3), admin (SF-4), middleware gating chi tiết (SF-4 probe — mình chỉ verify matcher không lấn), evidence VU-15. File metadata riêng theo locale đã tách khỏi page.tsx (SF-7 VU-15) — giữ tách.

## ACCEPTANCE (user-visible)

- Người dùng EN/VI thấy đúng ngôn ngữ mọi trang public; share link (OG) hiện đúng tiêu đề/mô tả.
- Google bot thấy sitemap chuẩn (chỉ published, URL sống), JSON-LD hợp lệ, hreflang đúng cặp.
- Bài thiếu bản dịch vẫn render (fallback), không trang trắng; URL sai hiện trang 404 đẹp đúng ngôn ngữ; lỗi runtime có error boundary.
- Mọi bug trong surface: FIXED có regression, hoặc DEFERRED có sign-off.

## Boundary (KHÔNG làm)

- KHÔNG đụng dictation (SF-2), auth/session (SF-3), admin CMS (SF-4), prod (SF-6).
- KHÔNG đổi i18n routing (`src/i18n/` — chỉ verify), KHÔNG thêm ngôn ngữ mới.
- KHÔNG redesign UI public (direction B story khác) — fix surgical giữ design tokens hiện tại.
- KHÔNG sửa baseline configs; OG/canonical domain thật đo ở SF-6.
