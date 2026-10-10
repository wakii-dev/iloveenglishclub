import { NextResponse, type NextRequest } from "next/server";
import {
  BULK_CAP,
  bulkAssignBooks,
  bulkDeleteApply,
  bulkDeleteDryRun,
  bulkTagCefr,
} from "@/lib/admin/cms-bulk-store";
import { validateCefrInput } from "@/lib/admin/vocabulary";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";

export const runtime = "nodejs";

/**
 * POST /api/admin/vocabulary/bulk (VU-43 SF-1 task 6) — 1 route mọi bulk op:
 * {action:'assign-books'|'tag-cefr'|'delete', wordIds[], bookIds?, cefr?,
 * dryRun?}. Cap 500 ids (tooMany); client chunk >500 + aggregate report.
 * revalidateContent do STORE gọi — đúng 1 lần cuối batch (contract pin).
 */

function authError(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenError) {
    const status = error.message === "not-authenticated" ? 401 : 403;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return null;
}

function idsFromBody(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.map((v) => Number(v));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;
  return ids;
}

export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (error) {
    const mapped = authError(error);
    if (mapped) return mapped;
    console.error("[vocabulary:bulk] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalidJson" }, { status: 400 });
  }

  const wordIds = idsFromBody(body.wordIds);
  if (wordIds === null) {
    return NextResponse.json({ ok: false, error: "invalidWordIds" }, { status: 400 });
  }
  if (wordIds.length > BULK_CAP) {
    return NextResponse.json({ ok: false, error: "tooMany" }, { status: 400 });
  }
  const action = body.action;

  if (action === "assign-books") {
    const bookIds = idsFromBody(body.bookIds);
    if (bookIds === null || bookIds.length === 0) {
      return NextResponse.json({ ok: false, error: "invalidBookIds" }, { status: 400 });
    }
    const result = await bulkAssignBooks(wordIds, bookIds);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (action === "tag-cefr") {
    const cefr = validateCefrInput(body.cefr);
    if (cefr === null || typeof cefr === "object") {
      return NextResponse.json({ ok: false, error: "invalidCefr" }, { status: 400 });
    }
    const report = await bulkTagCefr(wordIds, cefr);
    return NextResponse.json({ ok: true, report });
  }

  if (action === "delete") {
    if (body.dryRun === true) {
      const report = await bulkDeleteDryRun(wordIds);
      return NextResponse.json({ ok: true, report });
    }
    const report = await bulkDeleteApply(wordIds);
    return NextResponse.json({ ok: true, report });
  }

  return NextResponse.json({ ok: false, error: "invalidAction" }, { status: 400 });
}
