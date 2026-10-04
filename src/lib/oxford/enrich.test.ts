import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fill-empty builder + enrich DB leg (VU-32 SF-2). Contract spec §[enrich]:
 * chỉ điền field NULL (giá trị teacher — kể cả chuỗi rỗng — TÔN TRỌNG);
 * ipa uk→us→skip · example senses[0].examples[0] → skip · cefr thô → skip
 * nếu null · audio uk_blob→us_blob→skip('noAudioBlob'). source='oxford-ld'
 * CHỈ khi ≥1 fill. Emptiness apply-time (COALESCE race-safe). DryRun counts
 * không ghi. noMatch → reason 'noMatch'.
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
}));

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
    update: () => chainOf(),
  },
}));
const revalidateContent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/revalidate", () => ({ CONTENT_TAG: "content", revalidateContent }));

import {
  buildFill,
  enrichWordsDb,
  ENRICH_MAX_WORDS,
  slugBase,
  slugPatterns,
  type EnrichEntryData,
} from "./enrich";

const entry = (over: Partial<EnrichEntryData> & { id: number; slug: string }): EnrichEntryData => ({
  word: null,
  cefr: null,
  ipaUk: null,
  ipaUs: null,
  audioUkBlob: null,
  audioUsBlob: null,
  example: null,
  ...over,
});

const emptyWord = {
  word: "tree",
  ipa: null,
  example: null,
  audioUrl: null,
  cefr: null,
};

beforeEach(() => {
  dbState.queue = [];
});
afterEach(() => {
  revalidateContent.mockClear();
});

describe("buildFill (pure)", () => {
  it("word toàn null + entry đầy đủ → fill cả 4, filled đủ", () => {
    const out = buildFill(
      emptyWord,
      entry({
        id: 1,
        slug: "tree",
        ipaUk: "/triː/",
        example: "an oak tree",
        cefr: "A1",
        audioUkBlob: "https://blob.example/audio/oxford/tree.uk.mp3",
      }),
    );
    expect(out.fills).toEqual({
      ipa: "/triː/",
      example: "an oak tree",
      cefr: "A1",
      audioUrl: "https://blob.example/audio/oxford/tree.uk.mp3",
    });
    expect(out.filled).toEqual(["ipa", "example", "cefr", "audio"]);
    expect(out.skipped).toEqual([]);
    expect(out.reason).toBeUndefined();
  });

  it("teacher đã có giá trị (kể cả chuỗi rỗng) → skipped, KHÔNG đụng", () => {
    const out = buildFill(
      { word: "tree", ipa: "/old/", example: "", audioUrl: null, cefr: "B2" },
      entry({
        id: 1,
        slug: "tree",
        ipaUk: "/triː/",
        example: "an oak tree",
        cefr: "A1",
        audioUkBlob: "https://blob.example/t.uk.mp3",
      }),
    );
    expect(out.fills).toEqual({ audioUrl: "https://blob.example/t.uk.mp3" });
    expect(out.filled).toEqual(["audio"]);
    expect(out.skipped).toEqual(["ipa", "example", "cefr"]);
  });

  it("ipa uk null → fallback us; cả hai null → không fill", () => {
    const usOnly = buildFill(
      emptyWord,
      entry({ id: 1, slug: "color", ipaUs: "/ˈkʌlɚ/" }),
    );
    expect(usOnly.fills.ipa).toBe("/ˈkʌlɚ/");
    expect(usOnly.filled).toEqual(["ipa"]);
    const none = buildFill(emptyWord, entry({ id: 2, slug: "xylophone" }));
    expect(none.fills).toEqual({});
    expect(none.filled).toEqual([]);
  });

  it("audio uk_blob → us_blob → thiếu blob → reason noAudioBlob", () => {
    const us = buildFill(
      emptyWord,
      entry({ id: 1, slug: "tree", audioUsBlob: "https://blob.example/t.us.mp3" }),
    );
    expect(us.fills.audioUrl).toBe("https://blob.example/t.us.mp3");
    const noBlob = buildFill(emptyWord, entry({ id: 2, slug: "ghost" }));
    expect(noBlob.fills).toEqual({});
    expect(noBlob.reason).toBe("noAudioBlob");
  });

  it("audio_url teacher đã có → không đụng, không reason noAudioBlob", () => {
    const out = buildFill(
      { ...emptyWord, audioUrl: "https://blob.example/teacher.mp3" },
      entry({ id: 1, slug: "tree" }),
    );
    expect(out.filled).toEqual([]);
    expect(out.skipped).toContain("audio");
    expect(out.reason).toBeUndefined();
  });

  it("entry null (noMatch) → không fill, skipped = field đã có", () => {
    const out = buildFill({ ...emptyWord, ipa: "/x/" }, null);
    expect(out.fills).toEqual({});
    expect(out.skipped).toEqual(["ipa"]);
  });
});

describe("slugBase + slugPatterns", () => {
  it("slugBase: strip _N + spaces→dash", () => {
    expect(slugBase("Bank_1")).toBe("bank");
    expect(slugBase("ice cream")).toBe("ice-cream");
    expect(slugBase("three-D")).toBe("three-d");
  });

  it("slugPatterns: escape regex specials + anchor _N suffix", () => {
    expect(slugPatterns("a.b")).toEqual(["^a\\.b_[0-9]+$"]);
    expect(slugPatterns("bank")).toEqual(["^bank_[0-9]+$"]);
  });
});

describe("enrichWordsDb (DB leg — mock @/db)", () => {
  it("dryRun → counts theo emptiness hiện tại, KHÔNG update, KHÔNG revalidate", async () => {
    dbState.queue = [
      // resolve words: 2 word — tree (thiếu ipa/audio) + house (đầy đủ)
      [
        { id: 1, word: "tree", ipa: null, example: null, audioUrl: null, cefr: null },
        { id: 2, word: "house", ipa: "/haʊs/", example: "big house", audioUrl: "https://x/h.mp3", cefr: "A1" },
      ],
      // candidates: entry tree
      [
        entry({
          id: 10,
          slug: "tree",
          word: "tree",
          ipaUk: "/triː/",
          cefr: "A1",
          example: "an oak tree",
        }), // không blob
      ],
    ];
    const counts = await enrichWordsDb({ bookId: 1, dryRun: true });
    expect(counts).toEqual({
      candidates: 1, // house không có entry thắng
      fillableIpa: 1,
      fillableExample: 1,
      fillableCefr: 1,
      fillableAudio: 0, // entry không blob
    });
    expect(revalidateContent).not.toHaveBeenCalled();
  });

  it("apply → update COALESCE chỉ field fill + source, report per-word, revalidate", async () => {
    dbState.queue = [
      [
        { id: 1, word: "tree", ipa: null, example: null, audioUrl: null, cefr: null },
        { id: 2, word: "house", ipa: "/haʊs/", example: "big house", audioUrl: "https://x/h.mp3", cefr: "A1" },
      ],
      [
        entry({
          id: 10,
          slug: "tree",
          word: "tree",
          ipaUk: "/triː/",
          cefr: "A1",
          example: "an oak tree",
        }),
      ],
      [], // update tree
      [], // update house (không fill nào — house có winner? không → không update; nhưng queue dư vẫn vô hại)
    ];
    const report = await enrichWordsDb({ wordIds: [1, 2], dryRun: false });
    expect(report).toEqual([
      { word: "tree", filled: ["ipa", "example", "cefr"], skipped: [], reason: "noAudioBlob" },
      { word: "house", filled: [], skipped: ["ipa", "example", "cefr", "audio"], reason: "noMatch" },
    ]);
    expect(revalidateContent).toHaveBeenCalledTimes(1);
  });

  it("wordIds > cap → throw EnrichCapError", async () => {
    const tooMany = Array.from({ length: ENRICH_MAX_WORDS + 1 }, (_, i) => i + 1);
    await expect(enrichWordsDb({ wordIds: tooMany, dryRun: true })).rejects.toThrow(
      /cap/i,
    );
  });
});
