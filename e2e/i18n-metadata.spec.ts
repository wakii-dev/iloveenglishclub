import dotenv from "dotenv";
import { expect, test } from "@playwright/test";

/**
 * E2E i18n metadata parity (SF-5 QA, context pack #1): /en và /vi cùng trang →
 * title/description đúng ngôn ngữ; canonical + hreflang là CẶP (en↔vi) trỏ
 * cùng resource; og:locale khớp; og:image trỏ /api/og đúng locale.
 *
 * Origin neo NEXT_PUBLIC_SITE_URL (dotenv .env.local, fallback localhost:3000
 * — giá trị main giữ nguyên ở mọi worktree; domain thật đo ở SF-6).
 * Re-runnable trên DB bất kỳ: chỉ dùng fixture tự nhiên template (home, /books,
 * level-3/u1/l1) — không tạo row.
 */

dotenv.config({ path: ".env.local" });
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

type HeadMeta = {
  title: string;
  canonical: string | null;
  hreflang: Record<string, string>;
  description: string | null;
  ogLocale: string | null;
  ogImage: string | null;
};

async function headMeta(page: import("@playwright/test").Page): Promise<HeadMeta> {
  return page.evaluate(() => {
    const hreflang: Record<string, string> = {};
    for (const l of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
      const key = l.getAttribute("hreflang");
      const href = l.getAttribute("href");
      if (key && href) hreflang[key] = href;
    }
    return {
      title: document.title,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      hreflang,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
      ogLocale: document.querySelector('meta[property="og:locale"]')?.getAttribute("content") ?? null,
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null,
    };
  });
}

const CONTENT_ROUTES = [
  { path: "", titlePart: { en: /Free English Dictation Practice/i, vi: /Luyện chép chính tả/ } },
  { path: "/books", titlePart: { en: /Choose your level/i, vi: /Chọn cấp độ/ } },
  // Book/lesson có OG file-convention RIÊNG override /api/default (by design
  // — lib/seo/metadata.ts) → ogImageExpect phân biệt
  {
    path: "/books/level-3",
    titlePart: { en: /Level 3/i, vi: /Cấp độ 3/ },
    ogImageExpect: "file" as const,
  },
  { path: "/books/level-3/units/1", titlePart: { en: /Free time/i, vi: /Thời gian rảnh/ } },
  {
    path: "/books/level-3/units/1/lessons/1/listen-and-type",
    titlePart: { en: /Free time activities/i, vi: /Hoạt động thời gian rảnh/ },
    ogImageExpect: "file" as const,
  },
];

test.describe("content routes — canonical/hreflang cặp + title đúng locale", () => {
  for (const route of CONTENT_ROUTES) {
    for (const locale of ["en", "vi"] as const) {
      test(`${route.path || "/"} [${locale}]`, async ({ page }) => {
        await page.goto(`/${locale}${route.path}`);

        const meta = await headMeta(page);

        // Title đúng ngôn ngữ (title template `· I Love English Club`)
        expect(meta.title).toMatch(route.titlePart[locale]);

        // Canonical trỏ đúng resource theo locale
        expect(meta.canonical).toBe(`${SITE}/${locale}${route.path}`);

        // Hreflang là CẶP en↔vi cùng path + x-default → en
        expect(meta.hreflang[locale]).toBe(`${SITE}/${locale}${route.path}`);
        expect(meta.hreflang[locale === "en" ? "vi" : "en"]).toBe(
          `${SITE}/${locale === "en" ? "vi" : "en"}${route.path}`,
        );
        expect(meta.hreflang["x-default"]).toBe(`${SITE}/en${route.path}`);

        // og:locale khớp + og:image: default /api/og đúng locale, riêng
        // book/lesson là file-convention override (absolute URL host hiện tại)
        expect(meta.ogLocale).toBe(locale);
        if (route.ogImageExpect === "file") {
          expect(meta.ogImage).toContain("/opengraph-image");
        } else {
          expect(meta.ogImage).toContain(`/api/og?locale=${locale}`);
        }

        // Description luôn có (composeDescription bảo đảm không rỗng)
        expect(meta.description?.trim().length ?? 0).toBeGreaterThan(20);
      });
    }
  }
});

test.describe("auth pages — canonical/hreflang + description đúng locale (QA-401)", () => {
  const AUTH_PAGES = [
    {
      path: "/login",
      titlePart: { en: /Welcome back/i, vi: /Chào mừng trở lại/ },
      descPart: { en: /Log in to continue/i, vi: /Đăng nhập/ },
    },
    {
      path: "/register",
      titlePart: { en: /Create your account/i, vi: /Tạo tài khoản/ },
      descPart: { en: /Sign up to save/i, vi: /Đăng ký để lưu/ },
    },
  ];

  for (const page_ of AUTH_PAGES) {
    for (const locale of ["en", "vi"] as const) {
      test(`${page_.path} [${locale}]`, async ({ page }) => {
        await page.goto(`/${locale}${page_.path}`);

        const meta = await headMeta(page);

        expect(meta.title).toMatch(page_.titlePart[locale]);
        // QA-401: không còn trang public nào thiếu canonical/hreflang
        expect(meta.canonical).toBe(`${SITE}/${locale}${page_.path}`);
        expect(meta.hreflang[locale]).toBe(`${SITE}/${locale}${page_.path}`);
        expect(meta.hreflang[locale === "en" ? "vi" : "en"]).toBe(
          `${SITE}/${locale === "en" ? "vi" : "en"}${page_.path}`,
        );
        // Description đúng ngôn ngữ (trước fix kế thừa text EN cứng ở /vi)
        expect(meta.description ?? "").toMatch(page_.descPart[locale]);
      });
    }
  }
});
