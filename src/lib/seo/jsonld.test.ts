import { describe, expect, it } from "vitest";
import { course, learningResource } from "./jsonld";

/**
 * T1 seo-lib-foundation — JSON-LD builders (spec §4.3): LearningResource cho
 * lesson, Course cho book. Schema.org-valid tối thiểu cho schema validator.
 */

const book = course({
  name: "Prepare Level 3",
  description: "English dictation at CEFR A2.",
  url: "https://iloveenglish.club/en/books/level-3",
  cefr: "A2",
});

describe("course()", () => {
  it("đủ @context/@type/name/url/provider", () => {
    expect(book["@context"]).toBe("https://schema.org");
    expect(book["@type"]).toBe("Course");
    expect(book.name).toBe("Prepare Level 3");
    expect(book.url).toBe("https://iloveenglish.club/en/books/level-3");
    expect(book.provider).toEqual({
      "@type": "Organization",
      name: "I Love English Club",
    });
  });

  it("educationalLevel nhận cefr khi có", () => {
    expect(book.educationalLevel).toBe("A2");
  });
});

describe("learningResource()", () => {
  const resource = learningResource({
    name: "Free time activities",
    url: "https://iloveenglish.club/en/books/level-3/units/1/lessons/1/listen-and-type",
    cefr: "A2",
    course: book,
  });

  it("@type LearningResource + inLanguage en (transcript chỉ tiếng Anh)", () => {
    expect(resource["@type"]).toBe("LearningResource");
    expect(resource.inLanguage).toBe("en");
  });

  it("learningResourceType dictation + educationalLevel cefr", () => {
    expect(resource.learningResourceType).toBe("Dictation exercise");
    expect(resource.educationalLevel).toBe("A2");
  });

  it("isPartOf = Course object + provider Organization", () => {
    expect(resource.isPartOf).toEqual(book);
    expect(resource.provider).toEqual({
      "@type": "Organization",
      name: "I Love English Club",
    });
  });
});
