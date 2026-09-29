import { describe, expect, it } from "vitest";
import { bookPath, lessonPath, unitPath } from "./sitemap-data";

/**
 * T1 seo-lib-foundation — path builders cho sitemap (pure; DB read qua
 * getPublishedLessonRows không test ở đây — integration verify qua dev server).
 */

describe("sitemap path builders", () => {
  it("lessonPath → route listen-and-type", () => {
    expect(lessonPath("level-3", 1, 1)).toBe(
      "/books/level-3/units/1/lessons/1/listen-and-type",
    );
  });

  it("unitPath", () => {
    expect(unitPath("level-3", 12)).toBe("/books/level-3/units/12");
  });

  it("bookPath", () => {
    expect(bookPath("level-7")).toBe("/books/level-7");
  });
});
