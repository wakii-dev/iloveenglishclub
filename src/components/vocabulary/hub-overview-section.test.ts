import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tab Tổng quan hub — SSR render (pattern page.test.ts trang sách): section
 * Khám phá (vocabulary-learn t-1.3) chỉ hiện khi listDiscoverBooks trả ≥ 1
 * book còn từ chưa học, mỗi book 1 hàng (tiêu đề + count + nút bulk seed t-
 * 1.2). HubFilters (Radix select) stub — không thuộc đối tượng test. Translator
 * dựng từ messages THẬT en/vi — key thiếu một phía làm test fail rõ.
 */

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "vi" }));

const storeState = vi.hoisted(() => ({
  stats: { total: 3, dueToday: 1, mastered: 1 },
  books: [] as { id: number; title: string }[],
  rows: [] as unknown[],
  discover: [] as {
    id: number;
    slug: string;
    titleEn: string;
    titleVi: string | null;
    unlearned: number;
  }[],
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => makeT(localeState.locale),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => makeT(localeState.locale),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/en/vocabulary",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => createElement("a", props),
}));

vi.mock("@/components/vocabulary/hub-filters", () => ({
  HubFilters: () => createElement("div", null, "filters"),
}));

vi.mock("@/lib/vocabulary/hub-store", () => ({
  getHubStats: async () => storeState.stats,
  listHubBooks: async () => storeState.books,
  listHubWords: async () => storeState.rows,
  listDiscoverBooks: async () => storeState.discover,
}));

const { HubOverviewSection } = await import("./hub-overview-section");

const MESSAGES_DIR = path.resolve(__dirname, "../../../messages");

function loadDict(locale: "en" | "vi"): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(MESSAGES_DIR, locale, "vocabulary.json"), "utf8"),
  ) as Record<string, unknown>;
}

function msg(locale: "en" | "vi", key: string): string {
  const template = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      loadDict(locale),
    );
  if (typeof template !== "string") {
    throw new Error(`missing message: vocabulary.${key} (${locale})`);
  }
  return template;
}

function makeT(locale: "en" | "vi") {
  return (key: string, values?: Record<string, string | number>): string => {
    const template = msg(locale, key);
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

/** renderToString escape ký tự HTML (') → so khớp expectation cùng dạng. */
function esc(text: string): string {
  return text.replaceAll("'", "&#x27;");
}

async function renderSection(): Promise<string> {
  // server component async — await để resolve JSX rồi mới SSR
  const element = await HubOverviewSection({
    userId: "u1",
    sp: {},
    locale: localeState.locale,
    now: new Date("2026-10-04T03:00:00.000Z"),
  });
  return renderToString(element);
}

beforeEach(() => {
  localeState.locale = "en";
  storeState.stats = { total: 3, dueToday: 1, mastered: 1 };
  storeState.books = [];
  storeState.rows = [];
  storeState.discover = [];
});

describe("HubOverviewSection — Khám phá (vocabulary-learn t-1.3)", () => {
  it("[en] có book còn từ chưa học → hàng: tiêu đề sách + count + nút bulk", async () => {
    storeState.discover = [
      { id: 2, slug: "level-2", titleEn: "Prepare Level 2", titleVi: null, unlearned: 12 },
    ];
    const html = await renderSection();
    expect(html).toContain(msg("en", "hub.discover.title"));
    expect(html).toContain("Prepare Level 2");
    expect(html).toContain(esc(msg("en", "hub.discover.lead")));
    // count plural en + nút bulk seed (t-1.2) ngay trên hàng
    expect(html).toContain(makeT("en")("hub.discover.unlearned", { count: 12 }));
    expect(html).toContain((loadDict("en").bookStudy as { cta: string }).cta);
  });

  it("[vi] nhãn theo messages vi, tiêu đề sách lấy titleVi", async () => {
    localeState.locale = "vi";
    storeState.discover = [
      { id: 2, slug: "level-2", titleEn: "Prepare Level 2", titleVi: "Cấp độ 2", unlearned: 3 },
    ];
    const html = await renderSection();
    expect(html).toContain(msg("vi", "hub.discover.title"));
    expect(html).toContain("Cấp độ 2");
    expect(html).toContain(makeT("vi")("hub.discover.unlearned", { count: 3 }));
    expect(html).toContain((loadDict("vi").bookStudy as { cta: string }).cta);
  });

  it("không còn từ chưa học → không render section Khám phá", async () => {
    storeState.discover = [];
    const html = await renderSection();
    expect(html).not.toContain(msg("en", "hub.discover.title"));
  });

  it("KPI + bảng Từ của bạn vẫn render (hành vi SF-1 giữ nguyên)", async () => {
    const html = await renderSection();
    expect(html).toContain(msg("en", "hub.stats.learning"));
    expect(html).toContain(msg("en", "hub.wordsTitle"));
  });
});
