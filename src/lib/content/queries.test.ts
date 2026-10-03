import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * getBookVocabulary (SF-2 t-2.3) — mock @/db chainable (pattern
 * vocabulary-store.test.ts) + unstable_cache pass-through. Contract: join
 * book_words→words shape phẳng giữ thứ tự, book rỗng → [], DB lỗi (bảng chưa
 * migrate / mạng) → fallback [] KHÔNG throw (build-safe cachedQuery).
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
}));

function chainOf(): unknown {
  const result = dbState.queue.shift();
  const p =
    dbState.failWith !== null ? Promise.reject(dbState.failWith) : Promise.resolve(result);
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
  db: { select: () => chainOf() },
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: <T>() => Promise<T>) => fn,
  revalidateTag: vi.fn(),
}));

import { getBookVocabulary } from "./queries";

const row = (id: number, word: string, audioUrl: string | null) => ({
  id,
  word,
  ipa: "ˈæp.əl",
  meaningVi: "quả táo",
  example: null,
  audioUrl,
});

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  vi.restoreAllMocks();
});

describe("getBookVocabulary", () => {
  it("trả rows phẳng theo thứ tự query (book_words.order — sort nằm ở SQL)", async () => {
    dbState.queue = [[row(2, "banana", null), row(1, "apple", "https://cdn/a.mp3")]];
    const result = await getBookVocabulary("level-3");
    expect(result).toEqual([
      { id: 2, word: "banana", ipa: "ˈæp.əl", meaningVi: "quả táo", example: null, audioUrl: null },
      { id: 1, word: "apple", ipa: "ˈæp.əl", meaningVi: "quả táo", example: null, audioUrl: "https://cdn/a.mp3" },
    ]);
  });

  it("slug lạ / book chưa có từ → []", async () => {
    dbState.queue = [[]];
    expect(await getBookVocabulary("khong-ton-tai")).toEqual([]);
  });

  it("DB lỗi (bảng chưa migrate) → fallback [] không throw — build-safe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error('relation "book_words" does not exist');
    expect(await getBookVocabulary("level-3")).toEqual([]);
  });
});
