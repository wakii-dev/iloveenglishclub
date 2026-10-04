import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";
import { refreshSitemapDb, retryFailedDb } from "@/lib/oxford/enrich";

export const runtime = "nodejs";

/**
 * POST /api/admin/vocabulary/crawl/control (VU-32 SF-2) — control-plane:
 * - 'refresh-sitemap': diff sitemap vs DB → upsert CHỈ slug mới; delta >
 *   2000 → {deltaTooLarge, hint} (không upsert cưỡng bức trong request).
 * - 'retry-failed': reset failed→pending với attempts < 5.
 * Runner là script ngoài (cron/nohup) — API KHÔNG chạy crawl (spec §[api]).
 * assertAdmin ở route.
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
    console.error("[crawl:control] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalidJson" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "refresh-sitemap" && action !== "retry-failed") {
    return NextResponse.json({ ok: false, error: "invalidAction" }, { status: 400 });
  }

  try {
    if (action === "refresh-sitemap") {
      const result = await refreshSitemapDb();
      return NextResponse.json({ ok: true, ...result });
    }
    const { reset } = await retryFailedDb();
    return NextResponse.json({ ok: true, reset });
  } catch (error) {
    // refresh-sitemap fetch XML thật (SF-1 lib throw HttpError/Timeout/Network)
    // → upstream lỗi → 502 phân biệt với 500 nội bộ
    console.error(`[crawl:control] ${action} failed:`, error);
    if (action === "refresh-sitemap") {
      return NextResponse.json({ ok: false, error: "sitemapFetchFailed" }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
