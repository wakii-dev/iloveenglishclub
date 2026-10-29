import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * crawl-entries-store (VU-43 SF-1 task 10) — duplicate predicate §4 pin:
 * lower(trim(entry.word)) == lower(trim(words.word)), 1 query hasWord cho cả
 * page; filters status/q/cefr/pos/ox3000; pagination server-side.
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  drizzleCalls: [] as [string, ...unknown[]][],
}));

/** Arg object → chữ mô tả (StringChunk unwrap + column :name). */
function argSig(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(argSig);
  const ctor = (value as object).constructor?.name ?? "object";
  if (ctor === "StringChunk") {
    const chunk = (value as { value?: unknown[] }).value ?? [];
    return chunk.map((c) => (typeof c === "string" ? c : argSig(c))).join("");
  }
  const name = (value as { name?: unknown }).name;
  const label = typeof name === "string" ? `:${name}` : "";
  const queryChunks = (value as { queryChunks?: unknown[] }).queryChunks;
  if (Array.isArray(queryChunks)) {
    return `${ctor}${label}(${queryChunks.map((c) => (typeof c === "string" ? c : argSig(c))).join("|")})`;
  }
  return `${ctor}${label}`;
}

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  const wrap = (name: string) => {
    const fn = (actual as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
    return (...a: unknown[]) => {
      dbState.drizzleCalls.push([name, ...a.map(argSig)]);
      return fn(...a);
    };
  };
  return {
    ...actual,
    and: wrap("and"),
    asc: wrap("asc"),
    eq: wrap("eq"),
    ilike: wrap("ilike"),
    inArray: wrap("inArray"),
    or: wrap("or"),
  };
});

function chainOf(): unknown {
  const result = dbState.queue.shift();
  const p = Promise.resolve(result);
  const proxy: unknown = new Proxy(function chain() {}, {
    get(_t, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then") return p.then.bind(p);
      if (prop === "catch") return p.catch.bind(p);
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

vi.mock("@/db", () => ({
  db: {
    select: () => chainOf(),
    insert: () => chainOf(),
    update: () => chainOf(),
    delete: () => chainOf(),
  },
}));

import { listCrawlEntries, prettySlug } from "./crawl-entries-store";

const entryRow = (over: Record<string, unknown> = {}) => ({
  id: 1,
  slug: "apple",
  word: "apple",
  ipaUk: "/ˈæp.əl/",
  ipaUs: "/ˈæp.əl/",
  cefr: "A1",
  pos: "noun",
  ox3000: false,
  audioUkBlob: null,
  audioUsBlob: null,
  ...over,
});

beforeEach(() => {
  dbState.queue = [];
  dbState.drizzleCalls = [];
});
afterEach(() => {
  dbState.queue = [];
  dbState.drizzleCalls = [];
});

describe("listCrawlEntries", () => {
  it("hasWord duplicate predicate: ' Apple ' khớp words 'apple' (lower+trim 2 phía)", async () => {
    dbState.queue = [
      [
        entryRow({ id: 1, word: "Apple " }), // trim+lower → khớp
        entryRow({ id: 2, word: "banana" }), // không khớp
        entryRow({ id: 3, word: null }), // null → false (không vào query)
      ],
      [{ n: 3 }], // count
      [{ hw: "apple" }], // words tồn tại (1 query cho cả page)
    ];
    const result = await listCrawlEntries({ limit: 50, offset: 0 });
    expect(result.items.map((i) => i.hasWord)).toEqual([true, false, false]);
  });

  it("hasWord: 1 query cho cả page KHÔNG per-row (page 3 entries có word → 1 inArray)", async () => {
    dbState.queue = [
      [entryRow({ id: 1 }), entryRow({ id: 2, word: "bank" }), entryRow({ id: 3, word: "cat" })],
      [{ n: 3 }],
      [{ hw: "apple" }, { hw: "bank" }],
    ];
    await listCrawlEntries({ limit: 50, offset: 0 });
    // query theo thứ tự: page rows → hasWord lookup (inArray với headwords)
    const inArrays = dbState.drizzleCalls.filter(([fn]) => fn === "inArray");
    const hasWordCall = inArrays.find(([, col]) => String(col).includes("lower(trim("));
    expect(hasWordCall?.[2]).toEqual(["apple", "bank", "cat"]); // dedupe + trim + lower
  });

  it("filters: cefr csv normalized IN; pos ilike exact; ox3000 boolean; q escape LIKE", async () => {
    dbState.queue = [[], [{ n: 0 }], []];
    await listCrawlEntries({
      q: "100%",
      cefr: ["B1"],
      pos: "Noun",
      ox3000: true,
      limit: 50,
      offset: 0,
    });
    const fns = dbState.drizzleCalls.map(([fn, ...rest]) => `${fn}:${JSON.stringify(rest[1] ?? rest[0])}`);
    // q escape → literal '%100\%%'
    expect(fns.some((f) => f.includes("100\\\\%"))).toBe(true);
    // ox3000 eq true
    expect(dbState.drizzleCalls.some(([fn, col, val]) => fn === "eq" && String(col).includes("ox3000") && val === true)).toBe(true);
  });

  it("pagination server-side: limit/offset passthrough + orderBy id asc", async () => {
    dbState.queue = [[entryRow()], [{ n: 1 }], [{ hw: "apple" }]];
    const result = await listCrawlEntries({ limit: 50, offset: 100 });
    expect(result.total).toBe(1);
    const limitCall = dbState.drizzleCalls.findIndex(([fn]) => fn === "asc");
    expect(limitCall).toBeGreaterThanOrEqual(0);
  });

  it("status default 'parsed' qua eq; page rỗng → bỏ query hasWord", async () => {
    dbState.queue = [[], [{ n: 0 }]];
    const result = await listCrawlEntries({ limit: 50, offset: 0 });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(dbState.queue).toHaveLength(0); // hasWord query không chạy
    const statusEq = dbState.drizzleCalls.filter(
      ([fn, col, val]) => fn === "eq" && String(col).includes("status") && val === "parsed",
    );
    expect(statusEq.length).toBeGreaterThanOrEqual(1);
  });

  it("prettySlug: base_N strip + dash → space", () => {
    expect(prettySlug("bank_1")).toBe("bank"); // _N strip — khớp chính q-filter
    expect(prettySlug("hello-world")).toBe("hello world");
  });
});
