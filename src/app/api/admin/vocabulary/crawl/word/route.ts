import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";
import { previewWordDb } from "@/lib/oxford/enrich";
import { WORD_MAX } from "@/lib/admin/vocabulary";

export const runtime = "nodejs";

/**
 * POST /api/admin/vocabulary/crawl/word (VU-32 SF-2) — crawl-on-add preview,
 * cache-first: crawl_entries trúng → không gọi Oxford; miss → live fetch+parse
 * (fetchEntry SF-1 — SSRF allowlist, timeout, size-cap) KHÔNG ghi DB.
 * Shape PIN: {found, from:'cache'|'live', entry:{slug,word,ipaUk,ipaUs,cefr,
 * pos,audioUkBlob,audioUsBlob}|null}. assertAdmin ở route.
 */

function authError(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenError) {
    const status = error.message === "not-authenticated" ? 401 : 403;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (error) {
    const mapped = authError(error);
    if (mapped) return mapped;
    console.error("[crawl:word] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalidJson" }, { status: 400 });
  }

  const word = typeof body.word === "string" ? body.word.trim() : "";
  if (!word || word.length > WORD_MAX || /[\r\n]/.test(word)) {
    return NextResponse.json({ ok: false, error: "invalidWord" }, { status: 400 });
  }
  if (body.bookId !== undefined) {
    const bookId = Number(body.bookId);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ ok: false, error: "invalidBookId" }, { status: 400 });
    }
  }

  try {
    const result = await previewWordDb(word);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // live fetch qua fetchEntry SF-1 (timeout/HTTP/network) → upstream lỗi → 502
    console.error("[crawl:word] preview failed:", error);
    if (error instanceof Error) {
      return NextResponse.json({ ok: false, error: "liveFetchFailed" }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
