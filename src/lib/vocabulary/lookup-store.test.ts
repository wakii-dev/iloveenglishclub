import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Lookup DB leg (SF-5 t-5.3) — mock @/db chainable (pattern quiz-store.test).
 * Contract: row → entry camelCase; không row → null; normalize trim+lowercase
 * trước khi query; DB lỗi (bảng chưa migrate) → throw (route tự map 500).
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
}));

function chainOf(): unknown {
  const result = dbState.queue.shift();
  const p =
    dbState.failWith != null
      ? Promise.reject(dbState.failWith)
      : Promise.resolve(result);
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
  },
}));

import {
  lookupWordInBook,
  normalizeLookupWord,
} from "./lookup-store";

const ROW = {
  word: "football",
  ipa: "ˈfʊtbɔːl",
  meaningVi: "bóng đá",
  example: "I play football.",
  audioUrl: "https://cdn.example.com/football.mp3",
};

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  vi.restoreAllMocks();
});

describe("lookupWordInBook", () => {
  it("row trúng → entry đủ 5 trường", async () => {
    dbState.queue = [[ROW]];
    const entry = await lookupWordInBook(3, "football");
    expect(entry).toEqual(ROW);
  });

  it("không row (từ ngoài book / không tồn tại) → null", async () => {
    dbState.queue = [[]];
    expect(await lookupWordInBook(3, "zzz")).toBeNull();
  });

  it("input trim + lowercase trước khi query", async () => {
    dbState.queue = [[ROW]];
    // raw có khoảng trắng/chữ hoa — query vẫn chạy (normalize tại store)
    await expect(lookupWordInBook(3, "  FOOTBALL ")).resolves.toEqual(ROW);
  });

  it("input chỉ khoảng trắng → null, không đụng DB", async () => {
    expect(await lookupWordInBook(3, "   ")).toBeNull();
    expect(dbState.queue).toEqual([]);
  });

  it("DB lỗi (bảng chưa migrate) → throw — route tự map 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error('relation "words" does not exist');
    await expect(lookupWordInBook(3, "football")).rejects.toThrow(
      /words/,
    );
  });
});

describe("normalizeLookupWord", () => {
  it("trim + lowercase", () => {
    expect(normalizeLookupWord("  Hello World ")).toBe("hello world");
  });
});
