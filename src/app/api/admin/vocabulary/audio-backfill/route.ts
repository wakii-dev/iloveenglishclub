import { NextResponse, type NextRequest } from "next/server";
import {
  BACKFILL_APPLY_CAP,
  applyAudioBackfill,
  planAudioBackfill,
  type BackfillScope,
} from "@/lib/admin/audio-backfill";
import { putAudio } from "@/lib/storage-server";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";

export const runtime = "nodejs";

/**
 * POST /api/admin/vocabulary/audio-backfill (VU-43 SF-1 task 9) — {scope:
 * {bookId}|{wordIds}, dryRun, limit?, allowDownload?}. SCOPE BẮT BUỘC →
 * scopeRequired. dryRun → plan {matched,pending,missing}; apply → copy blob
 * URL cap 200 (+ allowDownload cap 100 qua deps fetch+putAudio). Store tự
 * revalidate 1 lần cuối apply.
 */

function authError(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenError) {
    const status = error.message === "not-authenticated" ? 401 : 403;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return null;
}

function scopeFromBody(value: unknown): BackfillScope | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if ("bookId" in raw) {
    const bookId = Number(raw.bookId);
    return Number.isInteger(bookId) && bookId > 0 ? { bookId } : null;
  }
  if ("wordIds" in raw) {
    if (!Array.isArray(raw.wordIds) || raw.wordIds.length === 0) return null;
    const ids = raw.wordIds.map((v) => Number(v));
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;
    return { wordIds: ids };
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (error) {
    const mapped = authError(error);
    if (mapped) return mapped;
    console.error("[vocabulary:audio-backfill] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalidJson" }, { status: 400 });
  }

  const scope = scopeFromBody(body.scope);
  if (scope === null) {
    return NextResponse.json({ ok: false, error: "scopeRequired" }, { status: 400 });
  }
  const limitRaw = Number(body.limit);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, BACKFILL_APPLY_CAP)
      : BACKFILL_APPLY_CAP;
  const allowDownload = body.allowDownload === true;

  try {
    if (body.dryRun === true) {
      const plan = await planAudioBackfill(scope, limit);
      return NextResponse.json({ ok: true, plan });
    }
    const report = await applyAudioBackfill(scope, {
      limit,
      allowDownload,
      // deps thật (prod): fetch audio gốc + put storage dual-driver (local dev
      // → public/uploads, prod → Blob CDN) — test inject mock
      deps: {
        download: async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`download ${res.status}`);
          return Buffer.from(await res.arrayBuffer());
        },
        put: (path, data, contentType) => putAudio(path, data, contentType),
      },
    });
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error("[vocabulary:audio-backfill] failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
