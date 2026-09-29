import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BRAND,
  absoluteUrl,
  buildAlternates,
  composeDescription,
  localePath,
  siteUrl,
} from "./site";

/**
 * T1 seo-lib-foundation (context pack SF-7 #5) — pure helpers cho metadata
 * layer. Test viết TRƯỚC module (TDD RED→GREEN).
 */

const SITE = "https://iloveenglish.club";

describe("siteUrl / absoluteUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("dùng NEXT_PUBLIC_SITE_URL và cắt '/' đuôi", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${SITE}/`);
    expect(siteUrl()).toBe(SITE);
    expect(absoluteUrl("/sitemap.xml")).toBe(`${SITE}/sitemap.xml`);
  });

  it("fallback localhost:3000 khi env thiếu", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("localePath", () => {
  it('path rỗng → "/{locale}" (không //)', () => {
    expect(localePath("en")).toBe("/en");
    expect(localePath("vi", "")).toBe("/vi");
  });

  it("nối path giữ nguyên", () => {
    expect(localePath("vi", "/books")).toBe("/vi/books");
    expect(localePath("en", "/books/level-3/units/1")).toBe(
      "/en/books/level-3/units/1",
    );
  });
});

describe("buildAlternates", () => {
  it("canonical theo locale + cặp en/vi + x-default = en", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    expect(buildAlternates("vi", "/books")).toEqual({
      canonical: `${SITE}/vi/books`,
      languages: {
        en: `${SITE}/en/books`,
        vi: `${SITE}/vi/books`,
        "x-default": `${SITE}/en/books`,
      },
    });
  });

  it("home (path rỗng) không ra //", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    const alts = buildAlternates("en");
    expect(alts.canonical).toBe(`${SITE}/en`);
    expect(alts.languages.vi).toBe(`${SITE}/vi`);
  });
});

describe("composeDescription", () => {
  const template = "{lessonTitle} — {bookTitle} (CEFR {cefr})";
  const vars = { lessonTitle: "Free time", bookTitle: "Level 3", cefr: "A2" };

  it("localized non-trimmed thắng", () => {
    expect(composeDescription("Mô tả riêng", template, vars)).toBe(
      "Mô tả riêng",
    );
  });

  it("null/rỗng/whitespace → fallback template", () => {
    expect(composeDescription(null, template, vars)).toBe(
      "Free time — Level 3 (CEFR A2)",
    );
    expect(composeDescription("", template, vars)).toBe(
      "Free time — Level 3 (CEFR A2)",
    );
    expect(composeDescription("   ", template, vars)).toBe(
      "Free time — Level 3 (CEFR A2)",
    );
    expect(composeDescription(undefined, template, vars)).toBe(
      "Free time — Level 3 (CEFR A2)",
    );
  });

  it("brace không khớp vars giữ nguyên", () => {
    expect(
      composeDescription(null, "{lessonTitle} — {unknown}", vars),
    ).toBe("Free time — {unknown}");
  });
});

describe("BRAND", () => {
  it("brand/provider dùng chung một hằng", () => {
    expect(BRAND).toBe("I Love English Club");
  });
});
