import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalizedBook } from "@/lib/content/queries";

/**
 * Trang /books/[book]/vocabulary (story vocabulary-learn t-1.1) — SSR render
 * trực tiếp (pattern error.test.ts): mỗi dòng từ có nút "Học từ này" dẫn
 * /me/vocabulary?word=<id> (prefill thẻ flashcard có sẵn SF-2), guest bấm vẫn
 * đi (me/vocabulary tự redirect login kèm ?next). Translator dựng từ messages
 * THẬT en/vi — key thiếu (một phía) làm test fail rõ (parity đã có
 * messages.test.ts, ở đây khoá luôn nhãn hiển thị).
 */

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "vi" }));

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async () => makeT(localeState.locale),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound called");
  },
  // BookStudyButton (client) — SSR chỉ render markup, router không chạy
  useRouter: () => ({ push: () => {} }),
}));

// BookStudyButton dùng hook client next-intl — dùng chung translator messages thật
vi.mock("next-intl", () => ({
  useTranslations: () => makeT(localeState.locale),
}));

vi.mock("@/i18n/navigation", () => ({
  // Link (next-intl/navigation) không resolve trong vitest node env — stub <a>
  Link: (props: React.ComponentProps<"a">) => createElement("a", props),
}));

vi.mock("@/components/content/word-play-button", () => ({
  WordPlayButton: (props: { word: string }) =>
    createElement("button", null, `play:${props.word}`),
}));

const fixtures = vi.hoisted(() => ({
  book: null as LocalizedBook | null,
  vocab: [] as {
    id: number;
    word: string;
    ipa: string | null;
    meaningVi: string;
    example: string | null;
    audioUrl: string | null;
  }[],
}));

vi.mock("@/lib/content/queries", () => ({
  getBooks: async () => [],
  getBook: async () => fixtures.book,
  getBookVocabulary: async () => fixtures.vocab,
}));

const BookVocabularyPage = (await import("./page")).default;

const MESSAGES_DIR = path.resolve(
  __dirname,
  "../../../../../../../messages",
);

function loadDict(locale: "en" | "vi"): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(MESSAGES_DIR, locale, "vocabulary.json"), "utf8"),
  ) as Record<string, unknown>;
}

/** bookStudy.cta — section lồng nhau cần cast tường minh (loadDict trả unknown). */
function bookStudyCta(locale: "en" | "vi"): string {
  return (loadDict(locale).bookStudy as { cta: string }).cta;
}

function makeT(locale: "en" | "vi") {
  const dict = loadDict(locale);
  return (
    key: string,
    values?: Record<string, string | number>,
  ): string => {
    const template = key
      .split(".")
      .reduce<unknown>(
        (node, part) =>
          typeof node === "object" && node !== null
            ? (node as Record<string, unknown>)[part]
            : undefined,
        dict,
      );
    if (typeof template !== "string") {
      throw new Error(`missing message: vocabulary.${key} (${locale})`);
    }
    if (!values) return template;
    return template
      .replace(
        /\{(\w+),\s*plural,\s*(?:one \{([^}]*)\}\s*)?other \{([^}]*)\}\}/g,
        (_m, k: string, one: string | undefined, other: string) =>
          (Number(values[k]) === 1 && one !== undefined ? one : other).replace(
            "#",
            String(values[k]),
          ),
      )
      .replace(/\{(\w+)\}/g, (_m, k: string) => String(values[k] ?? ""));
  };
}

function bookFixture(): LocalizedBook {
  return {
    id: 1,
    slug: "level-1",
    title: "Prepare Level 1",
    description: "desc",
    cefrLabel: "A1",
    examTarget: null,
    color: "#2563eb",
    unitCount: 1,
    lessonCount: 1,
  };
}

async function renderPage(): Promise<string> {
  // page là async server component — await để resolve JSX rồi mới SSR
  // (renderToString không chờ được component treo).
  const element = await BookVocabularyPage({
    params: Promise.resolve({ locale: localeState.locale, book: "level-1" }),
  });
  return renderToString(element);
}

function learnHrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*\/me\/vocabulary\?word=\d+)"/g)].map(
    (m) => m[1] ?? "",
  );
}

beforeEach(() => {
  localeState.locale = "en";
  fixtures.book = bookFixture();
  fixtures.vocab = [
    {
      id: 42,
      word: "morning",
      ipa: "ˈmɔːnɪŋ",
      meaningVi: "buổi sáng",
      example: "Good morning!",
      audioUrl: null,
    },
    {
      id: 43,
      word: "evening",
      ipa: "ˈiːvnɪŋ",
      meaningVi: "buổi tối",
      example: null,
      audioUrl: "https://cdn.example.test/evening.mp3",
    },
  ];
});

describe("trang từ vựng per-book — nút Học từ này (t-1.1)", () => {
  it("[en] mỗi dòng từ có link học → /me/vocabulary?word=<id>", async () => {
    const html = await renderPage();
    const hrefs = learnHrefs(html);
    expect(hrefs).toEqual([
      "/me/vocabulary?word=42",
      "/me/vocabulary?word=43",
    ]);
    expect(html).toContain(loadDict("en").learnWord);
  });

  it("[vi] nhãn học theo messages vi", async () => {
    localeState.locale = "vi";
    const html = await renderPage();
    expect(learnHrefs(html)).toHaveLength(2);
    expect(html).toContain(loadDict("vi").learnWord);
  });

  it("sách chưa có từ → không render link học", async () => {
    fixtures.vocab = [];
    const html = await renderPage();
    expect(learnHrefs(html)).toEqual([]);
    expect(html).toContain(loadDict("en").empty);
  });
});

describe("trang từ vựng per-book — nút Bắt đầu học sách này (t-1.2)", () => {
  it("[en] sách có từ → render nút bulk seed lộ trình", async () => {
    const html = await renderPage();
    expect(html).toContain(bookStudyCta("en"));
  });

  it("[vi] nhãn bulk theo messages vi", async () => {
    localeState.locale = "vi";
    const html = await renderPage();
    expect(html).toContain(bookStudyCta("vi"));
  });

  it("sách chưa có từ → không render nút bulk (seed rỗng vô nghĩa)", async () => {
    fixtures.vocab = [];
    const html = await renderPage();
    expect(html).not.toContain(bookStudyCta("en"));
  });
});
