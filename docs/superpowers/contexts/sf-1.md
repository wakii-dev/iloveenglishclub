# SF-1 Context Pack — Foundation

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments. Epic spec: `docs/superpowers/specs/2026-09-28-iloveenglishclub-design.md`. Bracket: `docs/superpowers/brackets/vu15-iloveenglishclub.md`.

## Spec slice (chỉ phần SF-1 chịu trách nhiệm)

1. Scaffold Next.js 15+ App Router + TypeScript + TailwindCSS + shadcn/ui (spec §3)
2. Supabase project: **chọn region gần VN** (quyết định 1 lần khó đổi — spec §10 M1); tạo bucket `audio` + policies; pattern `@supabase/ssr` hiện hành (auth-helpers deprecated) — probe trước khi code
3. Auth: email/password + Google OAuth; trang `/[locale]/login` + `/[locale]/register`; route handler `/auth/callback` (exchange code); `profiles.locale` auto-set theo route locale khi đăng ký (spec §8 — cần bảng profiles tối thiểu, migration đầy đủ là SF-2 nhưng profiles table phải có sẵn từ SF-1 để auth hoạt động)
4. next-intl: route prefix `/en` (default) + `/vi`, redirect `/` → `/en`; **messages PER-NAMESPACE** `messages/{en,vi}/{home,lesson,admin,gamification,common...}.json` — tách namespace ngay từ đầu để Tier 2 song song không conflict (plan-critic P1)
5. middleware.ts: next-intl routing + **exclude `/admin` tường minh** (spec §3) + chặn `/admin` khi chưa login role admin
6. Design system: **enumerate trước toàn bộ component shadcn** cần cho lesson + admin: button, input, textarea, dialog, select, progress, tabs, tooltip, dropdown-menu, sonner, badge, card, skeleton — Tier 2 chỉ import không generate (plan-critic P1)
7. Layout: header (logo, nav, login/user menu, locale switch, theme toggle light/dark) + footer (spec §3 tree)
8. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, site URL — ghi `.env.example`; service-role chỉ import trong server-only module (spec §3 trust boundary)
9. CI: lint + typecheck + test + build (spec §10 M1)

## Touch map (files SF-1 tạo/sở hữu)

```
package.json, tsconfig, tailwind config, next.config (scaffold toàn bộ)
src/app/[locale]/layout.tsx + page.tsx (Home PLACEHOLDER — Home thật là SF-2)
src/app/[locale]/login/page.tsx, register/page.tsx
src/app/auth/callback/route.ts
src/app/admin/layout.tsx (role-gate skeleton — CRUD là SF-5)
src/middleware.ts
src/lib/supabase/{client,server,admin}.ts
src/lib/storage.ts (skeleton signature — implementation đầy đủ là SF-5)
src/lib/i18n/{routing,request}.ts
messages/{en,vi}/*.json (per-namespace, các namespace rỗng sẵn cho SF khác điền)
src/components/ui/* (shadcn), src/components/layout/{header,footer}.tsx
.github/workflows/ci.yml, .env.example, supabase/config.toml
```

## ACCEPTANCE (user-visible)

- Mở `/en` và `/vi` thấy cùng layout, switch ngôn ngữ đổi được UI strings; `/` redirect về `/en`
- Đăng ký bằng email → đăng nhập được; login Google chạy end-to-end (callback exchange OK); sau register `profiles.locale` = locale của route đăng ký
- Vào `/admin` khi chưa login/chưa phải admin → bị chặn (redirect login, không lộ UI)
- Theme light/dark toggle được và persist
- CI xanh trên push: lint + typecheck + test + build

## Boundary (KHÔNG làm)

- KHÔNG tạo schema books/units/lessons/parts + seed (SF-2) — chỉ profiles tối thiểu cho auth
- KHÔNG any dictation UI/audio player (SF-3/SF-4), KHÔNG admin CRUD pages (SF-5), KHÔNG leaderboard/me (SF-6), KHÔNG SEO metadata (SF-7)
- Home chỉ placeholder hero đơn giản — Home thật (7 level cards) là SF-2
- Merge convention (chạy song song với SF-2/SF-3 tier sau): sau merge luôn regen lockfile bằng install, không resolve tay
