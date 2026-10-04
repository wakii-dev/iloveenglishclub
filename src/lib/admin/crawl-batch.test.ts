import { describe, expect, it } from "vitest";
import {
  ENRICH_CHUNK,
  chunkIds,
  emptyCounts,
  formatCrawlTimestamp,
  runChunked,
  sumDryRunCounts,
} from "./crawl-batch";

/**
 * Pure helpers SF-3 (VU-35) — batch loop enrich panel (context pack §3:
 * book >200 từ → loop batch continue-and-collect — chunk lỗi ghi report,
 * KHÔNG dừng loop) + dashboard timestamp. TDD RED→GREEN.
 */

describe("chunkIds", () => {
  it("RED→GREEN: cap 200 mặc định export đúng (route cap enrich = 200)", () => {
    expect(ENRICH_CHUNK).toBe(200);
  });

  it("chia đúng chunk cuối < cap", () => {
    const ids = Array.from({ length: 450 }, (_, i) => i + 1);
    const chunks = chunkIds(ids, 200);
    expect(chunks.map((c) => c.length)).toEqual([200, 200, 50]);
    expect(chunks.flat()).toEqual(ids);
  });

  it("đúng chia hết → không chunk rỗng", () => {
    const ids = Array.from({ length: 400 }, (_, i) => i + 1);
    expect(chunkIds(ids, 200).map((c) => c.length)).toEqual([200, 200]);
  });

  it("mảng rỗng → []", () => {
    expect(chunkIds([], 200)).toEqual([]);
  });

  it("cap <= 0 → throw (config sai phải chết sớm, không loop vô hạn)", () => {
    expect(() => chunkIds([1], 0)).toThrow(RangeError);
    expect(() => chunkIds([1], -5)).toThrow(RangeError);
  });
});

describe("sumDryRunCounts", () => {
  it("cộng đúng từng field qua chunk", () => {
    expect(
      sumDryRunCounts([
        { candidates: 2, fillableIpa: 1, fillableExample: 0, fillableCefr: 2, fillableAudio: 0 },
        { candidates: 3, fillableIpa: 3, fillableExample: 1, fillableCefr: 0, fillableAudio: 1 },
      ]),
    ).toEqual({ candidates: 5, fillableIpa: 4, fillableExample: 1, fillableCefr: 2, fillableAudio: 1 });
  });

  it("rỗng → emptyCounts (preview book không có từ)", () => {
    expect(sumDryRunCounts([])).toEqual(emptyCounts());
    expect(emptyCounts()).toEqual({
      candidates: 0,
      fillableIpa: 0,
      fillableExample: 0,
      fillableCefr: 0,
      fillableAudio: 0,
    });
  });
});

describe("runChunked — continue-and-collect (context pack §3)", () => {
  it("chunk lỗi KHÔNG dừng loop — còn lại vẫn chạy, lỗi ghifailed", async () => {
    const calls: number[] = [];
    const { results, failed } = await runChunked(
      [1, 2, 3, 4],
      1,
      async (chunk, index) => {
        calls.push(chunk[0]!);
        if (index === 1) throw new Error("boom chunk 2");
        return `ok-${chunk[0]}`;
      },
    );
    expect(calls).toEqual([1, 2, 3, 4]); // cả chunk sau chunk lỗi vẫn chạy
    expect(results).toEqual(["ok-1", "ok-3", "ok-4"]);
    expect(failed).toEqual([{ index: 1, message: "boom chunk 2" }]);
  });

  it("onError trả giá trị → vẫn tính vào results (chunk lỗi ghi report)", async () => {
    const { results, failed } = await runChunked(
      ["a", "b"],
      1,
      async (chunk) => {
        if (chunk[0] === "b") throw new Error("x");
        return { word: chunk[0] };
      },
      (_index, error) => ({ word: `error:${String(error)}` }),
    );
    expect(results).toEqual([{ word: "a" }, { word: `error:${String(new Error("x"))}` }]);
    expect(failed).toEqual([{ index: 1, message: "x" }]);
  });

  it("không onError → lỗi chỉ ghi failed, results thiếu chunk đó", async () => {
    const { results, failed } = await runChunked([1, 2], 1, async (c) => {
      if (c[0] === 1) throw new Error("first-fail");
      return c[0] * 10;
    });
    expect(results).toEqual([20]);
    expect(failed[0]?.index).toBe(0);
  });

  it("chunks chạy TUẦN TỰ (không dồn 201 request lên API)", async () => {
    let running = 0;
    let maxConcurrent = 0;
    await runChunked([1, 2, 3], 1, async (c) => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
      return c[0];
    });
    expect(maxConcurrent).toBe(1);
  });
});

describe("formatCrawlTimestamp", () => {
  it("null → null (chưa crawl lần nào)", () => {
    expect(formatCrawlTimestamp(null)).toBeNull();
  });

  it("ISO → format ICU vi-VN (giờ trước ngày — mặc định locale, UTC xác định cho test)", () => {
    expect(formatCrawlTimestamp("2026-10-04T09:05:00.000Z", "vi-VN", "UTC")).toBe(
      "09:05 04/10/2026",
    );
  });

  it("locale en-US → ngày trước, giờ sau dấu phẩy", () => {
    expect(formatCrawlTimestamp("2026-10-04T09:05:00.000Z", "en-US", "UTC")).toBe(
      "10/04/2026, 09:05",
    );
  });
});
