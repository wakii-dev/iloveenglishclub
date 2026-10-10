import { NextResponse, type NextRequest } from "next/server";
import { listVocabulary } from "@/lib/admin/vocabulary-store";
import {
  EXPORT_MAX_ROWS,
  buildVocabularyCsv,
  exportCsvFilename,
} from "@/lib/admin/export-csv";
import { parseCefrFilter } from "@/lib/admin/vocabulary";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";

export const runtime = "nodejs";

/**
 * GET /api/admin/vocabulary/export (VU-43 SF-1 task 7) — CSV download giữ
 * nguyên filter params của GET list. Spec §5.6: >10k rows → {ok:false,
 * error:'tooMany'} (KHÔNG truncate âm thầm); 0 rows → header-only; filename
 * vocabulary-YYYY-MM-DD.csv; sort = sort param (default created desc).
 */

function authError(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenError) {
    const status = error.message === "not-authenticated" ? 401 : 403;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (error) {
    const mapped = authError(error);
    if (mapped) return mapped;
    console.error("[vocabulary:export] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  const params = req.nextUrl.searchParams;
  const bookIdRaw = Number(params.get("bookId"));
  const sourceRaw = params.get("source");
  const audioRaw = params.get("audio");
  const sortRaw = params.get("sort");
  const filters = {
    bookId:
      Number.isInteger(bookIdRaw) && bookIdRaw > 0 ? bookIdRaw : undefined,
    q: params.get("q")?.trim() || undefined,
    cefr: parseCefrFilter(params.get("cefr")),
    source:
      sourceRaw === "oxford-ld" || sourceRaw === "teacher" ? sourceRaw : undefined,
    audio: audioRaw === "has" || audioRaw === "missing" ? audioRaw : undefined,
    orphan: params.get("orphan") === "1",
    sort:
      sortRaw === "word" || sortRaw === "cefr" || sortRaw === "created"
        ? sortRaw
        : undefined,
  } as const;

  // Chặn >10k TRƯỚC khi fetch — count query rẻ hơn load full (Neon shared-DB,
  // tránh LIMIT lớn flake)
  const counted = await listVocabulary({ ...filters, limit: 1, offset: 0 });
  if (counted.total > EXPORT_MAX_ROWS) {
    return NextResponse.json({ ok: false, error: "tooMany" }, { status: 400 });
  }

  const { items } = await listVocabulary({
    ...filters,
    limit: Math.max(counted.total, 1),
    offset: 0,
  });
  const csv = buildVocabularyCsv(items);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportCsvFilename()}"`,
    },
  });
}
