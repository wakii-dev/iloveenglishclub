import { NextResponse, type NextRequest } from "next/server";
import { importVocabulary } from "@/lib/admin/vocabulary-store";
import {
  parseVocabularyCsv,
  parseVocabularyJson,
  planImport,
} from "@/lib/admin/vocabulary";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";

export const runtime = "nodejs";

/**
 * Bulk import vocabulary (SF-1 t-1.2) — POST JSON body
 * { bookId, format: "json" | "csv", content }. Validate từng dòng → report
 * lỗi {line, word, error} KHÔNG chặn dòng hợp lệ (teacher sửa lẻ, re-run
 * idempotent). 401/403 + JSON error codes cùng pattern upload route.
 */
export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      const status = error.message === "not-authenticated" ? 401 : 403;
      return NextResponse.json({ ok: false, error: error.message }, { status });
    }
    console.error("[vocabulary:import] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalidJson" }, { status: 400 });
  }

  const bookId = Number(body.bookId);
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return NextResponse.json({ ok: false, error: "invalidBookId" }, { status: 400 });
  }
  if (body.format !== "json" && body.format !== "csv") {
    return NextResponse.json({ ok: false, error: "invalidFormat" }, { status: 400 });
  }
  if (typeof body.content !== "string" || body.content.trim() === "") {
    return NextResponse.json({ ok: false, error: "noContent" }, { status: 400 });
  }

  const parsed =
    body.format === "csv"
      ? parseVocabularyCsv(body.content)
      : parseVocabularyJson(body.content);
  const fileError = parsed.errors.find((e) => e.line === 0 || (body.format === "csv" && e.error === "badCsvHeader"));
  if (fileError) {
    return NextResponse.json({ ok: false, error: fileError.error }, { status: 400 });
  }

  const plan = planImport(parsed.rows, parsed.errors);
  const report = await importVocabulary(bookId, plan.rows);
  return NextResponse.json({
    ok: true,
    bookId,
    total: parsed.rows.length + parsed.errors.length,
    imported: report.imported,
    linked: report.linked,
    skipped: report.skipped,
    errors: [...plan.errors, ...report.errors],
  });
}
