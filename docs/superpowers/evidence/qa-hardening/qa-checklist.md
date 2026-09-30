# Exploratory QA checklist per surface — QA hardening VU-24

Nguồn: bracket `vu24-qa-hardening.md` SF-2..5 task list + spec §3. Dùng làm manual exploratory checklist cho executor từng SF (bên cạnh e2e automation) — tick + ghi evidence kèm finding ID khi lệch. Mọi lệch → findings-sf{N}.md đúng dải ID.

## SF-2 — Dictation engine + player flow (port 3210, DB ilec_sf2)

- [ ] **Scoring edge trên UI** đối chiếu `diff.ts` truth: apostrophe, dấu câu, unicode/NFC, input trống, quá dài (MAX_TYPED_LEN), hoa/thường, số
- [ ] Store state machine: reload giữa chừng (resume?), double-submit chặn, phase guard (không skip listen→type ngược)
- [ ] Audio controls: speed 0.5/1/1.5/2, seek, replay nonce (bấm lại phát lại từ đầu), audio 404 → fail-soft (không trắng màn)
- [ ] Start-gate autoplay: desktop Chromium + mobile emulated — KHÔNG tự phát trước click; sau click phát ngay
- [ ] Part nav: ‹ › chuyển part, progress bar cập nhật, results tổng, transcript tab render
- [ ] Guest flow: banner "đăng nhập để lưu điểm", XP chưa lưu, reload = mất (QA-6 BY-DESIGN — re-verify)
- [ ] Relaxed toggle giữa chừng (QA-3 BY-DESIGN — re-verify hành vi đúng mô tả)
- [ ] Mobile iPhone 12 emulated: keyboard Enter/IME, safe-area không che input, tap target ≥44px *(thiết bị thật → Recommendations)*
- [ ] i18n en/vi trên lesson thật (labels, results, errors)
- [ ] A11y: shortcuts panel đúng phím, focus ring, aria-live cho kết quả

## SF-3 — Auth/session + progress/gamification (port 3211, DB ilec_sf3)

- [ ] Register: duplicate email lỗi êm, validation, locale set theo ngôn ngữ đăng ký, transactional (user + profile cùng lúc)
- [ ] Login: sai mật khẩu (thông báo không lộ user tồn tại), `?next=` guard không open-redirect, callback redirect đúng
- [ ] **VERIFY fix `695f0ef`** (session-sync): register xong → session có NGAY không cần F5; bỏ workaround `page.reload()` trong progress.spec
- [ ] OAuth Google: probe creds — thiếu → evidence limit (env-matrix đã ghi nhận không có local)
- [ ] Session lifecycle: expiry, logout sạch cookie, protected route redirect kèm `next`
- [ ] submitAttempt: double-submit race (2 click nhanh), clientAttemptId idempotent (retry không cộng điểm), MAX_TYPED_LEN server-side, 2 tab đồng thời
- [ ] XP: first-attempt-only, hint ×0.8, relaxed ×0.5 — server = preview (không spoof được)
- [ ] Streak: boundary 23:59 ICT, hôm qua + hôm nay liên tục, cap XP ngày; so `streak.ts` unit truth
- [ ] Leaderboard: ISO week đổi đúng (thứ 2), all-time, guest ẩn
- [ ] Me page: heatmap 12 tuần, phút nghe (DISTINCT part), books progress khớp DB
- [ ] Guest giữa chừng → login → điểm commit đúng phần đã làm

## SF-4 — Admin CMS + storage/upload (port 3010, DB ilec_sf4, admin riêng)

- [ ] Gating 2 lớp: guest → login, user thường → 403, **forged JWT không qua** (re-run test:rls sau mọi fix chạm auth); 16 call site assertAdmin không suy yếu
- [ ] Dashboard stats khớp DB thật (đếm tay SQL)
- [ ] Units CRUD: validation, duplicate number, delete RESTRICT khi có attempts (tooltip)
- [ ] Lessons CRUD: create/edit/publish/unpublish, điều hướng editor
- [ ] Split-sentences: import + manual fix, unicode, NUL-safe (binary paste), viết tắt (QA-4 BY-DESIGN — manual path)
- [ ] Upload: size limit, MIME chặn, per-file status, retry file lỗi RIÊNG, numeric sort 1..12 (không 1,10,2), mismatch số file cảnh báo — CẢ driver local + blob (blob probe creds)
- [ ] Publish gate: thiếu audio chặn kèm số câu; publish → **site thật thấy ngay** (revalidateTag firing thật)
- [ ] Audio replace: duration cập nhật failsoft (file lỗi không vỡ)
- [ ] Users mgmt: đổi role, chặn tự-đổi mình, enum validate runtime; khóa user (thiếu cột `banned` → DEFERRED candidate kèm rationale)

## SF-5 — SEO/i18n/public (port 3212, DB ilec_sf5)

- [ ] Metadata: en/vi parity, canonical + hreflang ĐÚNG CẶP, domain từ env
- [ ] Sitemap: chỉ published, mọi URL resolve 200 thật
- [ ] JSON-LD: parse được, round-trip escape (title có `"`/`'`/unicode), schema.org fields đủ
- [ ] OG images: render động đúng title/locale (check /api/og query)
- [ ] Fallback chain: content thiếu translation → vi→en→raw, không render trống
- [ ] robots.txt đúng + middleware matcher không lấn public/api
- [ ] Browse flow: home carousel (`82bbb3b`) → books → book → unit → lesson không dead-end
- [ ] 404: URL lạ → not-found render đúng en/vi; error boundary (`error.tsx`, `e1e5967`) render đúng
- [ ] Messages parity THEO KEY (không đếm dòng): en/vi cùng bộ key, thiếu key nào liệt kê ra

## Quy ước chung mọi surface

1. Mỗi lệch = 1 row findings (ID đúng dải) TRƯỚC khi fix; fix TDD RED→GREEN đúng lane.
2. BY-DESIGN/DEFERRED phải có rationale trong row (PM re-review tại phase checkpoint).
3. Bug chéo surface → owner theo touch map (dictation lib→SF-2; gamification/actions→SF-3; admin/storage→SF-4; seo/i18n→SF-5).
4. Baseline số tham chiếu: `baseline.md` (268 test xanh trên HEAD sau hygiene) — sau fix, số lane không được GIẢM.
