import { expect, test } from "@playwright/test";

/**
 * E2E JSON-LD (SF-5 QA, context pack #3): parse được (không syntax error),
 * KHÔNG còn raw "<" trong script (escape round-trip — unit meta-test
 * jsonld.test.ts giữ GREEN), fields schema.org đúng loại.
 *
 * Lesson JSON-LD: name LOCALIZED theo locale trang (getLesson locale) nhưng
 * inLanguage cố định "en" (transcript chỉ tiếng Anh — spec §8, by design).
 * Fixture tự nhiên: level-3/u1/l1 (title cả 2 locale trong template seed).
 */

const LESSON_PATH = "/books/level-3/units/1/lessons/1/listen-and-type";

const EXPECT = {
  en: { lessonTitle: "Vocabulary — Free time activities", bookTitle: "Level 3" },
  vi: { lessonTitle: "Từ vựng — Hoạt động thời gian rảnh", bookTitle: "Cấp độ 3" },
} as const;

async function jsonLdScripts(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => s.textContent ?? "",
    ),
  );
}

for (const locale of ["en", "vi"] as const) {
  test(`lesson JSON-LD [${locale}]: parse + schema.org fields đúng loại`, async ({ page }) => {
    await page.goto(`/${locale}${LESSON_PATH}`);

    const scripts = await jsonLdScripts(page);
    expect(scripts.length).toBeGreaterThanOrEqual(1);

    // Escape invariant trên TRANG THẬT: không raw "<" nào trong script
    for (const raw of scripts) {
      expect(raw).not.toContain("<");
    }

    // Round-trip: parse ngược được thành object hợp lệ
    const parsed = scripts.map((raw) => JSON.parse(raw));
    const resource = parsed.find((o) => o["@type"] === "LearningResource");
    expect(resource).toBeTruthy();

    // Fields schema.org đúng loại
    expect(resource["@context"]).toBe("https://schema.org");
    expect(resource.inLanguage).toBe("en");
    expect(resource.learningResourceType).toBe("Dictation exercise");
    expect(resource.name).toBe(EXPECT[locale].lessonTitle);
    expect(resource.url).toContain(`/${locale}${LESSON_PATH}`);
    expect(resource.educationalLevel).toMatch(/A2/);
    expect(resource.provider).toEqual({
      "@type": "Organization",
      name: "I Love English Club",
    });

    // isPartOf nhúng trọn Course object (QA-402 observation: @context lồng
    // trong isPartOf — hợp lệ JSON-LD 1.1, parser Google chấp nhận; unit test
    // jsonld.test.ts khóa shape này — BY-DESIGN, không fix)
    expect(resource.isPartOf["@type"]).toBe("Course");
    expect(resource.isPartOf.name).toBe(EXPECT[locale].bookTitle);
    expect(resource.isPartOf.provider["@type"]).toBe("Organization");
  });
}
