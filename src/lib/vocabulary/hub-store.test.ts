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
  escapeLikeTerm,
  libraryHref,
  parseHubFilters,
  parseLibraryFilters,
  resolveHubTab,
} from "./hub-status";
import {
  LIBRARY_PAGE_SIZE,
  getHubStats,
  getStudyWord,
  listDiscoverBooks,
  listHubBooks,
  listHubWords,
  listLibraryWords,
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

describe("listLibraryWords (SF-2 t-2.1)", () => {
  const libRows = [
    {
      wordId: 1,
      word: "alpha",
      meaningVi: "a",
      audioUrl: null,
      reps: 0,
      dueAt: new Date(0),
    },
    {
      wordId: 2,
      word: "bravo",
      meaningVi: "b",
      audioUrl: "audio/bravo.mp3",
      reps: 3,
      dueAt: new Date(1),
    },
  ];

  it("trả rows + total + books enrichment; progress theo left-join", async () => {
    dbState.queue = [
      [{ total: 51 }],
      libRows,
      [
        { wordId: 1, slug: "level-1", titleEn: "Level 1", titleVi: "Cấp độ 1", sortOrder: 1 },
        { wordId: 2, slug: "level-3", titleEn: "Level 3", titleVi: "Cấp độ 3", sortOrder: 3 },
      ],
    ];
    const result = await listLibraryWords("u1", {
      search: "",
      bookId: null,
      hasAudio: false,
      status: "all",
      page: 1,
    });
    expect(result.total).toBe(51);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(2);
    expect(result.rows[0]).toMatchObject({
      wordId: 1,
      word: "alpha",
      audioUrl: null,
      books: [{ slug: "level-1" }],
    });
    expect(result.rows[0]!.progress).toEqual({ reps: 0, dueAt: new Date(0) });
    expect(result.rows[1]!.progress).toEqual({ reps: 3, dueAt: new Date(1) });
    // limit/offset trang 1
    expect(dbState.calls).toContain(LIBRARY_PAGE_SIZE);
    expect(dbState.calls).toContain(0);
  });

  it("guest (userId null) → progress null, duyệt không trạng thái", async () => {
    // left-join miss (join false) → DB trả dueAt/reps null
    const guestRows = libRows.map((r) => ({ ...r, reps: null, dueAt: null }));
    dbState.queue = [[{ total: 2 }], guestRows, []];
    const result = await listLibraryWords(null, {
      search: "",
      bookId: null,
      hasAudio: false,
      status: "all",
      page: 1,
    });
    expect(result.rows[0]!.progress).toBeNull();
    expect(result.rows[1]!.progress).toBeNull();
    expect(result.rows[0]!.books).toEqual([]);
  });

  it("phân trang: page 3 → offset 100; total 0 → totalPages 1", async () => {
    dbState.queue = [[{ total: 0 }], [], []];
    const result = await listLibraryWords("u1", {
      search: "",
      bookId: null,
      hasAudio: false,
      status: "all",
      page: 3,
    });
    expect(dbState.calls).toContain(LIBRARY_PAGE_SIZE);
    expect(dbState.calls).toContain(100); // (3 - 1) * 50
    expect(result).toEqual({ rows: [], total: 0, page: 3, totalPages: 1 });
  });

  it("page vượt cuối: rows [] nhưng vẫn giữ total + totalPages (books query không chạy)", async () => {
    dbState.queue = [[{ total: 51 }], [], []];
    const result = await listLibraryWords("u1", {
      search: "alpha",
      bookId: null,
      hasAudio: false,
      status: "all",
      page: 9,
    });
    expect(result).toEqual({ rows: [], total: 51, page: 9, totalPages: 2 });
    // đúng 2 query (count + main) — assignments bị bỏ khi rỗng (còn 1 không dùng)
    expect(dbState.queue).toHaveLength(1);
  });

  it("DB lỗi → trang rỗng + log, không throw — build-safe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error('relation "words" does not exist');
    const result = await listLibraryWords("u1", {
      search: "x",
      bookId: null,
      hasAudio: true,
      status: "due",
      page: 1,
    });
    expect(result).toEqual({ rows: [], total: 0, page: 1, totalPages: 1 });
  });
});

describe("getStudyWord (SF-2 t-2.2)", () => {
  it("thấy từ → shape DueWord với SRS mặc định (2.5/0/0)", async () => {
    dbState.queue = [
      [
        {
          wordId: 7,
          word: "delta",
          ipa: "ˈdɛltə",
          meaningVi: "d",
          example: "delta rock",
          audioUrl: null,
        },
      ],
    ];
    expect(await getStudyWord(7)).toEqual({
      wordId: 7,
      word: "delta",
      ipa: "ˈdɛltə",
      meaningVi: "d",
      example: "delta rock",
      audioUrl: null,
      ease: 2.5,
      intervalDays: 0,
      reps: 0,
    });
    expect(dbState.calls).toContain(1); // limit 1
  });

  it("id lạ → null; DB lỗi → null + log", async () => {
    dbState.queue = [[]];
    expect(await getStudyWord(999)).toBeNull();
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.queue = [];
    dbState.failWith = new Error("boom");
    expect(await getStudyWord(1)).toBeNull();
  });
});

describe("listDiscoverBooks (vocabulary-learn t-1.3)", () => {
  const DISCOVER_ROWS = [
    { id: 2, slug: "level-2", titleEn: "Level 2", titleVi: "Cấp độ 2", unlearned: 12 },
    { id: 1, slug: "level-1", titleEn: "Level 1", titleVi: "Cấp độ 1", unlearned: 3 },
  ];

  it("user đang đọc (có lesson progress) → chỉ books đó, count từ chưa học", async () => {
    dbState.queue = [[{ bookId: 2 }, { bookId: 1 }], DISCOVER_ROWS];
    const result = await listDiscoverBooks("u1");
    expect(result).toEqual(DISCOVER_ROWS);
    // giới hạn số book Khám phá luôn đặt (chống phình khi fallback mọi book)
    expect(dbState.calls).toContain(7);
  });

  it("chưa có lesson progress (người mới) → fallback MỌI book có từ (query 1 rỗng, query 2 không where book)", async () => {
    dbState.queue = [[], DISCOVER_ROWS];
    const result = await listDiscoverBooks("u1");
    expect(result).toEqual(DISCOVER_ROWS);
    // query 2 chạy KHÔNG điều kiện where (fallback all books) — call thứ 9 là
    // where(undefined)
    expect(dbState.calls[9]).toBeUndefined();
  });

  it("book trả [] (học hết / không có từ) → []", async () => {
    dbState.queue = [[{ bookId: 1 }], []];
    expect(await listDiscoverBooks("u1")).toEqual([]);
  });

  it("DB lỗi (bảng chưa migrate) → [] + log, không throw — build-safe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error('relation "user_lesson_progress" does not exist');
    expect(await listDiscoverBooks("u1")).toEqual([]);
  });
});

describe("parseLibraryFilters", () => {
  it("thiếu param → mặc định (search rỗng, no book, no audio, all, page 1)", () => {
    expect(parseLibraryFilters({})).toEqual({
      search: "",
      bookId: null,
      hasAudio: false,
      status: "all",
      page: 1,
    });
  });

  it("giá trị hợp lệ được giữ: search trim, audio=1, page số", () => {
    expect(
      parseLibraryFilters({
        search: "  alpha  ",
        book: "3",
        audio: "1",
        status: "due",
        page: "4",
      }),
    ).toEqual({
      search: "alpha",
      bookId: 3,
      hasAudio: true,
      status: "due",
      page: 4,
    });
  });

  it("giá trị lạ rơi về mặc định, không throw", () => {
    expect(parseLibraryFilters({ book: "abc", page: "-2", audio: "yes" })).toEqual({
      search: "",
      bookId: null,
      hasAudio: false,
      status: "all",
      page: 1,
    });
    expect(parseLibraryFilters({ search: "  " })).toMatchObject({ search: "" });
    expect(parseLibraryFilters({ page: "0" })).toMatchObject({ page: 1 });
  });
});

describe("resolveHubTab + helpers (SF-2 t-2.2)", () => {
  it("tab tường minh thắng; rác → mặc định theo đăng nhập", () => {
    expect(resolveHubTab("library", false)).toBe("library");
    expect(resolveHubTab("quiz", true)).toBe("quiz");
    expect(resolveHubTab("", true)).toBe("overview");
    expect(resolveHubTab("", false)).toBe("library");
    expect(resolveHubTab("hacker", true)).toBe("overview");
    expect(resolveHubTab("hacker", false)).toBe("library");
  });

  it("escapeLikeTerm khoá wildcard LIKE", () => {
    expect(escapeLikeTerm("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("libraryHref giữ filter, page 1 bỏ param", () => {
    const filter = {
      search: "al",
      bookId: 2,
      hasAudio: true,
      status: "due" as const,
      page: 1,
    };
    expect(libraryHref(filter, 1)).toBe(
      "/vocabulary?tab=library&search=al&book=2&audio=1&status=due",
    );
    expect(libraryHref(filter, 3)).toBe(
      "/vocabulary?tab=library&search=al&book=2&audio=1&status=due&page=3",
    );
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
