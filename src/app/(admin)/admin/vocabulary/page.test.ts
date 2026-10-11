import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Trang /admin/vocabulary (VU-43 SF-2 t1) — SSR smoke (pattern page.test.ts
 * vocabulary public): shell render title/lead + sub-nav tier-0 + VocabularyCatalog
 * (client, initial render không fetch — data null → bảng khung). Translator
 * dựng từ messages THẬT vi — key thiếu làm test fail rõ (parity đã có
 * messages.test.ts).
 */

const fixtures = vi.hoisted(() => ({
  books: [
    { id: 1, slug: "qa-book-a", title: "QA Book A" },
    { id: 2, slug: "qa-book-b", title: "QA Book B" },
  ],
}));

vi.mock("@/lib/admin/queries", () => ({
  getAdminBooks: async () => fixtures.books,
}));

// usePathname (AdminNav + VocabularySubNav) — ngoài router render tĩnh
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/vocabulary",
  notFound: () => {
    throw new Error("notFound called");
  },
}));

const MESSAGES_DIR = path.resolve(__dirname, "../../../../../messages");

function loadJson(locale: string, file: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(MESSAGES_DIR, locale, file), "utf8"),
  ) as Record<string, unknown>;
}

const CATALOG = loadJson("vi", "vocab-catalog.json") as {
  filters: Record<string, string>;
  columns: Record<string, string>;
  add: Record<string, string>;
  bulk: Record<string, string>;
};
const CMS_COMMON = loadJson("vi", "vocab-cms-common.json");
const ADMIN = loadJson("vi", "admin.json");

function lookup(root: unknown, dotted: string): string | undefined {
  let node: unknown = root;
  for (const part of dotted.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function makeT(namespace: string) {
  // SERVER getTranslations dùng namespace tên FILE (`vocab-catalog` — loader
  // theo basename); CLIENT dùng camelCase `vocabCatalog` (layout provider).
  const root = namespace.startsWith("vocabCmsCommon")
    ? CMS_COMMON
    : namespace.startsWith("vocabCatalog") || namespace === "vocab-catalog"
      ? CATALOG
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
  return Object.assign(t, { has: (key: string) => lookup(root, prefix ? `${prefix}.${key}` : key) !== undefined });
}

vi.mock("next-intl/server", () => ({
  getTranslations: async (opts: { namespace: string }) => makeT(opts.namespace),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => makeT(namespace),
}));

const AdminVocabularyCatalogPage = (await import("./page")).default;

async function renderPage(): Promise<string> {
  // page là async server component — await resolve JSX rồi mới SSR
  // (renderToString không chờ được component treo).
  const element = await AdminVocabularyCatalogPage();
  return renderToString(element);
}

describe("/admin/vocabulary SSR shell (SF-2 t1)", () => {
  let html: string;
  // beforeEach không cần — render 1 lần cho cả describe (tĩnh)
  beforeAll(async () => {
    html = await renderPage();
  });

  it("render title + lead từ vocabCatalog", () => {
    expect(html).toContain("Từ vựng");
    expect(html).toContain("Catalog toàn bộ từ vựng");
  });

  it("render sub-nav tier-0: 3 tab đúng href, Catalog active", () => {
    expect(html).toContain('href="/admin/vocabulary"');
    expect(html).toContain('href="/admin/vocabulary/curation"');
    expect(html).toContain('href="/admin/vocabulary/stats"');
    expect(html).toContain('aria-current="page"'); // Catalog (pathname mock)
  });

  it("render catalog client shell: search + add + export + bảng khung", () => {
    expect(html).toContain(CATALOG.filters.search as string);
    expect(html).toContain(CATALOG.add.button as string);
    expect(html).toContain(CATALOG.bulk.export as string);
    expect(html).toContain(CATALOG.columns.word as string);
    expect(html).toContain(CATALOG.columns.books as string);
  });

  it("books prop truyền xuống — không crash khi getAdminBooks trả 2 books", () => {
    // fetch chưa chạy (SSR không effect) → không có book chip; quan trọng là
    // render không ném với books list — smoke ở trên đã cover qua html.
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(1000);
  });
});
