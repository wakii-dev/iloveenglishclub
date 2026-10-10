import { NextResponse, type NextRequest } from "next/server";
import { listCrawlEntries } from "@/lib/admin/crawl-entries-store";
import { parseCefrFilter } from "@/lib/admin/vocabulary";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";

export const runtime = "nodejs";

/**
 * GET /api/admin/vocabulary/crawl/entries (VU-43 SF-1 task 10) — browse lake
 * cho curation UI (SF-3): filters status (default parsed), q (word COALESCE
 * pretty slug), cefr, pos, ox3000; pagination server-side; rows kèm hasWord
 * (duplicate predicate §4). READ-ONLY — KHÔNG đụng runner/status machine.
 */

function authError(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenError) {
    const status = error.message === "not-authenticated" ? 401 : 403;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return null;
}

function clampInt(raw: string | null, fallback: number, max: number): number {
  // null/"" → fallback (Number(null)=0 — không nhè default là 0)
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return Math.min(n, max);
}

export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (error) {
    const mapped = authError(error);
    if (mapped) return mapped;
    console.error("[vocabulary:crawl-entries] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  const params = req.nextUrl.searchParams;
  const ox3000Raw = params.get("ox3000");
  try {
    const result = await listCrawlEntries({
      status: params.get("status")?.trim() || "parsed",
      q: params.get("q")?.trim() || undefined,
      cefr: parseCefrFilter(params.get("cefr")),
      pos: params.get("pos")?.trim() || undefined,
      ox3000: ox3000Raw === "1" ? true : ox3000Raw === "0" ? false : undefined,
      limit: clampInt(params.get("limit"), 50, 200),
      offset: clampInt(params.get("offset"), 0, Number.MAX_SAFE_INTEGER),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[vocabulary:crawl-entries] failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
