import { NextResponse } from "next/server";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";
import { crawlStatsDb } from "@/lib/oxford/enrich";

export const runtime = "nodejs";

/**
 * GET /api/admin/vocabulary/crawl/stats (VU-32 SF-2) — dashboard crawl.
 * Shape PIN: {counts, samples, lastRun} — last-run DERIVED từ max(fetched_at),
 * KHÔNG có bảng crawl_runs (spec cấm tự chế). assertAdmin ở route.
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
    console.error("[crawl:stats] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  try {
    const stats = await crawlStatsDb();
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    console.error("[crawl:stats] failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
