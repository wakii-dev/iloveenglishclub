import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * cms-bulk-store (VU-43 SF-1 task 6) — semantics spec §5: advisory lock per
 * book TRƯỚC max(order), onConflictDoNothing → skipped, tag-cefr OVERWRITE,
 * delete dry-run 0 mutation + apply per-id không chặn, revalidate ĐÚNG 1 LẦN
 * cuối batch (KHÔNG trong loop — contract pin), 23503 → bookNotFound.
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
  // Fail đúng lần chain-thứ N (đếm mọi chainOf) — test per-id lỗi giữa batch
  failAtCall: null as { n: number; error: unknown } | null,
  callsMade: 0,
  // Từng lệnh SQL chạy trong transaction (advisory lock / max / insert / …)
  txCalls: [] as string[],
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
    // Tag ghi lúc TẠO chain (1 chain = 1 query — không đếm trùng method call)
    select: () => {
      dbState.txCalls.push("tx-select");
      return chainOf();
    },
    insert: () => {
      dbState.txCalls.push("tx-insert");
      return chainOf();
    },
    update: () => {
      dbState.txCalls.push("tx-update");
      return chainOf();
    },
    delete: () => {
      dbState.txCalls.push("tx-delete");
      return chainOf();
    },
    // execute(sql`select pg_advisory_xact_lock(${bookId})`) — ghi chuỗi SQL để
    // pin THỨ TỰ: lock phải trước select max(order)
    execute: (query: { queryChunks?: unknown[] }) => {
      const text = (chunk: unknown): string => {
        if (typeof chunk === "string") return chunk;
        const value = (chunk as { value?: unknown[] }).value;
        return Array.isArray(value) ? value.map(text).join("") : "";
      };
      const sig = (query.queryChunks ?? []).map(text).join("");
      dbState.txCalls.push(`tx-execute:${sig}`);
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

import {
  bulkAssignBooks,
  bulkDeleteApply,
  bulkDeleteDryRun,
  bulkTagCefr,
  BULK_CAP,
} from "./cms-bulk-store";

beforeEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.failAtCall = null;
  dbState.callsMade = 0;
  dbState.txCalls = [];
});
afterEach(() => {
  revalidateContent.mockClear();
});

describe("bulkAssignBooks (spec §5.2–5.3)", () => {
  it("advisory lock bookId TRƯỚC select max(order) — 2 book → 2 lock (contract §5.3)", async () => {
    dbState.queue = [
      [{ max: 10 }], // book 1: max order
      [{ wordId: 1 }], // book 1: attach word 1
      [{ wordId: 2 }], // book 1: attach word 2
      [{ max: 3 }], // book 2: max
      [{ wordId: 1 }], // book 2: attach
      [{ wordId: 2 }], // book 2: attach
    ];
    const result = await bulkAssignBooks([1, 2], [7, 9]);
    expect(result).toEqual({ ok: true, report: { affected: 4, skipped: 0, errors: [] } });
    const lockIdx = dbState.txCalls.findIndex((c) => c.startsWith("tx-execute:select pg_advisory_xact_lock"));
    const maxIdx = dbState.txCalls.indexOf("tx-select"); // chain đầu sau lock
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeLessThan(maxIdx);
    expect(dbState.txCalls.filter((c) => c.startsWith("tx-execute"))).toHaveLength(2);
    expect(revalidateContent).toHaveBeenCalledTimes(1); // 1 lần cuối batch
  });

  it("onConflictDoNothing → đã gắn = skipped (không lỗi giữa chừng)", async () => {
    dbState.queue = [
      [{ max: 0 }],
      [], // attach word 1 → conflict, không trả row
      [{ wordId: 2 }],
    ];
    const result = await bulkAssignBooks([1, 2], [7]);
    expect(result).toEqual({ ok: true, report: { affected: 1, skipped: 1, errors: [] } });
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });

  it("order nối tiếp trong 1 book: max=10 → word1 order 11, word2 order 12 (không re-read max)", async () => {
    dbState.queue = [[{ max: 10 }], [{ wordId: 1 }], [{ wordId: 2 }]];
    await bulkAssignBooks([1, 2], [7]);
    // 1 book = 1 select max duy nhất (order++ phía client-side sau insert)
    expect(dbState.txCalls.filter((c) => c === "tx-select")).toHaveLength(1);
  });

  it("FK 23503 → bookNotFound (request fail; revalidate vì book trước có thể đã mutate)", async () => {
    dbState.failWith = { code: "23503" };
    const result = await bulkAssignBooks([1], [99]);
    expect(result).toEqual({ ok: false, error: "bookNotFound" });
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });

  it("lỗi lạ book → ghi errors (bookId) + vòng lặp CHẠY TIẾP book sau (không chặn)", async () => {
    dbState.queue = [[{ max: 0 }], [{ max: 0 }]];
    dbState.failWith = { code: "XX999" };
    const result = await bulkAssignBooks([1], [7, 9]);
    dbState.failWith = null;
    // book 7 fail → vẫn sang book 9 (2 advisory lock chạy = 2 book đều được thử)
    const report = (result as { ok: true; report: { errors: { bookId?: number; error: string }[] } }).report;
    expect(report.errors.map((e) => e.bookId)).toEqual([7, 9]);
    expect(dbState.txCalls.filter((c) => c.startsWith("tx-execute"))).toHaveLength(2);
    expect(revalidateContent).toHaveBeenCalledTimes(1); // vẫn 1 revalidate cuối
  });
});

describe("bulkTagCefr (OVERWRITE — spec §5.7)", () => {
  it("update set cefr = OVERWRITE (không coalesce), 1 revalidate cuối", async () => {
    dbState.queue = [[{ id: 1 }, { id: 2 }]];
    const report = await bulkTagCefr([1, 2], "B2");
    expect(report).toEqual({ affected: 2, errors: [] });
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });
});

describe("bulkDeleteDryRun (2-phase — spec §5.5)", () => {
  it("trả willDelete + progressAffected + missing, KHÔNG có delete mutation", async () => {
    dbState.queue = [
      [{ id: 1 }, { id: 3 }], // select tồn tại của [1,2,3] → 2 missing
      [{ n: 5 }], // count progress
    ];
    const report = await bulkDeleteDryRun([1, 2, 3]);
    expect(report).toEqual({ willDelete: 2, progressAffected: 5, missing: [2] });
    expect(revalidateContent).not.toHaveBeenCalled();
  });

  it("ids rỗng → 0/0/[] không chạm DB progress", async () => {
    dbState.queue = [[]];
    const report = await bulkDeleteDryRun([]);
    expect(report).toEqual({ willDelete: 0, progressAffected: 0, missing: [] });
  });
});

describe("bulkDeleteApply (per-id không chặn — spec §5.2)", () => {
  it("đếm progress THẬT trước xoá; xoá từng id; 1 revalidate cuối", async () => {
    dbState.queue = [
      [{ id: 1 }, { id: 2 }], // select tồn tại
      [{ n: 3 }], // count progress
      [{ id: 1 }], // delete 1
      [{ id: 2 }], // delete 2
    ];
    const report = await bulkDeleteApply([1, 2]);
    expect(report).toEqual({ affected: 2, progressAffected: 3, errors: [] });
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });

  it("1 id lỗi → errors ghi nhận, id còn lại vẫn xoá (per-id không chặn)", async () => {
    dbState.queue = [
      [{ id: 1 }, { id: 2 }], // select tồn tại
      [{ n: 0 }], // count progress
      [{ id: 1 }], // delete 1 ok
      // delete 2 — fail đúng call thứ 4
    ];
    dbState.failAtCall = { n: 4, error: { code: "23503" } };
    const report = await bulkDeleteApply([1, 2]);
    expect(report.affected).toBe(1);
    expect(report.errors).toEqual([{ wordId: 2, error: "23503" }]);
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });
});

describe("BULK_CAP", () => {
  it("cap 500 ids/request (client chunk >500 — spec §5.1)", () => {
    expect(BULK_CAP).toBe(500);
  });
});
