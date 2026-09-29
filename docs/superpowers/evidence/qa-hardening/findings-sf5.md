# Findings registry — SF-5 SEO/i18n/public pages

Dải ID: **QA-400–499** (contract: findings-sf1.md — row format spec VU-24 §4).

## Findings

| ID | Sev | Surface | Repro | Root cause | Fix commit | Regression test | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| QA-401 | P2 | seo/public-auth | `GET /vi/login` → 0 canonical/hreflang/og, `meta[description]` = text EN cứng kế thừa layout cha ("English dictation practice following…"); tương tự `/en|vi/register` | `login/register` page.tsx `generateMetadata` chỉ trả `{ title }` — không qua `buildPageMetadata` (SF-7 chỉ phủ home/books/book/unit/lesson/top-users) | `7352829` | `e2e/i18n-metadata.spec.ts` auth suite 4 test (RED 4/4 trước fix → GREEN sau) | **FIXED** | RED→GREEN: `8 failed` (metadata spec run 1, auth 4 + og-image spec 4 do assertion chưa phân biệt file-convention) → `14 passed` (auth 4 + content 10) sau fix `7352829` |
| QA-402 | P2 | seo/jsonld | `GET /en/books/…/listen-and-type` → JSON-LD `isPartOf` lồng `@context: schema.org` (2 @context trong 1 script) | `learningResource()` nhúng trọn object `course()` — builder `course()` tự mang `@context` (unit `jsonld.test.ts` khóa shape này) | — | — | **BY-DESIGN** | Rationale: nested `@context` trỏ cùng IRI là JSON-LD 1.1 hợp lệ, Google Rich Results parse bình thường; document string "1 @context ở đỉnh" vẫn đúng ở tầng resource; fix = churn unit test + shape không sai. E2E `i18n-jsonld.spec.ts` assert shape thật + comment observation |

## Observations (không phải defect — ghi để SF-6/checklist sau dùng)

1. **`/opengraph-image` bare path → 404 ở dev** (book/lesson): Next dev chỉ serve URL hashed từ meta (`opengraph-image-<hash>?<v>` → 200 png). Contract consumers = og:image trong meta (crawl theo meta) — không user-visible. Prod smoke SF-6 sẽ đo trên domain thật.
2. **`/top-users` title mỏng** ("I Love English Club" default, cùng en/vi): layout đã có canonical/hreflang đầy đủ; chỉ thiếu title riêng — không có messages key; neu muốn thì thêm key `seo.topUsersTitle` en+vi (by-design để nguyên, SF-6 gamification surface).
3. **`og:locale` dạng `en`/`vi` (language-only)** thay vì `en_US`: next-intl locales language-only; Facebook parser chấp nhận; không impact Google.
4. **Error boundary không trigger được qua URL ở dev**: dev overlay chặn server-error; app không có path tự nhiên gây throw (mọi param lạ → notFound). `error.tsx` verify bằng SSR render test (en/vi/digest) + prod thật là SF-6. Recovery click (`reset`) là wiring Next built-in — không assert được ở SSR, ghi nhận trung thực.
5. **Orca embedded browser quirk**: CDP screenshot timeout + smooth-scroll (`scrollBy`) không chạy khi tab không surfaced; tương tác carousel verify bằng Playwright Chromium (trusted click) — instrument đúng, không phải bug app (khớp fallback Rule 0 đã dùng ở SF-2/SF-24/SF-1).
6. **Sitemap URL neo `localhost:3000`** (NEXT_PUBLIC_SITE_URL main) trong khi server 3212 — local-mode artifact theo context pack; e2e rewrite origin khi fetch thật. Prod domain = SF-6.
