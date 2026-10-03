import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/vocabulary/lookup route contract (SF-5 t-5.3) — mock store. Public GET:
 * word thiếu/rỗng → 400 invalidWord; bookId lệch → 400 invalidBookId; trúng →
 * 200 snake_case {word, ipa, meaning_vi, example, audio_url}; store null → 404
 * {error:"not_in_vocabulary"}; store ném lỗi → 500 generic.
 */
const storeMock = vi.hoisted(() => ({
  lookupWordInBook: vi.fn(),
}));
vi.mock("@/lib/vocabulary/lookup-store", () => ({
  lookupWordInBook: storeMock.lookupWordInBook,
}));

const { GET } = await import("./route");

const URL = "http://localhost/api/vocabulary/lookup";

function get(query: string): NextRequest {
  return new NextRequest(`${URL}${query}`);
}

beforeEach(() => {
  storeMock.lookupWordInBook.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/vocabulary/lookup", () => {
  it.each([
    ["?bookId=3", "thiếu word"],
    ["?word=&bookId=3", "word rỗng"],
    ["?word=%20%20&bookId=3", "word chỉ khoảng trắng"],
  ])("%s (%s) → 400 invalidWord", async (query) => {
    const res = await GET(get(query));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalidWord" });
    expect(storeMock.lookupWordInBook).not.toHaveBeenCalled();
  });

  it.each([
    ["?word=cat", "thiếu bookId"],
    ["?word=cat&bookId=0", "bookId = 0"],
    ["?word=cat&bookId=-2", "bookId âm"],
    ["?word=cat&bookId=abc", "bookId không phải số"],
  ])("%s (%s) → 400 invalidBookId", async (query) => {
    const res = await GET(get(query));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalidBookId" });
    expect(storeMock.lookupWordInBook).not.toHaveBeenCalled();
  });

  it("trúng → 200 snake_case đủ 5 trường, store nhận raw word + bookId", async () => {
    storeMock.lookupWordInBook.mockResolvedValue({
      word: "football",
      ipa: "ˈfʊtbɔːl",
      meaningVi: "bóng đá",
      example: "I play football.",
      audioUrl: "https://cdn.example.com/football.mp3",
    });
    const res = await GET(get("?word=football&bookId=3"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      word: "football",
      ipa: "ˈfʊtbɔːl",
      meaning_vi: "bóng đá",
      example: "I play football.",
      audio_url: "https://cdn.example.com/football.mp3",
    });
    expect(storeMock.lookupWordInBook).toHaveBeenCalledWith(3, "football");
  });

  it("audio/ipa/example null → 200 giữ null (popover ẩn nút audio)", async () => {
    storeMock.lookupWordInBook.mockResolvedValue({
      word: "cat",
      ipa: null,
      meaningVi: "con mèo",
      example: null,
      audioUrl: null,
    });
    const res = await GET(get("?word=Cat&bookId=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      word: "cat",
      ipa: null,
      meaning_vi: "con mèo",
      example: null,
      audio_url: null,
    });
  });

  it("không có trong bộ từ vựng → 404 not_in_vocabulary", async () => {
    storeMock.lookupWordInBook.mockResolvedValue(null);
    const res = await GET(get("?word=zzz&bookId=3"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_in_vocabulary" });
  });

  it("store ném lỗi (DB chưa migrate) → 500 generic + log", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    storeMock.lookupWordInBook.mockRejectedValue(
      new Error('relation "words" does not exist'),
    );
    const res = await GET(get("?word=cat&bookId=3"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "generic" });
  });
});
