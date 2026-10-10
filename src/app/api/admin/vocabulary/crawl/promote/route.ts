import { NextResponse, type NextRequest } from "next/server";
import { PROMOTE_CAP, promoteCrawlEntries } from "@/lib/admin/promote-store";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";

export const runtime = "nodejs";

/**
 * POST /api/admin/vocabulary/crawl/promote (VU-43 SF-1 task 11) — {entryIds[],
 * bookId, meanings:{[entryId]:string}} cap 200 → tooMany. meanings validate
 * bắt buộc TỪNG entry (meaningRequired) TRƯỚC mutation nào; store tự advisory
 * lock book + revalidate 1 lần cuối batch. KHÔNG đụng crawl_entries.status.
 */

function authError(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenError) {
    const status = error.message === "not-authenticated" ? 401 : 403;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return null;
}

function idsFromBody(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ids = value.map((v) => Number(v));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;
  return ids;
}

/** meanings có mặt + non-empty (sau trim) cho TẤT CẢ entryIds — 1 thiếu fail all. */
function meaningsComplete(
  meanings: unknown,
  entryIds: number[],
): meanings is Record<string, string> {
  if (typeof meanings !== "object" || meanings === null || Array.isArray(meanings)) {
    return false;
  }
  const map = meanings as Record<string, unknown>;
  return entryIds.every((id) => {
    const meaning = map[String(id)];
    return typeof meaning === "string" && meaning.trim().length > 0;
  });
}

export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (error) {
    const mapped = authError(error);
    if (mapped) return mapped;
    console.error("[vocabulary:promote] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalidJson" }, { status: 400 });
  }

  const entryIds = idsFromBody(body.entryIds);
  if (entryIds === null) {
    return NextResponse.json({ ok: false, error: "invalidEntryIds" }, { status: 400 });
  }
  if (entryIds.length > PROMOTE_CAP) {
    return NextResponse.json({ ok: false, error: "tooMany" }, { status: 400 });
  }
  const bookId = Number(body.bookId);
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return NextResponse.json({ ok: false, error: "invalidBookId" }, { status: 400 });
  }
  // meanings bắt buộc từng entry — validate TRƯỚC mutation nào (spec pin)
  if (!meaningsComplete(body.meanings, entryIds)) {
    return NextResponse.json({ ok: false, error: "meaningRequired" }, { status: 400 });
  }

  try {
    const result = await promoteCrawlEntries(entryIds, bookId, body.meanings);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[vocabulary:promote] failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
