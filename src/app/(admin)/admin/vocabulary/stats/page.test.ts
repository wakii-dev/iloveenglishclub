import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Trang /admin/vocabulary/stats (VU-43 SF-4 t1) — SSR smoke (pattern
 * ../page.test.ts): shell render title/lead + sub-nav tier-0 Stats active +
 * VocabStats (client, initial render không fetch — skeleton). Translator dựng
 * từ messages THẬT vi — key thiếu làm test fail rõ (parity có messages.test).
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/vocabulary/stats",
  notFound: () => {
    throw new Error("notFound called");
  },
}));

const MESSAGES_DIR = path.resolve(__dirname, "../../../../../../messages");

function loadJson(locale: string, file: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(MESSAGES_DIR, locale, file), "utf8"),
  ) as Record<string, unknown>;
}

const STATS = loadJson("vi", "vocab-stats.json") as {
  title: string;
  cards: Record<string, string>;
  perBook: Record<string, string>;
  crawl: Record<string, string>;
};
const CMS_COMMON = loadJson("vi", "vocab-cms-common.json") as {
  tabs: Record<string, string>;
};
const ADMIN = loadJson("vi", "admin.json") as {
  common: Record<string, string>;
};

function lookup(root: unknown, dotted: string): string | undefined {
  let node: unknown = root;
  for (const part of dotted.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function makeT(namespace: string) {
  // SERVER namespace = tên FILE (`vocab-stats`); CLIENT camelCase `vocabStats`
  // (layout provider) + `vocabCmsCommon.tabs` (sub-nav) + `admin.common`.
  const root = namespace.startsWith("vocabStats") || namespace === "vocab-stats"
    ? STATS
    : namespace.startsWith("vocabCmsCommon")
      ? CMS_COMMON
      : ADMIN;
  const prefix = namespace.includes(".")
    ? namespace.slice(namespace.indexOf(".") + 1)
    : "";
  const t = (key: string, values?: Record<string, unknown>): string => {
    const full = prefix ? `${prefix}.${key}` : key;
    const template = lookup(root, full);
    if (template === undefined) {
      throw new Error(`Thiếu message key: ${namespace}.${key}`);
    }
    if (!values) return template;
    return Object.entries(values).reduce(
      (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
      template,
    );
  };
  return Object.assign(t, {
    has: (key: string) =>
      lookup(root, prefix ? `${prefix}.${key}` : key) !== undefined,
  });
}

vi.mock("next-intl/server", () => ({
  getTranslations: async (opts: { namespace: string }) => makeT(opts.namespace),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => makeT(namespace),
}));

const AdminVocabularyStatsPage = (await import("./page")).default;

async function renderPage(): Promise<string> {
  // page là async server component — await resolve JSX rồi mới SSR
  const element = await AdminVocabularyStatsPage();
  return renderToString(element);
}

describe("/admin/vocabulary/stats SSR shell (SF-4 t1)", () => {
  let html: string;
  beforeAll(async () => {
    html = await renderPage();
  });

  it("render title + lead từ vocab-stats (vi)", () => {
    expect(html).toContain(STATS.title);
    expect(html).toContain("Tổng quan toàn bộ words");
  });

  it("render sub-nav tier-0: 3 tab đúng href, Stats active (pathname mock)", () => {
    expect(html).toContain('href="/admin/vocabulary"');
    expect(html).toContain('href="/admin/vocabulary/curation"');
    expect(html).toContain('href="/admin/vocabulary/stats"');
    expect(html).toContain('aria-current="page"');
    // Tab label Stats (vi) — tab khác không active (chỉ 1 aria-current vì
    // pathname = /admin/vocabulary/stats khớp duy nhất tab stats)
    expect(html).toContain(`>${CMS_COMMON.tabs.stats}</a>`);
  });

  it("render stats client shell: skeleton 5 thẻ (aria-busy, chưa fetch — nhãn thẻ hiện sau khi data về)", () => {
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-testid="stats-loading"');
    // 5 skeleton card (CARD_KEYS) — đếm data-slot="card"
    expect((html.match(/data-slot="card"/g) ?? []).length).toBe(5);
    expect(html.length).toBeGreaterThan(1000);
  });
});
