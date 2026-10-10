import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * audio-backfill (VU-43 SF-1 task 9) — plan matched/pending/missing (match
 * winner qua matchWord VU-32 — KHÔNG đổi behavior); apply copy blob URL cap
 * 200, allowDownload cap 100 deps injectable, marker audio_url IS NULL tự
 * nhiên (chạy lại → 0 matched); revalidate ĐÚNG 1 LẦN cuối apply (pin).
 */
const dbState = vi.hoisted(() => ({ queue: [] as unknown[] }));

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
    execute: vi.fn().mockResolvedValue([]),
  },
}));
const revalidateContent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/revalidate", () => ({ CONTENT_TAG: "content", revalidateContent }));
const putAudio = vi.hoisted(() => vi.fn());

import {
  BACKFILL_APPLY_CAP,
  BACKFILL_DOWNLOAD_CAP,
  applyAudioBackfill,
  planAudioBackfill,
} from "./audio-backfill";

const deps = {
  download: vi.fn(),
  put: putAudio,
};

beforeEach(() => {
  dbState.queue = [];
  deps.download.mockReset().mockResolvedValue(Buffer.from("mp3"));
  deps.put.mockReset().mockResolvedValue({ url: "https://blob.example.com/x.mp3" });
});
afterEach(() => {
  revalidateContent.mockClear();
});

/** Candidate crawl_entries như DB trả (id tăng dần). */
const candidate = (over: Record<string, unknown> = {}) => ({
  id: 1,
  slug: "apple",
  word: "apple",
  cefr: "A1",
  audioUkBlob: "https://blob/uk.mp3",
  audioUsBlob: null,
  audioUkUrl: "https://uk-orig.mp3",
  audioUsUrl: null,
  ...over,
});

describe("planAudioBackfill", () => {
  it("matched = entry có blob (uk ưu tiên us); pending = entry không blob (đếm); missing = không entry", async () => {
    dbState.queue = [
      [
        { id: 1, word: "apple" }, // entry blob uk
        { id: 2, word: "bank" }, // entry slug bank_1 không blob → pending
        { id: 3, word: "zzz" }, // không entry → missing
      ],
      [
        candidate({ id: 10, slug: "apple", word: "apple", audioUkBlob: "https://blob/uk.mp3", audioUsBlob: "https://blob/us.mp3" }),
        candidate({ id: 20, slug: "bank_1", word: "bank", audioUkBlob: null, audioUsBlob: null, audioUkUrl: "https://bank.mp3" }),
      ],
    ];
    const plan = await planAudioBackfill({ wordIds: [1, 2, 3] });
    expect(plan.matched).toEqual([{ wordId: 1, blobUrl: "https://blob/uk.mp3" }]);
    expect(plan.pending).toBe(1);
    expect(plan.missing).toEqual([3]);
  });

  it("scope rỗng (words đã đủ audio) → plan 0/0/[] — marker tự nhiên, chạy lại matched=0", async () => {
    dbState.queue = [[]];
    const plan = await planAudioBackfill({ wordIds: [1] });
    expect(plan).toEqual({ matched: [], pending: 0, missing: [] });
  });
});

describe("applyAudioBackfill", () => {
  it("copy blob URL (1 UPDATE … VALUES); revalidate ĐÚNG 1 LẦN cuối (pin)", async () => {
    dbState.queue = [
      [{ id: 1, word: "apple" }], // scan thiếu audio
      [candidate()], // candidates
    ];
    const report = await applyAudioBackfill({ wordIds: [1] }, { deps });
    expect(report.applied).toBe(1);
    expect(report.downloaded).toBe(0);
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });

  it("allowDownload: pending → download+put deps injectable, cap 100; lỗi 1 word không chặn", async () => {
    dbState.queue = [
      [{ id: 2, word: "bank" }], // scan (không matched)
      [candidate({ id: 20, slug: "bank_1", word: "bank", audioUkBlob: null, audioUsBlob: null, audioUkUrl: "https://bank.mp3" })],
      // apply re-scan sau update (0 matched → update không chạy) → scan lại vẫn thấy
      [{ id: 2, word: "bank" }],
      [candidate({ id: 20, slug: "bank_1", word: "bank", audioUkBlob: null, audioUsBlob: null, audioUkUrl: "https://bank.mp3" })],
      [], // update audio_url sau put
    ];
    const report = await applyAudioBackfill(
      { wordIds: [2] },
      { deps, allowDownload: true },
    );
    expect(report.applied).toBe(0);
    expect(report.downloaded).toBe(1);
    expect(deps.put).toHaveBeenCalledWith("audio/vocabulary/2.mp3", expect.any(Buffer), "audio/mpeg");
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });

  it("download fail → errors ghi nhận (wordId), vẫn revalidate 1 lần", async () => {
    deps.download.mockRejectedValue(new Error("404"));
    dbState.queue = [
      [{ id: 5, word: "bank" }],
      [candidate({ id: 20, slug: "bank_1", word: "bank", audioUkBlob: null, audioUsBlob: null, audioUkUrl: "https://bank.mp3" })],
      [{ id: 5, word: "bank" }],
      [candidate({ id: 20, slug: "bank_1", word: "bank", audioUkBlob: null, audioUsBlob: null, audioUkUrl: "https://bank.mp3" })],
    ];
    const report = await applyAudioBackfill({ wordIds: [5] }, { deps, allowDownload: true });
    expect(report.downloaded).toBe(0);
    expect(report.errors).toEqual([{ wordId: 5, error: "404" }]);
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });

  it("caps pin: APPLY 200 / DOWNLOAD 100 (client chunk > cap)", () => {
    expect(BACKFILL_APPLY_CAP).toBe(200);
    expect(BACKFILL_DOWNLOAD_CAP).toBe(100);
  });
});
