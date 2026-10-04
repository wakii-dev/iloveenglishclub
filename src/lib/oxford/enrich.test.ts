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
    insert: () => chainOf(),
  },
}));
const revalidateContent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/revalidate", () => ({ CONTENT_TAG: "content", revalidateContent }));

const sitemapMock = vi.hoisted(() => ({ fetchSlugs: vi.fn() }));
vi.mock("./sitemap", () => ({ fetchSlugs: sitemapMock.fetchSlugs }));

const fetchMock = vi.hoisted(() => ({ fetchEntry: vi.fn() }));
vi.mock("./fetch", () => ({ fetchEntry: fetchMock.fetchEntry }));
const parseMock = vi.hoisted(() => ({ parseEntry: vi.fn() }));
vi.mock("./parse", () => ({ parseEntry: parseMock.parseEntry }));

import {
  buildFill,
  crawlStatsDb,
  enrichWordsDb,
  ENRICH_MAX_WORDS,
  previewWordDb,
  refreshSitemapDb,
  retryFailedDb,
  slugBase,
  slugPatterns,
  type EnrichEntryData,
} from "./enrich";

const entry = (over: Partial<EnrichEntryData> & { id: number; slug: string }): EnrichEntryData => ({
  word: null,
  cefr: null,
  pos: null,
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

describe("crawlStatsDb (stats DERIVED — không bảng mới)", () => {
  it("counts groupBy status + failedMaxAttempts (attempts≥cap) + samples ≤20 + lastRun max(fetched_at)", async () => {
    dbState.queue = [
      [
        { status: "parsed", n: 83, maxed: 0 },
        { status: "failed", n: 30, maxed: 12 },
        { status: "pending", n: 63854, maxed: 0 },
      ],
      [{ slug: "ghost", lastError: "http:404" }, { slug: "x", lastError: null }],
      [{ max: new Date("2026-10-04T10:00:00Z") }],
    ];
    const stats = await crawlStatsDb();
    expect(stats.counts).toEqual({
      pending: 63854,
      parsed: 83,
      failed: 30,
      failedMaxAttempts: 12,
    });
    expect(stats.samples).toEqual([
      { slug: "ghost", lastError: "http:404" },
      { slug: "x", lastError: null },
    ]);
    expect(stats.lastRun).toBe("2026-10-04T10:00:00.000Z");
  });

  it("DB rỗng → counts 0 + samples [] + lastRun null", async () => {
    dbState.queue = [[], [], [{ max: null }]];
    expect(await crawlStatsDb()).toEqual({
      counts: { pending: 0, parsed: 0, failed: 0, failedMaxAttempts: 0 },
      samples: [],
      lastRun: null,
    });
  });
});

describe("retryFailedDb", () => {
  it("trả số row reset (failed→pending, attempts < cap)", async () => {
    dbState.queue = [[{ id: 1 }, { id: 2 }, { id: 3 }]];
    expect(await retryFailedDb()).toEqual({ reset: 3 });
  });
});

describe("refreshSitemapDb (diff upsert — chỉ slug mới)", () => {
  it("delta ≤ 2000 → upsert slug mới, trả inserted", async () => {
    sitemapMock.fetchSlugs.mockResolvedValue(["tree", "house", "wander"]);
    dbState.queue = [
      [{ slug: "tree" }, { slug: "wander" }], // existing — house là slug mới
      [{ id: 11 }], // insert chunk 1 (house)
    ];
    expect(await refreshSitemapDb()).toEqual({ inserted: 1 });
    expect(sitemapMock.fetchSlugs).toHaveBeenCalledTimes(1);
  });

  it("delta > 2000 → deltaTooLarge + hint, KHÔNG upsert (không query insert)", async () => {
    sitemapMock.fetchSlugs.mockResolvedValue(
      Array.from({ length: 2001 }, (_, i) => `new-slug-${i}`),
    );
    dbState.queue = [[]]; // chỉ query existing slugs
    const result = await refreshSitemapDb();
    expect(result).toMatchObject({ deltaTooLarge: true, delta: 2001 });
    expect("hint" in result && result.hint.length > 0).toBe(true);
    expect(dbState.queue).toHaveLength(0); // không tiêu thụ query insert
  });

  it("fetchSlugs lỗi (network/robots) → ném ra (route map 502)", async () => {
    sitemapMock.fetchSlugs.mockRejectedValue(new Error("HTTP 500"));
    await expect(refreshSitemapDb()).rejects.toThrow("HTTP 500");
  });
});

describe("previewWordDb (crawl-on-add — cache-first, KHÔNG ghi DB)", () => {
  it("cache trúng (parsed) → from:'cache', KHÔNG gọi Oxford", async () => {
    dbState.queue = [
      [
        entry({
          id: 10,
          slug: "tree",
          word: "tree",
          ipaUk: "/triː/",
          cefr: "A1",
          example: "an oak tree",
          audioUkBlob: "https://blob.example/tree.uk.mp3",
        }),
      ],
    ];
    const result = await previewWordDb("Tree");
    expect(result).toEqual({
      found: true,
      from: "cache",
      entry: {
        slug: "tree",
        word: "tree",
        ipaUk: "/triː/",
        ipaUs: null,
        cefr: "A1",
        pos: null,
        audioUkBlob: "https://blob.example/tree.uk.mp3",
        audioUsBlob: null,
      },
    });
    expect(fetchMock.fetchEntry).not.toHaveBeenCalled();
  });

  it("cache miss → live fetch slugBase + parse → from:'live' (blob null — chưa tải)", async () => {
    dbState.queue = [[]]; // không candidate
    fetchMock.fetchEntry.mockResolvedValue({ html: "<html/>", finalSlug: "three-d" });
    parseMock.parseEntry.mockReturnValue({
      headword: "three-D",
      pos: "noun",
      ipaUk: null,
      ipaUs: "/θriː/",
      audioUkUrl: null,
      audioUsUrl: "https://x/us.mp3",
      cefr: null,
      ox3000: false,
      senses: [],
      idioms: [],
      phrasalVerbs: [],
    });
    const result = await previewWordDb("three d");
    expect(fetchMock.fetchEntry).toHaveBeenCalledWith("three-d");
    expect(result.found).toBe(true);
    expect(result.from).toBe("live");
    expect(result.entry).toEqual({
      slug: "three-d",
      word: "three-D",
      ipaUk: null,
      ipaUs: "/θriː/",
      cefr: null,
      pos: "noun",
      audioUkBlob: null,
      audioUsBlob: null,
    });
  });

  it("live 404 (fetchEntry null) → {found:false, from:'live', entry:null}", async () => {
    dbState.queue = [[]];
    fetchMock.fetchEntry.mockResolvedValue(null);
    const result = await previewWordDb("zzznotaword");
    expect(result).toEqual({ found: false, from: "live", entry: null });
  });

  it("live parse không headword → found:false", async () => {
    dbState.queue = [[]];
    fetchMock.fetchEntry.mockResolvedValue({ html: "<html/>", finalSlug: "x" });
    parseMock.parseEntry.mockReturnValue(null);
    expect(await previewWordDb("broken")).toEqual({ found: false, from: "live", entry: null });
  });

  it("live fetch lỗi mạng → ném ra (route map 502)", async () => {
    dbState.queue = [[]];
    fetchMock.fetchEntry.mockRejectedValue(new Error("timeout"));
    await expect(previewWordDb("tree")).rejects.toThrow("timeout");
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
