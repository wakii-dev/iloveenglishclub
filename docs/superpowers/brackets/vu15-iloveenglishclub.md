# Story: VU-15 — I Love English Club — dictation platform theo sách Cambridge Prepare

Destination: story-vu15-iloveenglishclub
Primary: master
Worktree model: story-hub

## SF-1 Foundation
Tier: 0
linear:
What: Phase 1 shippable (tiers 0-1). Scaffold Next.js+TS+Tailwind+shadcn/ui; Supabase project + bucket audio + policies; Auth email/password + Google + trang login/register + OAuth callback + locale auto-set theo route khi đăng ký; next-intl EN/VI với messages PER-NAMESPACE ngay từ đầu (messages/{en,vi}/{home,lesson,admin...}.json — Tier 2 chạy song song không conflict messages); design system: enumerate TRƯỚC toàn bộ component shadcn cần cho lesson + admin (button/input/dialog/select/progress/tabs/tooltip/dropdown/sonner...) để Tier 2 chỉ import không generate (tránh conflict components/ui); layout header/footer/theme. Demo: mở site /en /vi, đăng ký/đăng nhập được, layout chuẩn
Depends on: —
Tasks: scaffold-next-ts / tailwind-shadcn-setup-components-preenumerate / supabase-project-bucket / auth-email-password / auth-google-oauth / auth-pages-login-register-callback-locale-set / middleware-intl-admin-exclude / i18n-routing-messages-per-namespace / design-tokens-base-components / layout-header-footer-theme / ci-lint-typecheck-test-build

## SF-2 Content model + public pages
Tier: 1
linear:
What: Phase 1 shippable (tiers 0-1): browse được toàn bộ cấu trúc sách với data demo. Migration schema ĐẦY ĐỦ theo spec §4 — gồm attempts.xp + client_attempt_id + profiles.relaxed_mode + leaderboard view + TRIGGER on_auth_user_created → insert profiles + DELETE RESTRICT trên lesson_parts đã có attempts; RLS test script assert từng role (anon/user/admin) + assert trigger profiles; seed 7 books; seed demo content exit criteria: ≥1 lesson demo đủ audio PHÁT ĐƯỢC trên bucket + published=true; content-queries-lib có fallback chain vi→en→raw; trang Home/Books/Book/Unit + placeholder lesson page; wire revalidateTag('content') từ đầu
Depends on: SF-1
Tasks: migration-schema-rls-trigger-restrict / rls-test-script-assert-roles / seed-books / seed-demo-content-playable-audio / content-queries-lib-fallback-chain / home-page / books-page / book-units-page / unit-lessons-page / placeholder-lesson-page / revalidate-tag-wiring

## SF-3 Dictation core lib
Tier: 1
linear:
What: pure modules theo spec §5 scoring rules (tokenize+normalize apostrophe, word-diff, accuracy mẫu số transcript, wpm theo duration gốc, XP modifiers hint×0.8 relaxed×0.5, strict/relaxed modes, split-sentences) + player Zustand store state machine §5.4 — Vitest 100% nhánh. Demo: test suite xanh (pure lib, không UI)
Depends on: SF-1
Tasks: tokenize-normalize / word-diff-match / accuracy-wpm-calc / xp-modifiers-calc / strict-relaxed-modes / split-sentences / player-store-state-machine / vitest-coverage-complete

## SF-4 Dictation UI lesson page
Tier: 2
linear:
What: Phase 2 shippable (tiers 2-3): học được bài demo end-to-end trên browser. Start gate (autoplay) → nghe (speed/seek) → gõ → check word-diff → sửa lại → hint/skip → relaxed mode toggle trong lesson (guest in-memory / user update profiles.relaxed_mode) → thanh điều hướng part ← 1/21 → → progress bar → màn kết quả + full transcript tab + guest login banner (ephemeral). E2E scope: guest + ephemeral + banner (login-giữa-lesson-commit thuộc SF-6)
Depends on: SF-2, SF-3
Tasks: lesson-page-integration / start-gate-autoplay / audio-player-controls / input-check-diff-display / hint-skip-next-actions / relaxed-mode-toggle / part-navigation-bar / progress-bar / full-transcript-tab / results-screen / guest-login-banner / shortcuts-panel-handlers / playwright-dictation-guest-e2e

## SF-5 Admin CMS
Tier: 2
linear:
What: admin nhập được end-to-end: unit → lesson → dán script → split câu (import module split-sentences SF-3 + manual fix UI) → bulk upload audio direct browser→Storage qua lib/storage.ts abstraction (per-file status + retry riêng file fail, numeric sort không lexicographic, mismatch handling) → publish gate validation → bài hiện trên PLACEHOLDER lesson page (SF-2) + revalidateTag firing — gate KHÔNG đòi trang dictation SF-4 (đang song song); dashboard + users management
Depends on: SF-2, SF-3
Tasks: admin-layout-role-gating / dashboard-stats / units-crud / lessons-crud / editor-split-sentences-manual-fix / lib-storage-abstraction-direct-upload-retry / mapping-numeric-sort-mismatch-ui / publish-gate-validation / audio-replace-duration-failsoft / users-management / playwright-admin-e2e

## SF-6 Progress + Gamification
Tier: 3
linear:
What: điểm lưu thật: submit attempt qua service-role transaction (first-attempt XP với modifiers, daily_activity upsert, streak recompute TZ Asia/Ho_Chi_Minh — unit test streak: hôm qua +1 / hôm nay giữ / khác reset 1); progress upsert; leaderboard tuần ISO + all-time; trang /me (stats + heatmap 12 tuần + tiến độ books + tổng phút nghe = sum duration DISTINCT parts đã nghe); guest login giữa chừng → commit in-memory results; E2E progress: guest → login giữa chừng → điểm commit + leaderboard đúng
Depends on: SF-4
Tasks: submit-attempt-service-role-transaction / xp-first-attempt-daily-streak-atomic-tz-test / progress-upsert-recompute / leaderboard-weekly-view / top-users-page / me-stats-heatmap-listen-minutes / guest-mid-lesson-commit / playwright-progress-e2e

## SF-7 SEO
Tier: 3
linear:
What: SEO đầy đủ theo §8: generateMetadata theo locale (file metadata RIÊNG không viết trong page.tsx của SF-4 — tránh merge conflict); sitemap chỉ published; JSON-LD + OG images động; hreflang/canonical cặp locale; verify fallback render chain vi→en→raw; E2E i18n switch
Depends on: SF-4
Tasks: generate-metadata-locale-separate-files / sitemap-robots / jsonld-og-images / hreflang-canonical / fallback-chain-render-verify / playwright-i18n-switch-e2e

## SF-8 Production + audit (convergence)
Tier: 4
linear:
What: Phase 3 shippable: production URL chạy thật. Lighthouse a11y≥95 / perf mobile≥85 (ngưỡng binary); security checkpoint (RLS re-verify + role-check mọi Server Action + secrets scan); deploy Vercel + Supabase prod; smoke E2E production (dictation + admin + i18n)
Depends on: SF-5, SF-6, SF-7
Tasks: lighthouse-audit-thresholds / security-checkpoint / deploy-vercel-supabase-prod / smoke-e2e-production
