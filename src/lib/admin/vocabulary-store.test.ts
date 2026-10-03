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
}));

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
    createdAt: new Date("2026-10-01T00:00:00Z"),
  };

  it("list + total + bookIds gom 1 query (không fan-out)", async () => {
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
