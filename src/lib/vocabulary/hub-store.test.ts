import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Hub aggregate contract (SF-1 t-1.3) — mock @/db chainable (pattern
 * review-store.test.ts): KPI trả giá trị queue theo đúng shape; danh sách từ
 * gom book theo wordId (thứ tự sortOrder của query 2 giữ nguyên); hàng rỗng
 * → KHÔNG chạy query book; DB lỗi → fallback 0/[] (build-safe như
 * listDueWords). Pure helpers parseHubFilters/displayStatus test trực tiếp.
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
  calls: [] as unknown[],
}));

function chainOf(initial?: unknown): unknown {
  const result = dbState.queue.shift();
  const p =
    dbState.failWith !== null
      ? Promise.reject(dbState.failWith)
      : Promise.resolve(result);
  const proxy: unknown = new Proxy(function chain() {}, {
    get(_t, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then") return p.then.bind(p);
      if (prop === "catch") return p.catch.bind(p);
      return (arg: unknown) => {
        dbState.calls.push(arg);
        return proxy;
      };
    },
    apply() {
      return proxy;
    },
  });
  if (initial !== undefined) dbState.calls.push(initial);
  return proxy;
}

vi.mock("@/db", () => ({
  db: {
    select: (arg: unknown) => chainOf(arg),
    selectDistinct: (arg: unknown) => chainOf(arg),
  },
}));

import {
  displayStatus,
  parseHubFilters,
} from "./hub-status";
import {
  getHubStats,
  listHubBooks,
  listHubWords,
} from "./hub-store";

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.calls = [];
  vi.restoreAllMocks();
});

describe("getHubStats", () => {
  it("trả KPI (total/dueToday/mastered) theo giá trị aggregate", async () => {
    dbState.queue = [[{ total: 12, dueToday: 4, mastered: 3 }]];
    expect(await getHubStats("u1")).toEqual({
      total: 12,
      dueToday: 4,
      mastered: 3,
    });
    // select project đúng 3 cột aggregate + lọc theo user
    expect(Object.keys(dbState.calls[0] as object).sort()).toEqual([
      "dueToday",
      "mastered",
      "total",
    ]);
    expect(dbState.calls[2]).toBeDefined(); // where(eq userId)
  });

  it("không có progress (row undefined) → 0/0/0", async () => {
    dbState.queue = [[]];
    expect(await getHubStats("u1")).toEqual({
      total: 0,
      dueToday: 0,
      mastered: 0,
    });
  });

  it("DB lỗi (bảng chưa migrate) → 0/0/0 + log, không throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error('relation "user_word_progress" does not exist');
    expect(await getHubStats("u1")).toEqual({
      total: 0,
      dueToday: 0,
      mastered: 0,
    });
  });
});

describe("listHubWords", () => {
  const rows = [
    { wordId: 1, word: "alpha", meaningVi: "a", reps: 0, dueAt: new Date(0) },
    { wordId: 2, word: "bravo", meaningVi: "b", reps: 3, dueAt: new Date(1) },
  ];

  it("gom book theo wordId, giữ thứ tự sortOrder của query assignments", async () => {
    dbState.queue = [
      rows,
      [
        { wordId: 1, slug: "level-1", titleEn: "Level 1", titleVi: "Cấp độ 1", sortOrder: 1 },
        { wordId: 1, slug: "level-3", titleEn: "Level 3", titleVi: "Cấp độ 3", sortOrder: 3 },
        { wordId: 2, slug: "level-1", titleEn: "Level 1", titleVi: "Cấp độ 1", sortOrder: 1 },
      ],
    ];
    const result = await listHubWords("u1", { bookId: null, status: "all" });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ wordId: 1, word: "alpha" });
    expect(result[0]!.books.map((b) => b.slug)).toEqual(["level-1", "level-3"]);
    expect(result[1]!.books.map((b) => b.slug)).toEqual(["level-1"]);
    // limit trang lists luôn đặt (chống phình khi user học nhiều)
    expect(dbState.calls[5]).toBe(100);
  });

  it("word không còn assignment nào → books [] (hiển thị —)", async () => {
    dbState.queue = [rows, []];
    const result = await listHubWords("u1", { bookId: null, status: "due" });
    expect(result[0]!.books).toEqual([]);
    expect(result[1]!.books).toEqual([]);
  });

  it("hàng rỗng → [] và KHÔNG chạy query book thứ 2", async () => {
    dbState.queue = [[]];
    const result = await listHubWords("u1", {
      bookId: 3,
      status: "mastered",
    });
    expect(result).toEqual([]);
    // limit vẫn đặt ở query chính (chống phình); subquery book chạy trước
    // main query nên index tuyệt đối không ổn định — assert bằng contains
    expect(dbState.calls).toContain(100);
  });

  it("DB lỗi → [] + log, không throw — build-safe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error('relation "book_words" does not exist');
    expect(await listHubWords("u1", { bookId: null, status: "all" })).toEqual(
      [],
    );
  });
});

describe("listHubBooks", () => {
  it("trả book có từ, bỏ cột sortOrder khỏi shape", async () => {
    dbState.queue = [
      [
        { id: 1, slug: "level-1", titleEn: "Level 1", titleVi: "Cấp độ 1", sortOrder: 1 },
        { id: 3, slug: "level-3", titleEn: "Level 3", titleVi: "Cấp độ 3", sortOrder: 3 },
      ],
    ];
    expect(await listHubBooks()).toEqual([
      { id: 1, slug: "level-1", titleEn: "Level 1", titleVi: "Cấp độ 1" },
      { id: 3, slug: "level-3", titleEn: "Level 3", titleVi: "Cấp độ 3" },
    ]);
    // DISTINCT theo book + sort theo sortOrder (selectDistinct select project)
    expect(Object.keys(dbState.calls[0] as object)).toContain("sortOrder");
  });

  it("DB lỗi → []", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error("boom");
    expect(await listHubBooks()).toEqual([]);
  });
});

describe("parseHubFilters", () => {
  it("thiếu param → mặc định (no book, all)", () => {
    expect(parseHubFilters({})).toEqual({ bookId: null, status: "all" });
  });

  it("book số hợp lệ + status whitelist → giữ nguyên", () => {
    expect(parseHubFilters({ book: "3", status: "mastered" })).toEqual({
      bookId: 3,
      status: "mastered",
    });
    expect(parseHubFilters({ book: "0" })).toEqual({ bookId: 0, status: "all" });
  });

  it("giá trị lạ → rơi về mặc định, không throw", () => {
    expect(parseHubFilters({ book: "abc" })).toEqual({
      bookId: null,
      status: "all",
    });
    expect(parseHubFilters({ book: "-1" })).toEqual({
      bookId: null,
      status: "all",
    });
    expect(parseHubFilters({ status: "weird" })).toEqual({
      bookId: null,
      status: "all",
    });
  });
});

describe("displayStatus", () => {
  const now = new Date("2026-03-10T10:00:00Z");

  it("due_at quá khứ (kể cả đúng bằng mốc) → due", () => {
    expect(displayStatus({ reps: 3, dueAt: new Date("2026-03-10T09:59:59Z") }, now)).toBe("due");
    expect(displayStatus({ reps: 0, dueAt: now }, now)).toBe("due");
  });

  it("chưa due: reps ≥ 3 → mastered, reps < 3 → learning", () => {
    expect(displayStatus({ reps: 3, dueAt: new Date("2026-03-11T00:00:00Z") }, now)).toBe("mastered");
    expect(displayStatus({ reps: 2, dueAt: new Date("2026-03-11T00:00:00Z") }, now)).toBe("learning");
    expect(displayStatus({ reps: 0, dueAt: new Date("2026-03-11T00:00:00Z") }, now)).toBe("learning");
  });
});
