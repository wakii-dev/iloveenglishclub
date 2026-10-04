import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";
import { ENRICH_MAX_WORDS, EnrichCapError, enrichWordsDb } from "@/lib/oxford/enrich";

export const runtime = "nodejs";

/**
 * POST /api/admin/vocabulary/crawl/enrich (VU-32 SF-2) — fill-empty cho words
 * của book hoặc theo wordIds. Shape PIN context pack §4: {bookId | wordIds[],
 * dryRun?}; dryRun:true → counts (không ghi); thiếu dryRun → apply + report
 * per-word. Cap ${ENRICH_MAX_WORDS} từ/request — SF-3 UI loop batch
 * (continue-and-collect). assertAdmin ở route (pattern vocabulary route).
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
    console.error("[crawl:enrich] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalidJson" }, { status: 400 });
  }

  // bookId | wordIds[] — ĐÚNG MỘT trong hai
  const hasBook = body.bookId !== undefined;
  const hasIds = body.wordIds !== undefined;
  if (hasBook === hasIds) {
    return NextResponse.json({ ok: false, error: "invalidBody" }, { status: 400 });
  }
  const bookId = Number(body.bookId);
  const wordIds = hasIds
    ? (body.wordIds as unknown[]).map((v) => Number(v))
    : undefined;
  const bookIdOk = !hasBook || (Number.isInteger(bookId) && bookId > 0);
  const idsOk =
    !hasIds ||
    (Array.isArray(body.wordIds) &&
      wordIds!.length > 0 &&
      wordIds!.every((id) => Number.isInteger(id) && id > 0));
  if (!bookIdOk || !idsOk) {
    return NextResponse.json({ ok: false, error: "invalidBody" }, { status: 400 });
  }
  if (wordIds !== undefined && wordIds.length > ENRICH_MAX_WORDS) {
    return NextResponse.json({ ok: false, error: "tooManyWords" }, { status: 400 });
  }

  const dryRun = body.dryRun === true;
  try {
    const result = await enrichWordsDb({
      ...(hasBook ? { bookId } : { wordIds }),
      dryRun,
    });
    if (dryRun) {
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ ok: true, report: result });
  } catch (error) {
    if (error instanceof EnrichCapError) {
      return NextResponse.json({ ok: false, error: "tooManyWords" }, { status: 400 });
    }
    console.error("[crawl:enrich] failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
