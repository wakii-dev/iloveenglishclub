# SF-7 Context Pack — SEO

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-28-iloveenglishclub-design.md` — **§8 là contract**, §3 render strategy. Bracket: `docs/superpowers/brackets/vu15-iloveenglishclub.md`.

## Spec slice (chỉ phần SF-7 chịu trách nhiệm)

1. **generateMetadata theo locale** cho mọi trang public (Home/Books/Book/Unit/Lesson/Top-users) — **metadata đặt FILE RIÊNG** (`metadata.ts` / pattern tách bạch), KHÔNG viết trong page.tsx SF-4 đang sở hữu (plan-critic P1 chống merge conflict)
2. **Sitemap** (`sitemap.ts`): tự sinh từ DB, **CHỈ published lessons** + books/units + static routes, đủ cặp locale
3. **JSON-LD:** `LearningResource`/`Course` schema cho lesson/book
4. **OG image động** cho lesson (title + book + level)
5. **hreflang/canonical:** cặp locale `/en`↔`/vi` khớp từng trang, canonical theo locale
6. **Fallback render chain `vi → en → raw` verify** end-to-end qua trang thật (SF-2 đã làm lib — SF-7 verify + fix hiển thị nếu lọt)
7. **E2E i18n switch (Playwright):** đổi ngôn ngữ giữ nguyên trang hiện tại (plan-critic P1 tách khỏi SF-7 cũ)

## Touch map (files SF-7 tạo/sở hữu)

```
src/app/[locale]/**/metadata.ts (file riêng từng route — KHÔNG sửa page.tsx)
src/app/sitemap.ts, src/app/robots.ts
src/app/[locale]/.../opengraph-image.tsx (lesson + book)
src/lib/seo/* (jsonld builder, hreflang helper)
playwright tests: e2e/i18n-switch.spec.ts
```
READ-ONLY: mọi page.tsx (chỉ thêm file metadata bên cạnh), `lib/content/queries` (SF-2), schema

## ACCEPTANCE (user-visible)

- View-source lesson page: `<title>` + meta description đúng locale, canonical + hreflang đủ cặp
- `/sitemap.xml`: chỉ published lessons, đủ 2 locale; `/robots.txt` chuẩn
- Chia link lesson lên mạng → OG image + title hiện đúng
- JSON-LD validate (Rich Results test / schema validator)
- Đang ở lesson, bấm switch EN↔VI → vẫn ở đúng lesson đó, UI đổi ngữ

## Boundary (KHÔNG làm)

- KHÔNG sửa logic page.tsx/component (chỉ metadata files riêng) — cần sửa logic → flag coordinator
- KHÔNG deploy/threshold audit (SF-8)
- Merge convention (song song với SF-6): sau merge regen lockfile, không resolve tay
