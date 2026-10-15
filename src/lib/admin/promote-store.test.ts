import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * promote-store (VU-43 SF-1 task 11) — duplicate predicate skip đếm; advisory
 * lock TRƯỚC max(order); fields promote pin (word trim nguyên văn, ipa uk→us,
 * cefr normalize, pos lowercase, source oxford-ld, example raw sense 1, audio
 * blob best-effort); entry thiếu word → failed không chặn; revalidate 1 lần
 * cuối; 23503 → bookNotFound.
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
  failAtCall: null as { n: number; error: unknown } | null,
  callsMade: 0,
  txCalls: [] as string[],
  insertValues: [] as Record<string, unknown>[],
}));

function chainOf(): unknown {
  const result = dbState.queue.shift();
  dbState.callsMade++;
  const failNow =
    dbState.failAtCall !== null && dbState.callsMade === dbState.failAtCall.n;
  const error = failNow ? dbState.failAtCall!.error : dbState.failWith;
  const p = error !== null ? Promise.reject(error) : Promise.resolve(result);
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

function txMock() {
  return {
    select: () => {
      dbState.txCalls.push("tx-select");
      return chainOf();
    },
    insert: (table: unknown) => {
      dbState.txCalls.push("tx-insert");
      return {
        values: (v: Record<string, unknown>) => {
          dbState.insertValues.push(v);
          return chainOf();
        },
        // shim đủ shape insertWordReturningId (table chỉ dùng cho identity)
        ...(table === null ? {} : {}),
      } as never;
    },
    update: () => chainOf(),
    delete: () => chainOf(),
    execute: (query: { queryChunks?: unknown[] }) => {
      const text = (chunk: unknown): string => {
        if (typeof chunk === "string") return chunk;
        const value = (chunk as { value?: unknown[] }).value;
        return Array.isArray(value) ? value.map(text).join("") : "";
      };
      dbState.txCalls.push(`tx-execute:${(query.queryChunks ?? []).map(text).join("")}`);
      return Promise.resolve([]);
    },
  };
}

vi.mock("@/db", () => ({
  db: {
    select: () => chainOf(),
    insert: () => chainOf(),
    update: () => chainOf(),
    delete: () => chainOf(),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
  },
}));
const revalidateContent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/revalidate", () => ({ CONTENT_TAG: "content", revalidateContent }));

import { PROMOTE_CAP, promoteCrawlEntries } from "./promote-store";

const entry = (over: Record<string, unknown> = {}) => ({
  id: 1,
  word: "  Apple ",
  ipaUk: "/uk/",
  ipaUs: "/us/",
  cefr: " b1 ",
  pos: " Noun ",
  audioUkBlob: "https://blob/uk.mp3",
  audioUsBlob: null,
  example: "I eat an apple.",
  ...over,
});

beforeEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.failAtCall = null;
  dbState.callsMade = 0;
  dbState.txCalls = [];
  dbState.insertValues = [];
});
afterEach(() => {
  revalidateContent.mockClear();
});

describe("promoteCrawlEntries", () => {
  it("2 entries đủ meanings → 2 word mới đúng fields pin (word trim nguyên văn, ipa uk→us, cefr normalize, pos lowercase, source oxford-ld, example, audio blob)", async () => {
    dbState.queue = [
      [entry(), entry({ id: 2, word: "banana", cefr: "Z9" })], // fetch entries
      [], // existing words (không dup)
      [{ max: 0 }], // tx: max(order) book
      [{ id: 101 }], // insert word 1
      [{ wordId: 101 }], // attach book
      [{ id: 102 }], // insert word 2
      [{ wordId: 102 }], // attach book
    ];
    const result = await promoteCrawlEntries([1, 2], 7, {
      "1": "quả táo",
      "2": "quả chuối",
    });
    expect(result).toEqual({
      ok: true,
      report: { created: 2, duplicates: 0, failed: [] },
    });
    expect(dbState.insertValues[0]).toMatchObject({
      word: "Apple", // trim NGUYÊN VĂN (case-sensitive unique giữ semantics)
      meaningVi: "quả táo", // insert VALUES theo property-name Drizzle
      ipa: "/uk/", // uk ưu tiên us
      cefr: "B1", // ' b1 ' normalize
      pos: "noun",
      source: "oxford-ld",
      example: "I eat an apple.",
      audioUrl: "https://blob/uk.mp3",
    });
    // insertValues: [word1, attach1(book_words), word2, attach2]
    expect(dbState.insertValues[2]).toMatchObject({
      word: "banana",
      cefr: null, // 'Z9' lệch allowlist → null (không fail batch)
      pos: "noun",
    });
    // advisory lock TRƯỚC max(order)
    const lockIdx = dbState.txCalls.findIndex((c) => c.startsWith("tx-execute:select pg_advisory_xact_lock"));
    const maxIdx = dbState.txCalls.indexOf("tx-select");
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeLessThan(maxIdx);
    expect(revalidateContent).toHaveBeenCalledTimes(1); // 1 lần cuối batch
  });

  it("duplicate predicate: entry word trùng (lower+trim) words → duplicates++ skip, KHÔNG insert", async () => {
    dbState.queue = [
      [entry({ word: " Apple " })],
      [{ hw: "apple" }], // words có sẵn 'apple'
      [{ max: 0 }], // tx: max(order) (chạy trước vòng lặp — dup skip trong loop)
    ];
    const result = await promoteCrawlEntries([1], 7, { "1": "quả táo" });
    expect(result).toEqual({ ok: true, report: { created: 0, duplicates: 1, failed: [] } });
    expect(dbState.insertValues).toHaveLength(0);
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });

  it("entry thiếu word (null) → failed invalidEntryWord KHÔNG chặn entry khác", async () => {
    dbState.queue = [
      [entry({ id: 1, word: null }), entry({ id: 2, word: "banana" })],
      [], // existing
      [{ max: 0 }], // tx: max(order)
      [{ id: 102 }],
      [{ wordId: 102 }],
    ];
    const result = await promoteCrawlEntries([1, 2], 7, { "1": "a", "2": "quả chuối" });
    expect(result).toEqual({
      ok: true,
      report: { created: 1, duplicates: 0, failed: [{ entryId: 1, error: "invalidEntryWord" }] },
    });
  });

  it("entry id không tồn tại → failed notFound; insert conflict exact-case → duplicates", async () => {
    dbState.queue = [
      [entry()], // chỉ entry 1 tồn tại
      [],
      [{ max: 0 }], // tx: max(order)
      [], // insert word 1 → conflict (returning rỗng)
    ];
    const result = await promoteCrawlEntries([1, 99], 7, { "1": "quả táo", "99": "x" });
    expect(result).toEqual({
      ok: true,
      report: { created: 0, duplicates: 1, failed: [{ entryId: 99, error: "notFound" }] },
    });
  });

  it("FK 23503 → bookNotFound (không report nửa vời)", async () => {
    dbState.queue = [
      [entry()],          // call 1: fetch entries
      [],                 // call 2: existing-words dup check
      [{ max: 0 }],       // call 3: tx max(order)
      [{ id: 201 }],      // call 4: insert word ok
      // call 5: attach book_words → 23503 (book không tồn tại) → rollback all
    ];
    dbState.failAtCall = { n: 5, error: { code: "23503" } };
    const result = await promoteCrawlEntries([1], 99, { "1": "quả táo" });
    expect(result).toEqual({ ok: false, error: "bookNotFound" });
  });

  it("PROMOTE_CAP = 200 (client chunk >200 — spec §5.1)", () => {
    expect(PROMOTE_CAP).toBe(200);
  });
});
