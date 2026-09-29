# SF-7 SEO — Design Spec (VU-22)

Date: 2026-09-29 | Story: VU-15 I Love English Club | Worktree: `sf-7-seo` (base `story-vu15-iloveenglishclub`)
Contract: epic spec `2026-09-28-iloveenglishclub-design.md` §8 (+§3 render strategy) · Context pack `docs/superpowers/contexts/sf-7.md`
Design gate: CLEAR — direction **B Classroom Warm** (`docs/superpowers/designs/vu15-dictation-direction.md`) cho OG image.
Status: Approved (autonomous story-run — epic-level câu hỏi đã chốt, brainstorm self-answer theo Phase 0; spec-critic chạy sau file này)

## 1. Problem

Epic là nền tảng public nhưng hiện: `<title>` mỏng (3 trang trả `{title}`), **không** sitemap/robots/OG/hreflang/canonical/JSON-LD → Google không index lesson pages; chia link không có preview. Học viên tìm "dictation Cambridge Prepare" không thấy trang bài học = fail success criterion §8 của epic.

## 2. Scope

- **In:** (1) generateMetadata theo locale cho mọi trang public — file metadata **RIÊNG**, 0 sửa `page.tsx`; (2) `sitemap.ts` published-only đủ 2 locale; (3) JSON-LD `LearningResource` (lesson) + `Course` (book); (4) OG image động lesson + book; (5) hreflang/canonical cặp `/en`↔`/vi` + `x-default`; (6) verify fallback chain `vi→en→raw` qua trang thật; (7) e2e Playwright i18n-switch giữ nguyên trang.
- **Out:** deploy/threshold audit (SF-8); sửa logic page/component; top-users **page** (SF-6 — chỉ đặt sẵn layout metadata); login/register không vào sitemap (auth pages, không có giá trị index).
- **ACCEPTANCE (kiểm từng dòng Phase 5, user-visible):**
  1. View-source lesson: `<title>` + meta description đúng locale, canonical + hreflang đủ cặp
  2. `/sitemap.xml` chỉ published lessons đủ 2 locale; `/robots.txt` chuẩn
  3. Chia link lesson → OG image + title đúng
  4. JSON-LD validate (schema validator)
  5. Ở lesson bấm switch EN↔VI → vẫn đúng lesson đó, UI đổi ngữ

## 3. Touch map

Path thật có route group `(public)` (touch map pack thiếu — SF-4 đã note cùng lệch).

**CHỈ TẠO MỚI (SF-7 sở hữu):**
```
src/lib/seo/site.ts            — SITE_URL/metadataBase, localePath(), buildAlternates() (pure)
src/lib/seo/jsonld.ts          — learningResource()/course() builders (pure)
src/lib/seo/sitemap-data.ts    — DB read published-only (build-safe, tag CONTENT_TAG) + path builders (pure)
src/lib/seo/{site,jsonld}.test.ts (+ sitemap path builders test)
src/app/sitemap.ts  src/app/robots.ts
src/app/(public)/[locale]/(home)/layout.tsx            — home metadata (locale desc, canonical+hreflang)
src/app/(public)/[locale]/books/layout.tsx             — books index
src/app/(public)/[locale]/books/[book]/layout.tsx      — book + JSON-LD Course
src/app/(public)/[locale]/books/[book]/opengraph-image.tsx
src/app/(public)/[locale]/books/[book]/units/[unit]/layout.tsx
src/app/(public)/[locale]/books/[book]/units/[unit]/lessons/[lesson]/listen-and-type/layout.tsx  — lesson + JSON-LD LearningResource
src/app/(public)/[locale]/books/[book]/units/[unit]/lessons/[lesson]/listen-and-type/opengraph-image.tsx
src/app/(public)/[locale]/top-users/layout.tsx         — chủ động cho SF-6 (page chưa tồn tại — vô hại)
messages/{en,vi}/seo.json                              — namespace MỚI (0 conflict SF-5/SF-6)
e2e/i18n-switch.spec.ts
```
**MOVED thuần (1):** `[locale]/page.tsx` → `[locale]/(home)/page.tsx` — `git mv`, content 0 byte đổi. Lý do: home là route duy nhất không có segment con để host layout; đây là cách DUY NHẤT cho home metadata riêng mà không sửa page.tsx. URL không đổi (`/en`, `/vi`).
**READ-ONLY:** mọi `page.tsx` (kể cả SF-4 `listen-and-type/page.tsx` — `generateMetadata` mỏng của nó giữ nguyên) · `lib/content/queries` (SF-2 — chỉ GỌI `getBooks/getBook/getUnits/getUnit/getLessons/getLesson`) · `db/schema`.
**Deviation có chủ đích:** context pack gọi file là `metadata.ts` — Next.js 15 **không có** convention đó; pattern tách bạch tương đương = sibling `layout.tsx` (mục tiêu anti-merge-conflict vẫn đạt: 0 dòng page.tsx đổi).

## 4. Design

**4.1 Metadata layer — sibling `layout.tsx` mỗi route public.** Mỗi layout `generateMetadata` trả: `title` (chỉ khi route chưa có page-level title — home/books index đặt absolute; book/unit/lesson **KHÔNG set title** — page-level `generateMetadata` của SF-2/SF-4 giữ việc title, tránh tranh chấp merge direction cùng segment — R1 verify thực tế), `description` (content DB cho book/unit/lesson qua queries đã cache; messages cho home/books index), `alternates` qua `buildAlternates()`, `openGraph` (title/desc/locale/siteName/url). `metadataBase` set trong mỗi metadata trả về từ helper (layout `[locale]/layout.tsx` SF-1 **không đụng**).

**4.2 URL/alternates (`lib/seo/site.ts`, pure + TDD):** `SITE_URL = env NEXT_PUBLIC_SITE_URL || http://localhost:3000` (cắt `/` đuôi); `localePath(locale, path)` → `/{locale}{path}`; `buildAlternates(locale, path)` → `{ canonical: absolute locale-path, languages: { en, vi, 'x-default': en } }` (x-default → defaultLocale `en` theo §8 redirect `/`→`/en`).

**4.3 JSON-LD (`lib/seo/jsonld.ts`, pure + TDD):** `learningResource({name, url, cefr, bookName, bookUrl, locale})` → `@type: LearningResource` (schema.org), `inLanguage: "en"` (transcript chỉ tiếng Anh), `learningResourceType: "Dictation exercise"`, `educationalLevel: cefr`, `isPartOf` → Course object, `provider` → Organization "I Love English Club". `course({name, description, url, cefr})` → `@type: Course`. Render `<script type="application/ld+json">` trong layout lesson/book (JSON-LD hợp lệ cả trong body). KHÔNG nhắm rich-result Course (cần hasCourseInstance) — chỉ schema-validator-valid.

**4.4 Sitemap (`src/app/sitemap.ts` + `lib/seo/sitemap-data.ts`):** entries: home `/{en,vi}` · `/books` · `/books/{slug}` · `/books/{slug}/units/{n}` · `/books/{slug}/units/{n}/lessons/{m}/listen-and-type` (CHỈ published — query riêng JOIN lessons×units×books WHERE published, READ queries lib không mở được nên tự đọc qua `db` + `unstable_cache` tag `CONTENT_TAG` cùng pattern build-safe catch→[] như queries.ts). `alternates.languages` từng entry (hreflang cặp trong sitemap — bổ trợ link tags). `lastModified` từ `lessons.updated_at` nếu cột có (verify schema lúc code; không có → omit). `export const revalidate = 300`. Top-users KHÔNG đưa vào sitemap khi page chưa tồn tại (tránh URL 404 trong sitemap) — thêm khi SF-6 merge (note coordinator).
**robots.ts:** `userAgent '*' allow '/' disallow ['/admin','/api']` + `sitemap: SITE_URL/sitemap.xml`.

**4.5 OG image (`opengraph-image.tsx`, next/og `ImageResponse` 1200×630 PNG):** palette B Classroom Warm (`bg #fff8f0 · fg #432818 · primary #e85d3d · secondary #0e9488 · muted #fbeedd · border #f3e2ce`, radius 18-24px, brand heart box). Lesson: book title + CEFR badge + lesson title lớn + nhãn "Listen & Type"; data qua `getLesson`/`getBook` (cache sẵn). Book: cover-style khối màu + title + CEFR + counts. `revalidate = 300`; không DB lúc build → null data → **fallback design generic** (brand + site name) — không crash build. Font: default satori (bundled) — không fetch font ngoài (offline-safe). `alt` static EN (convention không nhận params cho single image).

**4.6 Home route group:** `(home)/page.tsx` (mv) + `(home)/layout.tsx` — title absolute theo locale, description messages `seo.homeDescription`, canonical+hreflang. Group ẩn với URL/params — `[locale]/layout` `generateStaticParams` phủ.

**4.7 i18n:** messages namespace `seo` (en/vi cùng key-set — `messages.test.ts` bắt). Key tối thiểu: `homeTitle`, `homeDescription`, `booksTitle`, `booksDescription`, `ogLabel`, `ogListenType`, `providerName`, `lessonAlt`, `bookAlt`. Tiêu đề book/unit/lesson lấy từ content DB (đã fallback chain) — KHÔNG hardcode.

**4.8 Fallback chain verify (slice #6):** qua trang thật — so `title`/description/meta của cùng lesson ở `/en` vs `/vi` với DB cột (psql) — chỉ verify + fix hiển thị nếu lọt (sửa `lib/content` = flag coordinator).

**4.9 e2e i18n-switch (`e2e/i18n-switch.spec.ts`):** mở lesson `/en/books/level-3/units/1/lessons/1/listen-and-type` (seed SF-2) → bấm pill VI switcher → URL `/vi/...` cùng path → text UI đổi (title/lesson) → bấm EN quay lại. Dùng chung infra SF-4 (config :3100, webServer reuse).

**4.10 Error handling:** lesson/book không tồn tại → `notFound()` như page (layout metadata tự fallback: null data → title/desc generic + canonical vẫn chuẩn theo params — KHÔNG throw). Build không DB → sitemap rỗng, OG fallback, metadata title generic — build vẫn xanh (CI).

## 5. Implementation outline (tasks — DAG deps →)

- **T1 `seo-lib-foundation`**: `lib/seo/site.ts` + `jsonld.ts` + sitemap path builders **TDD** (tests viết trước — RED→GREEN) + `messages/{en,vi}/seo.json` + `src/app/{sitemap,robots}.ts`. Exit: `npm test` xanh (tests mới + 0 regression), sitemap/robots render đúng khi dev có DB.
- **T2 `metadata-layouts`**: `(home)` move + home/books/book/unit/lesson/top-users layouts (alternates/desc/OG meta/JSON-LD script lesson+book). Exit: view-source từng route — title, description đúng locale, canonical + hreflang đủ cặp, JSON-LD hiện.
- **T3 `og-images`**: `opengraph-image.tsx` lesson + book (palette B, fallback no-DB). Exit: GET ảnh → PNG render đúng palette; chia-link meta `og:image` trỏ đúng.
- **T4 `fallback-verify-e2e`**: verify fallback chain vi→en→raw qua DB so trang thật + `e2e/i18n-switch.spec.ts`. Exit: e2e PASS; chuỗi fallback ghi evidence (en lesson = en; vi thiếu → en; case raw nếu có).
- **T5 `evidence-review`**: chạy đủ vitest/typecheck/lint/e2e, Rule 0 3 tầng screenshots, evidence `docs/superpowers/evidence/sf-7-seo/test-run.txt`, dispatch code-reviewer độc lập, fix → APPROVED, commit atomic, audit log, story-verify.

Mỗi task = 1 atomic commit (`feat(seo): ...` / chore). KHÔNG `git add -A`.

## 6. Risks & unknowns

- **Must verify (không được giả định):** (R1) hướng merge title layout↔page cùng segment — view-source lesson sau T2; nếu layout đè title → bỏ title khỏi lesson layout. (R2) OG image lúc build không DB → fallback path chạy thật (test build local tắt DB không khả thi — verify bằng unit fallback + code-read, khai báo trung thực). (R3) satori default font render tiếng Việt (dấu) — xem ảnh thật bằng mắt. (R4) middleware không chặn `/sitemap.xml`,`/robots.txt` (matcher loại path có `.` — verify live). (R5) `top-users/layout.tsx` đứng 1 mình không page → build không lỗi (verify build/dev). (R6) ISR: layout không vô hiệu `revalidate=300` của page — verify response header/pages behavior ở T2. (R7) `messages.test.ts` key-set en=vi.
- **Assumptions ghi rõ:** schema có `lessons.updated_at` → check khi code, không có thì omit lastModified (spec 4.4 đã cho phép). JSON-LD body-script hợp lệ cho validator (chuẩn Google — JSON-LD đọc được ở body).
