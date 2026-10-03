import { NextResponse, type NextRequest } from "next/server";
import { lookupWordInBook } from "@/lib/vocabulary/lookup-store";

export const runtime = "nodejs";

/**
 * GET /api/vocabulary/lookup?word=<từ>&bookId=<id> (SF-5 t-5.1) — public như
 * trang books (middleware bỏ qua /api). Exact-match trim + lowercase trong bộ
 * từ vựng của book; trúng → 200 {word, ipa, meaning_vi, example, audio_url}
 * (snake_case khớp contract task); không có → 404 {error:"not_in_vocabulary"}.
 */
export async function GET(req: NextRequest) {
  const word = req.nextUrl.searchParams.get("word");
  if (word === null || word.trim() === "") {
    return NextResponse.json({ error: "invalidWord" }, { status: 400 });
  }
  const bookId = Number(req.nextUrl.searchParams.get("bookId"));
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return NextResponse.json({ error: "invalidBookId" }, { status: 400 });
  }

  try {
    const entry = await lookupWordInBook(bookId, word);
    if (!entry) {
      return NextResponse.json(
        { error: "not_in_vocabulary" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      word: entry.word,
      ipa: entry.ipa,
      meaning_vi: entry.meaningVi,
      example: entry.example,
      audio_url: entry.audioUrl,
    });
  } catch (error) {
    console.error("[vocabulary:lookup] query failed:", error);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}
