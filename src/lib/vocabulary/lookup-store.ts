/**
 * Lookup DB leg (SF-5 t-5.1) — tra 1 từ trong bộ từ vựng của 1 book. Public
 * GET (route không auth — cùng phạm vi public của trang books); exact-match
 * trim + lowercase trên words.word JOIN book_words lọc theo book. Route bắt
 * lỗi DB → 500 (không fallback như content query — API tra từ phải nói thật).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, words } from "@/db/schema";

export type LookupEntry = {
  word: string;
  ipa: string | null;
  meaningVi: string;
  example: string | null;
  audioUrl: string | null;
};

/** Chuẩn hoá từ tra: trim + lowercase — input người dùng lẫn cột words.word. */
export function normalizeLookupWord(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function lookupWordInBook(
  bookId: number,
  rawWord: string,
): Promise<LookupEntry | null> {
  const normalized = normalizeLookupWord(rawWord);
  if (normalized === "") return null;
  const rows = await db
    .select({
      word: words.word,
      ipa: words.ipa,
      meaningVi: words.meaningVi,
      example: words.example,
      audioUrl: words.audioUrl,
    })
    .from(words)
    .innerJoin(bookWords, eq(bookWords.wordId, words.id))
    .where(
      and(
        eq(bookWords.bookId, bookId),
        sql`lower(${words.word}) = ${normalized}`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
