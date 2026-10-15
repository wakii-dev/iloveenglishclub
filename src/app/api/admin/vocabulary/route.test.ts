import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route contract /api/admin/vocabulary (VU-43 SF-1) — assertAdmin MỌI method;
 * GET parse params mới (cefr csv normalize, source/audio allowlist, orphan,
 * sort) → store; POST/PATCH nhận field mới + error codes spec §4; body cũ
 * (không field mới) chạy nguyên — back-compat tuyệt đối.
 */
const guardsMock = vi.hoisted(() => ({ assertAdmin: vi.fn() }));
vi.mock("@/lib/content/guards", () => {
  class ForbiddenError extends Error {
    constructor(message = "forbidden") {
      super(message);
      this.name = "ForbiddenError";
    }
  }
  return { ForbiddenError, assertAdmin: guardsMock.assertAdmin };
});
const storeMock = vi.hoisted(() => ({
  listVocabulary: vi.fn(),
  createVocabularyWord: vi.fn(),
  updateVocabularyWord: vi.fn(),
  deleteVocabularyWord: vi.fn(),
}));
vi.mock("@/lib/admin/vocabulary-store", () => storeMock);

const { GET, POST, PATCH } = await import("./route");
const { ForbiddenError } = await import("@/lib/content/guards");

function jsonReq(
  url: string,
  method: "POST" | "PATCH",
  body?: unknown,
): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

function getReq(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`);
}

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  storeMock.listVocabulary.mockReset().mockResolvedValue({ items: [], total: 0 });
  storeMock.createVocabularyWord.mockReset().mockResolvedValue({ ok: true, id: 1, duplicate: false });
  storeMock.updateVocabularyWord.mockReset().mockResolvedValue({ ok: true });
  storeMock.deleteVocabularyWord.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET params mới (VU-43 SF-1)", () => {
  it("thiếu admin → 401/403, không chạm store", async () => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError("not-admin"));
    const res = await GET(getReq("/api/admin/vocabulary"));
    expect(res.status).toBe(403);
    expect(storeMock.listVocabulary).not.toHaveBeenCalled();
  });

  it("cefr csv 'b1,B2,x5' → ['B1','B2'] (normalize + allowlist, token lạ bỏ)", async () => {
    await GET(getReq("/api/admin/vocabulary?cefr=b1,B2,x5"));
    expect(storeMock.listVocabulary).toHaveBeenCalledWith(
      expect.objectContaining({ cefr: ["B1", "B2"] }),
    );
  });

  it("source/audio/sort hợp lệ → passthrough; orphan=1 → true; lạ → undefined", async () => {
    await GET(
      getReq("/api/admin/vocabulary?source=teacher&audio=missing&sort=cefr&orphan=1"),
    );
    expect(storeMock.listVocabulary).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "teacher",
        audio: "missing",
        sort: "cefr",
        orphan: true,
      }),
    );
    await GET(
      getReq("/api/admin/vocabulary?source=chatgpt&audio=loud&sort=fuzzy"),
    );
    const second = storeMock.listVocabulary.mock.calls[1]?.[0];
    expect(second).toMatchObject({ source: undefined, audio: undefined, sort: undefined, orphan: false });
  });

  it("back-compat: không params mới → bookId/q/limit/offset như cũ", async () => {
    await GET(
      getReq("/api/admin/vocabulary?bookId=3&q=apple&limit=10&offset=20"),
    );
    expect(storeMock.listVocabulary).toHaveBeenCalledWith({
      bookId: 3,
      q: "apple",
      limit: 10,
      offset: 20,
      cefr: [],
      source: undefined,
      audio: undefined,
      orphan: false,
      sort: undefined,
    });
  });
});

describe("POST field mới (VU-43 SF-1)", () => {
  it("body cũ (word/meaning/ipa/…) → validate như cũ, create không field mới", async () => {
    const res = await POST(
      jsonReq("/api/admin/vocabulary", "POST", {
        word: "apple",
        meaning_vi: "quả táo",
        bookIds: [1],
      }),
    );
    expect(res.status).toBe(201);
    const input = storeMock.createVocabularyWord.mock.calls[0]?.[0];
    expect(input).toEqual({
      word: "apple",
      meaning_vi: "quả táo",
      ipa: null,
      example: null,
      audio_url: null,
    });
  });

  it("body field mới → normalize vào input (cefr ' b1 '→B1, synonyms chuẩn hoá)", async () => {
    await POST(
      jsonReq("/api/admin/vocabulary", "POST", {
        word: "apple",
        meaning_vi: "quả táo",
        cefr: " b1 ",
        pos: " Noun ",
        synonyms: " x , y ",
        imageUrl: "https://cdn.example.com/i.png",
      }),
    );
    const input = storeMock.createVocabularyWord.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      cefr: "B1",
      pos: "noun",
      synonyms: "x, y",
      image_url: "https://cdn.example.com/i.png",
    });
  });

  it("field mới sai → mã lỗi 400 từng trường hợp (invalidCefr/invalidPos/invalidSynonyms/invalidImageUrl)", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ cefr: "Z9" }, "invalidCefr"],
      [{ pos: "x".repeat(40) }, "invalidPos"],
      [{ synonyms: "a,".repeat(300) }, "invalidSynonyms"],
      [{ image_url: "nope" }, "invalidImageUrl"],
    ];
    for (const [extra, code] of cases) {
      const res = await POST(
        jsonReq("/api/admin/vocabulary", "POST", { word: "a", meaning_vi: "b", ...extra }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: code });
    }
    expect(storeMock.createVocabularyWord).not.toHaveBeenCalled();
  });
});

describe("PATCH field mới (VU-43 SF-1)", () => {
  it("cefr/pos/synonyms/image_url hợp lệ → patch Drizzle property-name (imageUrl camel)", async () => {
    const res = await PATCH(
      jsonReq("/api/admin/vocabulary", "PATCH", {
        id: 7,
        cefr: "b2",
        pos: "NOUN",
        synonyms: "x, y",
        image_url: "https://x/i.png",
      }),
    );
    expect(res.status).toBe(200);
    expect(storeMock.updateVocabularyWord).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        cefr: "B2",
        pos: "noun",
        synonyms: "x, y",
        imageUrl: "https://x/i.png",
      }),
    );
  });

  it("source: 'oxford-ld' | 'teacher'→null | rỗng→null; lạ → 400 invalidSource", async () => {
    await PATCH(jsonReq("/api/admin/vocabulary", "PATCH", { id: 7, source: "oxford-ld" }));
    expect(storeMock.updateVocabularyWord.mock.calls[0]?.[1]).toMatchObject({ source: "oxford-ld" });
    await PATCH(jsonReq("/api/admin/vocabulary", "PATCH", { id: 7, source: "teacher" }));
    expect(storeMock.updateVocabularyWord.mock.calls[1]?.[1]).toMatchObject({ source: null });
    const bad = await PATCH(
      jsonReq("/api/admin/vocabulary", "PATCH", { id: 7, source: "gpt-5" }),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ ok: false, error: "invalidSource" });
  });

  it("field mới sai → 400 mã lỗi; patch rỗng → emptyPatch như cũ", async () => {
    const bad = await PATCH(
      jsonReq("/api/admin/vocabulary", "PATCH", { id: 7, cefr: "nope" }),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ ok: false, error: "invalidCefr" });

    const empty = await PATCH(jsonReq("/api/admin/vocabulary", "PATCH", { id: 7 }));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ ok: false, error: "emptyPatch" });
  });
});
