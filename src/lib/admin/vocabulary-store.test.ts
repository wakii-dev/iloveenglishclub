import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Vocabulary DB leg (SF-1 t-1.2) — mock @/db chainable (mỗi chain = 1 query
 * được await, pop kết quả theo THỨ TỰ gọi). Contract: order=max+1 attach,
 * import idempotent (new insert / reuse / skip), revalidate sau mutation,
 * 23503→bookNotFound, 23505→duplicateWord, notFound 404-leg.
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
  // VU-43 SF-1: ghi arg primitive (số/chuỗi/mảng) mỗi method call — pin
  // tham số filter (LIKE escaped, cefr IN-list, bookId, limit/offset)
  calls: [] as [string, ...unknown[]][],
  // Gọi hàm drizzle-orm (eq/isNull/orderBy…) — pin điều kiện WHERE/ORDER v2
  drizzleCalls: [] as [string, ...unknown[]][],
}));

/** Arg object (column/SQL) → chữ mô tả; primitive giữ nguyên — so khớp được. */
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

// Spy drizzle-orm (passthrough behavior — chỉ ghi call): pin WHERE/ORDER của
// listVocabulary v2 mà không đụng SQL thật.
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
    desc: wrap("desc"),
    eq: wrap("eq"),
    ilike: wrap("ilike"),
    inArray: wrap("inArray"),
    isNotNull: wrap("isNotNull"),
    isNull: wrap("isNull"),
    or: wrap("or"),
  };
});

function chainOf(): unknown {
  const result = dbState.queue.shift();
  const p =
    dbState.failWith !== null ? Promise.reject(dbState.failWith) : Promise.resolve(result);
  // Callable target + self-reference qua closure — mọi method call trả chính
  // proxy (raw target sẽ mất trap, lỗi ".x is not a function")
  const proxy: unknown = new Proxy(function chain() {}, {
    get(_t, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then") return p.then.bind(p);
      if (prop === "catch") return p.catch.bind(p);
      return (...args: unknown[]) => {
        dbState.calls.push([String(prop), ...args.map(argSig)]);
        return proxy;
      };
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

function txMock() {
  return {
    select: () => chainOf(),
    insert: () => chainOf(),
    update: () => chainOf(),
    delete: () => chainOf(),
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

import {
  createVocabularyWord,
  deleteVocabularyWord,
  importVocabulary,
  listVocabulary,
  updateVocabularyWord,
} from "./vocabulary-store";
import type { ParsedWordRow } from "./vocabulary";

const row = (line: number, word: string): ParsedWordRow => ({
  line,
  word,
  meaning_vi: "nghĩa",
  ipa: null,
  example: null,
  audio_url: null,
});

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.calls = [];
  dbState.drizzleCalls = [];
  revalidateContent.mockClear();
});

describe("createVocabularyWord", () => {
  it("word mới: insert → attach books theo max+1 → revalidate", async () => {
    dbState.queue = [
      [{ id: 7 }], // insert words returning
      [{ max: 3 }], // select max order book 1
      [{ wordId: 7 }], // attach book 1
      [{ max: 0 }], // select max order book 2
      [{ wordId: 7 }], // attach book 2
    ];
    const result = await createVocabularyWord(
      { word: "apple", meaning_vi: "quả táo", ipa: null, example: null, audio_url: null },
      [1, 2],
    );
    expect(result).toEqual({ ok: true, id: 7, duplicate: false });
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });

  it("word đã tồn tại → duplicate=true, vẫn attach (idempotent)", async () => {
    dbState.queue = [
      [], // insert onConflictDoNothing → không trả
      [{ id: 7 }], // select existing
      [{ max: 1 }],
      [{ wordId: 7 }],
    ];
    const result = await createVocabularyWord(
      { word: "apple", meaning_vi: "quả táo", ipa: null, example: null, audio_url: null },
      [1],
    );
    expect(result).toEqual({ ok: true, id: 7, duplicate: true });
  });

  it("word đã tồn tại + input cefr/source (crawl-on-add) → vẫn attach + COALESCE set SF-2", async () => {
    dbState.queue = [
      [], // insert onConflictDoNothing → không trả
      [{ id: 7 }], // select existing
      [{ id: 7 }], // update coalesce cefr/source (word đã có giữ nguyên)
      [{ max: 1 }],
      [{ wordId: 7 }],
    ];
    const result = await createVocabularyWord(
      {
        word: "apple",
        meaning_vi: "quả táo",
        ipa: "/ˈæp.əl/",
        example: null,
        audio_url: null,
        cefr: "A1",
        source: "oxford-ld",
      },
      [1],
    );
    expect(result).toEqual({ ok: true, id: 7, duplicate: true });
  });

  it("word mới + cefr/source (SF-2) → insert ghi đủ", async () => {
    dbState.queue = [
      [{ id: 9 }],
      [{ max: 0 }],
      [{ wordId: 9 }],
    ];
    const result = await createVocabularyWord(
      {
        word: "tree",
        meaning_vi: "cây",
        ipa: null,
        example: null,
        audio_url: null,
        cefr: "A1",
        source: "oxford-ld",
      },
      [1],
    );
    expect(result).toEqual({ ok: true, id: 9, duplicate: false });
  });

  it("FK 23503 (book không tồn tại) → bookNotFound, không crash", async () => {
    dbState.queue = [[{ id: 7 }], [{ max: 0 }]];
    dbState.failWith = { code: "23503" };
    const result = await createVocabularyWord(
      { word: "apple", meaning_vi: "b", ipa: null, example: null, audio_url: null },
      [99],
    );
    expect(result).toEqual({ ok: false, error: "bookNotFound" });
    expect(revalidateContent).not.toHaveBeenCalled();
  });

  it("lỗi lạ → rethrow (không nuốt)", async () => {
    dbState.failWith = new Error("boom");
    await expect(
      createVocabularyWord(
        { word: "a", meaning_vi: "b", ipa: null, example: null, audio_url: null },
        [],
      ),
    ).rejects.toThrow("boom");
  });
});

describe("updateVocabularyWord", () => {
  it("cập nhật thành công → ok + revalidate", async () => {
    dbState.queue = [[{ id: 1 }]];
    const result = await updateVocabularyWord(1, { meaningVi: "nghĩa mới" });
    expect(result).toEqual({ ok: true });
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });

  it("id không tồn tại → notFound (404-leg), không revalidate", async () => {
    dbState.queue = [[]];
    const result = await updateVocabularyWord(99, { meaningVi: "x" });
    expect(result).toEqual({ ok: false, error: "notFound" });
    expect(revalidateContent).not.toHaveBeenCalled();
  });

  it("23505 (word trùng) → duplicateWord (409-leg)", async () => {
    dbState.failWith = { code: "23505" };
    const result = await updateVocabularyWord(1, { word: "trùng" });
    expect(result).toEqual({ ok: false, error: "duplicateWord" });
  });
});

describe("deleteVocabularyWord", () => {
  it("xoá được → true + revalidate; không thấy id → false", async () => {
    dbState.queue = [[{ id: 1 }]];
    expect(await deleteVocabularyWord(1)).toBe(true);
    expect(revalidateContent).toHaveBeenCalledTimes(1);

    dbState.queue = [[]];
    expect(await deleteVocabularyWord(99)).toBe(false);
    expect(revalidateContent).toHaveBeenCalledTimes(1); // chỉ call lúc có xoá
  });
});

describe("importVocabulary", () => {
  it("2 dòng: mới → imported+linked; có sẵn → reuse + skip attach", async () => {
    dbState.queue = [
      [{ max: 5 }], // max order book
      [{ id: 11 }], // row1 insert mới
      [{ wordId: 11 }], // row1 attach
      [], // row2 conflict
      [{ id: 12 }], // row2 select existing
      [], // row2 attach conflict (đã trong book) → skipped
    ];
    const report = await importVocabulary(1, [row(2, "apple"), row(3, "banana")]);
    expect(report).toEqual({ imported: 1, linked: 1, skipped: 1, errors: [] });
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });

  it("rows rỗng → report 0, KHÔNG đụng DB (queue còn nguyên)", async () => {
    const report = await importVocabulary(1, []);
    expect(report).toEqual({ imported: 0, linked: 0, skipped: 0, errors: [] });
    expect(dbState.queue).toHaveLength(0);
    expect(revalidateContent).not.toHaveBeenCalled();
  });

  it("order nối tiếp max hiện có (max=5 → attach order 6)", async () => {
    dbState.queue = [
      [{ max: 5 }],
      [{ id: 11 }],
      [{ wordId: 11 }],
    ];
    const report = await importVocabulary(1, [row(1, "apple")]);
    expect(report).toEqual({ imported: 1, linked: 1, skipped: 0, errors: [] });
  });
});

describe("listVocabulary", () => {
  const wordRow = {
    id: 1,
    word: "apple",
    ipa: null,
    meaningVi: "quả táo",
    example: null,
    audioUrl: null,
    cefr: "A1",
    source: "oxford-ld",
    createdAt: new Date("2026-10-01T00:00:00Z"),
  };

  it("list + total + bookIds gom 1 query (không fan-out) + cefr/source (SF-2)", async () => {
    dbState.queue = [
      [wordRow], // page rows
      [{ n: 1 }], // count
      [{ wordId: 1, bookId: 2 }], // links page
    ];
    const result = await listVocabulary({ limit: 50, offset: 0 });
    expect(result.items[0]).toEqual({
      id: 1,
      word: "apple",
      ipa: null,
      meaning_vi: "quả táo",
      example: null,
      audio_url: null,
      cefr: "A1",
      source: "oxford-ld",
      createdAt: wordRow.createdAt,
      bookIds: [2],
    });
    expect(result.total).toBe(1);
  });

  it("page rỗng → bỏ qua query links (ids rỗng)", async () => {
    dbState.queue = [[], [{ n: 0 }]];
    const result = await listVocabulary({ limit: 50, offset: 100 });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(dbState.queue).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// VU-43 SF-1 — listVocabulary v2 (additive filters) + field mới
// ---------------------------------------------------------------------------

/** Row DB mock 1 word có mọi field mới — dùng chung các test filter. */
function wordDbRow(id: number, word: string) {
  return {
    id,
    word,
    ipa: null,
    meaningVi: "nghĩa qa",
    example: null,
    audioUrl: null,
    cefr: null,
    source: null,
    pos: null,
    imageUrl: null,
    synonyms: null,
    createdAt: new Date("2026-10-10T00:00:00Z"),
  };
}

describe("listVocabulary v2 (VU-43 SF-1)", () => {
  it("items map field mới pos/image_url/synonyms (nullable) — consumer cũ bỏ qua an toàn", async () => {
    const row = { ...wordDbRow(1, "qa-cms-a"), pos: "noun", imageUrl: "https://x/i.png", synonyms: "x, y" };
    dbState.queue = [[row], [{ n: 1 }], [{ wordId: 1, bookId: 2 }]];
    const result = await listVocabulary({ limit: 50, offset: 0 });
    expect(result.items[0]).toMatchObject({
      pos: "noun",
      image_url: "https://x/i.png",
      synonyms: "x, y",
    });
  });

  it("q escape LIKE wildcard: % _ \\ được escape trước khi ghép %..% (spec §4 bugfix)", async () => {
    dbState.queue = [[], [{ n: 0 }]];
    await listVocabulary({ q: "100%_off\\", limit: 50, offset: 0 });
    const likeValues = dbState.drizzleCalls
      .filter(([fn]) => fn === "ilike")
      .map(([, , pattern]) => pattern);
    // q = `100%_off\` → `100\%\_off\\` — literal, không còn wildcard tự do;
    // or() dựng lại cho rows + count → 4 ilike (word + meaning_vi × 2 query)
    expect(likeValues).toEqual([
      "%100\\%\\_off\\\\%",
      "%100\\%\\_off\\\\%",
      "%100\\%\\_off\\\\%",
      "%100\\%\\_off\\\\%",
    ]);
  });

  it("source/audio filter → isNull/isNotNull đúng cột (teacher = source IS NULL)", async () => {
    dbState.queue = [[], [{ n: 0 }]];
    await listVocabulary({ source: "teacher", audio: "has", limit: 50, offset: 0 });
    const fns = dbState.drizzleCalls.map(([fn, ...rest]) => `${fn}(${rest.join(",")})`);
    expect(fns).toContain("isNull(PgText:source)");
    expect(fns).toContain("isNotNull(PgText:audio_url)");
    // 2 query (rows + count) → mỗi filter 2 lần
    expect(dbState.drizzleCalls.filter(([fn]) => fn === "isNull")).toHaveLength(2);
  });

  it("source='oxford-ld' → eq equality", async () => {
    dbState.queue = [[], [{ n: 0 }]];
    await listVocabulary({ source: "oxford-ld", limit: 50, offset: 0 });
    expect(dbState.drizzleCalls.filter(([fn]) => fn === "eq")).toHaveLength(2);
  });

  it("cefr csv → inArray IN-list uppercase (upper(trim) 2 phía — 'b1 ' vẫn match)", async () => {
    dbState.queue = [[], [{ n: 0 }]];
    await listVocabulary({ cefr: ["B1", "A2"], limit: 50, offset: 0 });
    const inArrays = dbState.drizzleCalls.filter(([fn]) => fn === "inArray");
    expect(inArrays).toHaveLength(2); // rows + count
    expect(inArrays[0]?.[1]).toContain("upper");
    expect(inArrays[0]?.[2]).toEqual(["B1", "A2"]);
  });

  it("orphan=1 WIN khi conflict bookId — bookId bị ignore, điều kiện IS NULL book_id", async () => {
    dbState.queue = [[wordDbRow(1, "qa-cms-orphan")], [{ n: 1 }], []];
    const result = await listVocabulary({ bookId: 5, orphan: true, limit: 50, offset: 0 });
    const eqBookId = dbState.drizzleCalls.filter(
      ([fn, ...rest]) => fn === "eq" && rest.includes(5),
    );
    expect(eqBookId).toHaveLength(0); // bookId không vào WHERE
    const isNulls = dbState.drizzleCalls.filter(
      ([fn, col]) => fn === "isNull" && String(col).includes("book_id"),
    );
    expect(isNulls).toHaveLength(2); // rows + count
    expect(result.items).toHaveLength(1);
  });

  it("bookId (không orphan) → giữ INNER JOIN cũ: eq(bookWords.bookId, id) cho rows+count", async () => {
    dbState.queue = [[wordDbRow(1, "qa-cms-b")], [{ n: 1 }], [{ wordId: 1, bookId: 5 }]];
    const result = await listVocabulary({ bookId: 5, limit: 50, offset: 0 });
    const eqBookId = dbState.drizzleCalls.filter(
      ([fn, ...rest]) => fn === "eq" && rest.includes(5),
    );
    expect(eqBookId.length).toBeGreaterThanOrEqual(2); // rows where + count where
    expect(result.total).toBe(1);
  });

  it("sort: created mặc định (desc createdAt + asc word) | word asc | cefr asc (null CUỐI mặc định PG)", async () => {
    dbState.queue = [[], [{ n: 0 }]];
    await listVocabulary({ limit: 50, offset: 0 });
    const orderOf = () =>
      dbState.drizzleCalls.filter(([fn]) => fn === "desc" || fn === "asc");
    expect(orderOf()).toEqual([["desc", "PgTimestamp:created_at"], ["asc", "PgText:word"]]);

    dbState.drizzleCalls = [];
    dbState.queue = [[], [{ n: 0 }]];
    await listVocabulary({ sort: "word", limit: 50, offset: 0 });
    expect(orderOf()).toEqual([["asc", "PgText:word"]]);

    dbState.drizzleCalls = [];
    dbState.queue = [[], [{ n: 0 }]];
    await listVocabulary({ sort: "cefr", limit: 50, offset: 0 });
    expect(orderOf()).toEqual([["asc", "PgText:cefr"], ["asc", "PgText:word"]]);
  });

  it("limit/offset ghi nhận qua mock (server-side pagination)", async () => {
    dbState.queue = [[], [{ n: 0 }]];
    await listVocabulary({ limit: 50, offset: 100 });
    const limitCall = dbState.calls.find(([m]) => m === "limit");
    const offsetCall = dbState.calls.find(([m]) => m === "offset");
    expect(limitCall?.[1]).toBe(50);
    expect(offsetCall?.[1]).toBe(100);
  });
});
