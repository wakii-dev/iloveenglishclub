import { NextResponse } from "next/server";
import { cmsStatsDb } from "@/lib/admin/cms-stats-store";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";

export const runtime = "nodejs";

/**
 * GET /api/admin/vocabulary/stats (VU-43 SF-1 task 8) — shape PIN spec §4:
 * totals{words,withAudio,withImage,orphan,enriched} + cefrHistogram
 * {A1..C2,untagged,other} + perSource + perBook[{bookId,title,words,
 * withAudio}] + crawl (reuse crawlStatsDb VU-32). Lỗi lib → 500 generic.
 */

function authError(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenError) {
    const status = error.message === "not-authenticated" ? 401 : 403;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return null;
}

export async function GET() {
  try {
    await assertAdmin();
  } catch (error) {
    const mapped = authError(error);
    if (mapped) return mapped;
    console.error("[vocabulary:stats] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  try {
    const stats = await cmsStatsDb();
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    console.error("[vocabulary:stats] failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
