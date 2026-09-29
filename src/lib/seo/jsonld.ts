/**
 * JSON-LD builders (SF-7 spec §4.3) — LearningResource cho lesson, Course cho
 * book (schema.org, đủ tối thiểu cho schema validator; KHÔNG nhắm Course rich
 * result — cái đó cần hasCourseInstance). Pure module.
 */
import { BRAND } from "./site";

type Organization = { "@type": "Organization"; name: string };

export type CourseJsonLd = {
  "@context": "https://schema.org";
  "@type": "Course";
  name: string;
  description: string;
  url: string;
  educationalLevel?: string;
  provider: Organization;
};

export function course(input: {
  name: string;
  description: string;
  url: string;
  cefr?: string;
}): CourseJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: input.name,
    description: input.description,
    url: input.url,
    ...(input.cefr ? { educationalLevel: input.cefr } : {}),
    provider: { "@type": "Organization", name: BRAND },
  };
}

export type LearningResourceJsonLd = {
  "@context": "https://schema.org";
  "@type": "LearningResource";
  name: string;
  url: string;
  inLanguage: "en";
  learningResourceType: "Dictation exercise";
  educationalLevel: string;
  isPartOf: CourseJsonLd;
  provider: Organization;
};

/**
 * Transcript lesson chỉ tiếng Anh (spec §8) → inLanguage cố định "en".
 * isPartOf nhúng trọn Course object (1 @context ở đỉnh).
 */
export function learningResource(input: {
  name: string;
  url: string;
  cefr: string;
  course: CourseJsonLd;
}): LearningResourceJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: input.name,
    url: input.url,
    inLanguage: "en",
    learningResourceType: "Dictation exercise",
    educationalLevel: input.cefr,
    isPartOf: input.course,
    provider: { "@type": "Organization", name: BRAND },
  };
}

/**
 * Serialize JSON-LD cho <script dangerouslySetInnerHTML> — escape `<` thành
 * `<` (escape hợp lệ trong JSON string) chống breakout `</script>` từ
 * content admin (review P1: stored-XSS sink duy nhất của app).
 */
export function jsonldScript(json: object): string {
  return JSON.stringify(json).replace(/</g, "\\u003c");
}
