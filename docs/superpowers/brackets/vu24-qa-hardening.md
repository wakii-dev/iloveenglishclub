# Story: VU-24 — QA hardening — test toàn nền tảng, tìm bug và fix (VU-15 follow-up)

Destination: story-vu24-qa-hardening
Primary: story-vu15-iloveenglishclub
Worktree model: story-hub

## SF-1 QA baseline + infra hygiene
Tier: 0
linear: VU-25
What: Phase 1/3 shippable — baseline QA thật trên HEAD (sau 2 commit build-fix): env-matrix verify ĐẦU, re-run toàn bộ matrix 4 lane (flaky ≥2/3 = xanh), verify prod-build local, regression test chặn client bundle kéo @vercel/blob (mutation RED→GREEN cho 3617eed), findings registry per-SF 6 file + dải ID cấp trước, checklist exploratory per surface, e2e flakiness audit ×3, flag report-only + LH_OUT_DIR cho lighthouse runner (bảo vệ evidence VU-15), lighthouse pre baseline, DB template ilec_sf2..sf5 CUỐI task. Demo: baseline matrix có số thật + regression bắt lại bug 3617eed khi revert.
Depends on: —
Tasks: env-matrix-verify / matrix-rerun-baseline / prod-build-verify / regression-storage-import / registry-setup / qa-checklist-authoring / e2e-flakiness-audit / report-only-lighthouse-flag-out-dir / lighthouse-pre-baseline / db-template-test-data-hygiene

## SF-2 Dictation engine + player flow QA
Tier: 1
linear: VU-26
Design: none
What: Exploratory QA flow học bài end-to-end (DB riêng ilec_sf2, port 3210, config mới): scoring edge trên UI thật đối chiếu diff.ts truth, store state machine edge, audio controls 2 driver, start-gate autoplay desktop + mobile emulated, part-nav/progress/results/transcript, guest flow + relaxed toggle (by-design triage đúng), mobile iPhone 12 emulated (Enter/IME/safe-area — thiết bị thật → Recommendations), i18n en/vi lesson, a11y keyboard/shortcuts. Fix TDD mọi finding registry surface này (DEFERRED chỉ khi out-of-scope có sign-off) + e2e expansion prefix dictation-*. Demo: học 1 bài không vướng bug, input bẩn cho kết quả đúng spec.
Depends on: SF-1
Tasks: e2e-config-db-bootstrap / scoring-edge-ui / store-edge / audio-controls / start-gate-browser / nav-progress-results / guest-flow / mobile-viewport / i18n-lesson / a11y-keyboard / triage-fix-e2e-expansion

## SF-3 Auth/session + progress/gamification QA
Tier: 1
linear: VU-27
Design: none
What: QA auth + điểm lưu thật (DB riêng ilec_sf3, port 3211, config mới): register/login edge (duplicate email, open-redirect guard), VERIFY fix SessionProvider-stale 695f0ef bằng e2e regression path register + bỏ workaround page.reload() trong progress.spec, OAuth Google (probe creds, thiếu thì ghi nhận), session lifecycle, submitAttempt edge (double-submit race, clientAttemptId idempotency, MAX_TYPED_LEN, 2-tab concurrency), XP modifiers server vs preview, streak TZ 23:59 boundary + cap, leaderboard ISO week + all-time + guest ẩn, me-page heatmap/phút-nghe/books, guest mid-lesson commit. Fix TDD + re-run test:rls sau mọi fix chạm auth + e2e expansion prefix progress-*. Demo: đăng ký không cần F5, điểm không gian lận được, streak đúng giờ VN.
Depends on: SF-1
Tasks: e2e-config-db-bootstrap / register-edge / login-edge / session-sync-verify-regression / oauth-google-probe / session-lifecycle / submit-attempt-edge / xp-modifiers-truth / streak-tz / leaderboard-boundary / me-page-stats / guest-mid-commit / triage-fix-e2e-expansion

## SF-4 Admin CMS + storage/upload QA
Tier: 1
linear: VU-28
Design: none
What: QA admin nhập nội dung end-to-end (DB riêng ilec_sf4, port 3010, config mới, globalSetup admin riêng): gating 2 lớp probe (guest/user/forged JWT — re-run test:rls sau fix), dashboard stats, units/lessons CRUD edge (RESTRICT attempts), split-sentences UI + manual fix (viết tắt = by-design), upload edge (size/MIME/per-file status/retry/numeric sort/mismatch) trên CẢ 2 driver, publish gate + revalidateTag thật (publish → site thấy), audio replace failsoft, users mgmt (enum validate, chặn tự-đổi; khóa user thiếu cột banned → DEFERRED candidate). Spec e2e mới re-runnable trên DB bất kỳ (sweep cuối chạy lại trên ilec) + prefix admin-*. Demo: nhập bài từ script đến publish thấy trên site, upload lỗi xử lý êm.
Depends on: SF-1
Tasks: e2e-config-db-bootstrap / gating-probe / dashboard-stats / units-crud-edge / lessons-crud-edge / split-sentences-ui / upload-edge-two-drivers / publish-gate-revalidate / audio-replace-failsoft / users-mgmt / triage-fix-e2e-expansion

## SF-5 SEO/i18n/public pages QA
Tier: 1
linear: VU-29
Design: none
What: QA SEO + i18n + trang public (DB riêng ilec_sf5, port 3212, config mới): metadata locale parity en/vi + canonical/hreflang cặp, sitemap chỉ published mọi URL sống, JSON-LD parse + round-trip escape, OG images động, fallback chain vi→en→raw, robots + middleware matcher không lấn, browse flow (carousel 82bbb3b), 404 not-found + error.tsx render đúng en/vi, messages parity thật theo key. Fix TDD (messages sửa CẢ en+vi) + e2e expansion prefix i18n-*. Demo: bot Google thấy sitemap chuẩn, share link hiện đúng, trang thiếu dịch vẫn render.
Depends on: SF-1
Tasks: e2e-config-db-bootstrap / metadata-parity / sitemap-check / jsonld-validity / og-images / fallback-chain / robots-middleware / browse-flow-404-error / messages-parity-key / triage-fix-e2e-expansion

## SF-6 Prod QA + convergence
Tier: 2
linear: VU-31
Design: none
What: Phase 3/3 shippable — prod sign-off + convergence (fork từ HEAD đích SAU SF-1): bootstrap + precondition flag report-only, deploy strategy chốt với owner, prod smoke public (canonical domain thật), prod dictation flow thật (account @test.ilec), prod admin publish [QA] lesson, lighthouse final LOCAL 7/7 PASS hard gate trước prod, lighthouse prod (a11y ≥0.95 hard, perf report-only + root-cause sụt), prod security postcheck (headers/cookies/env leak), prod cleanup 2 pha DB-FK-order + Blob [QA] (dry-run trước chạy), regression sweep final toàn lane list trên DB ilec (không phụ thuộc prod), registry merge findings-sf1..6 → findings.md 0 OPEN (DEFERRED có sign-off), recommendation report (Next 16, CI lanes, checklist re-run sau merge, thiết bị thật), final QA report + evidence. CLOSE: PR --base master (directive user, người merge). Demo: prod thật học được + publish được + sạch rác test.
Depends on: SF-2, SF-3, SF-4, SF-5
Tasks: bootstrap-precondition / deploy-strategy-gap3 / prod-smoke-public / prod-dictation-flow / prod-admin-flow / lighthouse-final-local / prod-lighthouse-report-only / prod-security-postcheck / prod-cleanup-two-phase / regression-sweep-final / registry-close-merge / recommendation-report / final-report-evidence
