import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tab Tổng quan = dashboard Memrise-style (vocab-memrise SF-4, VU-41) — SSR
 * render với translator dựng từ messages THẬT en/vi (key thiếu một phía làm
 * test fail rõ — giữ pattern cũ). Store mocked: dashboard-store (summary/
 * garden/continue/levels) + hub-store.listDiscoverBooks (Khám phá giữ logic).
 * Contract pin: continue CTA href /vocabulary/learn/[slug] (plain link — SF-3
 * route), sách hoàn thành → KHÔNG link, số liệu đúng qua aria/text.
 */

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "vi" }));

const storeState = vi.hoisted(() => ({
  summary: {
    plantedToday: 3,
    dailyGoalWords: 5,
    totalXp: 1248,
    streak: 7,
    activeToday: true,
    dueToday: 12,
  },
  distribution: [96, 74, 58, 34, 22, 15, 8, 6] as number[],
  continueCard:
    null as null | Record<string, unknown>,
  levelBooks: [] as {
    bookId: number;
    slug: string;
    titleEn: string;
    titleVi: string | null;
    cefrLabel: string;
    progress: {
      levels: { levelIndex: number; planted: number; total: number }[];
      planted: number;
      total: number;
    };
  }[],
  discover: [] as {
    id: number;
    slug: string;
    titleEn: string;
    titleVi: string | null;
    unlearned: number;
  }[],
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    makeT(localeState.locale, namespace),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => makeT(localeState.locale, "vocabulary"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/en/vocabulary",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => createElement("a", props),
}));

vi.mock("@/lib/vocabulary/dashboard-store", () => ({
  getDashboardSummary: async () => storeState.summary,
  getGardenDistribution: async () => storeState.distribution,
  getContinueTarget: async () => storeState.continueCard,
  getBookLevelProgresses: async () => storeState.levelBooks,
}));

vi.mock("@/lib/vocabulary/hub-store", () => ({
  listDiscoverBooks: async () => storeState.discover,
}));

const { HubOverviewSection } = await import("./hub-overview-section");

const MESSAGES_DIR = path.resolve(__dirname, "../../../messages");

function loadDict(
  locale: "en" | "vi",
  namespace: "vocabulary" | "learn",
): Record<string, unknown> {
  const file =
    namespace === "learn" ? "learn.json" : "vocabulary.json";
  return JSON.parse(
    readFileSync(path.join(MESSAGES_DIR, locale, file), "utf8"),
  ) as Record<string, unknown>;
}

function msg(
  locale: "en" | "vi",
  key: string,
  namespace: "vocabulary" | "learn" = "vocabulary",
): string {
  const template = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      loadDict(locale, namespace),
    );
  if (typeof template !== "string") {
    throw new Error(`missing message: ${namespace}.${key} (${locale})`);
  }
  return template;
}

function makeT(locale: "en" | "vi", namespace: string = "vocabulary") {
  return (key: string, values?: Record<string, string | number>): string => {
    const template = msg(locale, key, namespace as "vocabulary" | "learn");
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
  const element = await HubOverviewSection({
    userId: "u1",
    locale: localeState.locale,
    now: new Date("2026-10-04T03:00:00.000Z"),
    name: "Minh",
  });
  // React SSR chèn <!-- --> giữa text nodes liền nhau (3/5 → 3<!-- -->/<!-- -->5)
  return renderToString(element).replaceAll("<!-- -->", "");
}

const CONTINUE_ACTIVE = {
  completed: false,
  bookId: 5,
  slug: "level-5",
  titleEn: "Prepare 5",
  titleVi: null,
  cefrLabel: "B1",
  level: {
    levelIndex: 5,
    words: [
      { wordId: 0, order: 51, reps: 1 },
      { wordId: 1, order: 52, reps: 1 },
      { wordId: 2, order: 53, reps: 1 },
      { wordId: 3, order: 54, reps: 1 },
      { wordId: 4, order: 55, reps: 1 },
      { wordId: 5, order: 56, reps: 0 },
      { wordId: 6, order: 57, reps: 0 },
      { wordId: 7, order: 58, reps: 0 },
      { wordId: 8, order: 59, reps: 0 },
      { wordId: 9, order: 60, reps: 0 },
    ],
  },
  newCount: 5,
};

const BOOK_PROGRESS = (
  over: Partial<{
    bookId: number;
    slug: string;
    titleEn: string;
    titleVi: string | null;
    cefrLabel: string;
    planted: number;
    total: number;
  }> = {},
) => ({
  bookId: over.bookId ?? 5,
  slug: over.slug ?? "level-5",
  titleEn: over.titleEn ?? "Prepare 5",
  titleVi: over.titleVi ?? null,
  cefrLabel: over.cefrLabel ?? "B1",
  progress: {
    levels: [
      {
        levelIndex: 0,
        planted: over.planted ?? 54,
        total: over.total ?? 120,
      },
    ],
    planted: over.planted ?? 54,
    total: over.total ?? 120,
  },
});

beforeEach(() => {
  localeState.locale = "en";
  storeState.summary = {
    plantedToday: 3,
    dailyGoalWords: 5,
    totalXp: 1248,
    streak: 7,
    activeToday: true,
    dueToday: 12,
  };
  storeState.distribution = [96, 74, 58, 34, 22, 15, 8, 6];
  storeState.continueCard = CONTINUE_ACTIVE;
  storeState.levelBooks = [BOOK_PROGRESS()];
  storeState.discover = [];
});

describe("HubOverviewSection — dashboard header + stat row", () => {
  it("[en] greeting + XP pill + goal ring aria + streak + due + review CTA", async () => {
    const html = await renderSection();
    expect(html).toContain("Hi Minh");
    expect(html).toContain("1,248 XP");
    expect(html).toContain(
      esc(makeT("en")("hub.dash.goalRingAria", { planted: 3, goal: 5 })),
    );
    expect(html).toContain("3/5");
    expect(html).toContain(
      esc(makeT("en")("hub.dash.streakDays", { count: 7 })),
    );
    expect(html).toContain(
      esc(makeT("en")("hub.dash.dueValue", { count: 12 })),
    );
    expect(html).toContain('href="/me/vocabulary?scope=all"');
    expect(html).toContain(esc(msg("en", "hub.dash.reviewCta")));
  });

  it("[vi] nhãn theo messages vi", async () => {
    localeState.locale = "vi";
    const html = await renderSection();
    expect(html).toContain(
      esc(makeT("vi")("hub.dash.greeting", { name: "Minh" })),
    );
    expect(html).toContain(msg("vi", "hub.dash.gardenTitle"));
    expect(html).toContain(
      esc(msg("vi", "hub.dash.reviewCta")),
    );
    // garden growing = tổng distribution
    expect(html).toContain(
      esc(makeT("vi")("hub.dash.gardenGrowing", { count: 313 })),
    );
  });

  it("name null → greeting fallback (không crash)", async () => {
    const element = await HubOverviewSection({
      userId: "u1",
      locale: "en",
      now: new Date("2026-10-04T03:00:00.000Z"),
      name: null,
    });
    const html = renderToString(element).replaceAll("<!-- -->", "");
    expect(html).toContain("Hi there");
  });
});

describe("HubOverviewSection — continue card", () => {
  it("level kế tiếp: tên sách + meta Level N · Từ X–Y + CTA href learn/[slug]", async () => {
    const html = await renderSection();
    expect(html).toContain("Prepare 5");
    expect(html).toContain(
      esc(makeT("en")("hub.dash.continueMeta", { level: 6, from: 51, to: 60, count: 5 })),
    );
    expect(html).toContain('href="/vocabulary/learn/level-5"');
    expect(html).toContain(esc(makeT("en")("hub.dash.continueCta", { count: 5 })));
    // progress aria level 6: 5/10 planted
    expect(html).toContain(
      esc(
        makeT("en")("hub.dash.continueProgressAria", {
          level: 6,
          planted: 5,
          total: 10,
        }),
      ),
    );
  });

  it("sách hoàn thành → KHÔNG link learn + tag Hoàn thành (acceptance #4)", async () => {
    storeState.continueCard = { completed: true };
    const html = await renderSection();
    expect(html).not.toContain("/vocabulary/learn/");
    expect(html).toContain(esc(msg("en", "hub.dash.continueDoneTag")));
    expect(html).toContain(esc(msg("en", "hub.dash.continueMetaDone")));
  });

  it("continue null (DB lỗi) → render còn lại, không crash", async () => {
    storeState.continueCard = null;
    const html = await renderSection();
    expect(html).not.toContain("/vocabulary/learn/");
    expect(html).toContain(msg("en", "hub.dash.gardenTitle"));
  });
});

describe("HubOverviewSection — garden + lộ trình sách", () => {
  it("garden 8 cây + legend tên stage từ learn.json", async () => {
    const html = await renderSection();
    expect(html).toContain(msg("en", "hub.dash.gardenAria"));
    expect(html).toContain(
      esc(msg("en", "stage.0", "learn")),
    ); // legend dùng learn.stage.*
    expect(html).toContain(">96<"); // đếm stage 0 text thật
    expect(html).toContain(">6<");
  });

  it("lộ trình: tên sách + chip CEFR + tag + planted/total + bar aria", async () => {
    const html = await renderSection();
    expect(html).toContain(
      esc(makeT("en")("hub.dash.booksTitle", { count: 1 })),
    );
    expect(html).toContain("B1"); // chip CEFR
    expect(html).toContain("54/120");
    expect(html).toContain("Prepare 5: 54/120"); // bar aria-label
    expect(html).toContain(esc(msg("en", "hub.dash.bookTagLearning")));
  });

  it("sách planted hết → tag Hoàn thành", async () => {
    storeState.levelBooks = [BOOK_PROGRESS({ planted: 120, total: 120 })];
    const html = await renderSection();
    expect(html).toContain(esc(msg("en", "hub.dash.bookTagDone")));
  });
});

describe("HubOverviewSection — Khám phá giữ logic + empty", () => {
  it("discover books → dcard: tiêu đề + unlearned + nút bulk seed", async () => {
    storeState.discover = [
      { id: 2, slug: "level-2", titleEn: "Prepare Level 2", titleVi: null, unlearned: 12 },
    ];
    const html = await renderSection();
    expect(html).toContain(msg("en", "hub.discover.title"));
    expect(html).toContain("Prepare Level 2");
    expect(html).toContain(
      makeT("en")("hub.discover.unlearned", { count: 12 }),
    );
    expect(html).toContain((loadDict("en", "vocabulary").bookStudy as { cta: string }).cta);
  });

  it("không có sách nào trong lộ trình → emptyAll + link /books", async () => {
    storeState.levelBooks = [];
    const html = await renderSection();
    expect(html).toContain(esc(msg("en", "hub.emptyAll")));
    expect(html).toContain('href="/books"');
    expect(html).not.toContain(msg("en", "hub.dash.gardenTitle"));
  });

  it("dark toggle render với container id (scope vocabulary)", async () => {
    const html = await renderSection();
    expect(html).toContain('id="vocab-dashboard"');
    expect(html).toContain('aria-label="Switch to dark mode"');
    expect(html).toContain('aria-pressed="false"');
  });
});
