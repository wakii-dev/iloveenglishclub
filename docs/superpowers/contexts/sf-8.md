# SF-8 Context Pack — Production + audit (convergence)

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-28-iloveenglishclub-design.md` — **§9 ngưỡng + §10 M6 là contract**. Bracket: `docs/superpowers/brackets/vu15-iloveenglishclub.md`.

## Spec slice (chỉ phần SF-8 chịu trách nhiệm)

1. **Lighthouse audit theo ngưỡng binary §9: a11y ≥ 95, perf mobile ≥ 85** — chạy trên build production; fix findings trong phạm vi ngưỡng (fix thuộc SF khác và >10 dòng → quay lại SF đó qua coordinator)
2. **Security checkpoint:** RLS re-verify (script SF-2 chạy lại trên prod schema), role-check MỌI Server Action (grep audit), secrets scan (.env không trong diff, exec-bit, lockfile-deps) — checklist OWASP surface theo spec §3 trust boundary
3. **Deploy:** Vercel (app) + Supabase production (DB + Auth + Storage); env vars đúng `.env.example`; domain/URL production; migration chạy trên prod
4. **Smoke E2E production:** dictation happy path + admin tạo lesson + i18n switch — chạy TRÊN URL prod
5. **Audit reports** ghi `docs/superpowers/audits/` (lighthouse + security) — bằng chứng cho gate

## Touch map (files SF-8 tạo/sở hữu)

```
vercel.json (nếu cần), docs cấu hình deploy
docs/superpowers/audits/lighthouse-*.md, security-checkpoint-*.md
scripts/lighthouse.* , scripts/security-scan.* (nếu tự động hóa được)
```
READ-ONLY: toàn bộ app — đây là SF convergence, chỉ fix nhỏ trong phạm vi ngưỡng

## ACCEPTANCE (user-visible)

- Production URL mở được `/en` + `/vi`, browse books → units → lessons
- Học 1 bài thật end-to-end trên prod (đăng ký → học → thấy XP/streak)
- Admin tạo + publish 1 lesson trên prod → bài hiện trên site
- Lighthouse: a11y ≥ 95, perf mobile ≥ 85 (báo cáo là bằng chứng)
- Security checkpoint sạch (checklist từng mục có verdict)
- Smoke E2E trên prod exit 0

## Boundary (KHÔNG làm)

- KHÔNG thêm feature mới — chỉ audit + fix theo ngưỡng
- Fix lớn thuộc SF khác → report coordinator dispatch lại SF đó (rollback-fixer không cần nếu chưa diverge)
- KHÔNG merge vào primary — nhánh đích + PR là human gate (story CLOSE)
