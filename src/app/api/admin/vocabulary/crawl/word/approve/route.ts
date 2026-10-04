import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";
import { approveWordDb } from "@/lib/oxford/enrich";
import { MEANING_MAX, WORD_MAX } from "@/lib/admin/vocabulary";

export const runtime = "nodejs";

/**
 * POST /api/admin/vocabulary/crawl/word/approve (VU-32 SF-2) — crawl-on-add
 * duyệt: {entry (payload y như preview trả), meaning_vi (teacher gõ — BẮT
 * BUỘC, crawl không bao giờ sinh), bookId} → tạo word + link book + cefr +
 * source='oxford-ld'. Word ĐÃ TỒN TẠI → reuse + attach (idempotent). AUDIO:
 * ngoại lệ 1 mp3 UK (fallback US) tải về Blob QUA HELPER BLOB-ONLY của SF-1
 * trong request; throw → word VẪN tạo KHÔNG audio (không hotlink).
 * assertAdmin ở route.
 */

function authError(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenError) {
    const status = error.message === "not-authenticated" ? 401 : 403;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return null;
}

function parseEntryPayload(raw: unknown):
  | { ok: true; entry: Parameters<typeof approveWordDb>[0]["entry"] }
  | { ok: false } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false };
  const e = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const slug = typeof e.slug === "string" ? e.slug.trim() : "";
  const word = typeof e.word === "string" ? e.word.trim() : "";
  if (!slug || !word || slug.length > 200 || word.length > WORD_MAX) return { ok: false };
  return {
    ok: true,
    entry: {
      slug,
      word,
      ipaUk: str(e.ipaUk),
      ipaUs: str(e.ipaUs),
      cefr: str(e.cefr),
      pos: str(e.pos),
      audioUkBlob: str(e.audioUkBlob),
      audioUsBlob: str(e.audioUsBlob),
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (error) {
    const mapped = authError(error);
    if (mapped) return mapped;
    console.error("[crawl:approve] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalidJson" }, { status: 400 });
  }

  const parsedEntry = parseEntryPayload(body.entry);
  if (!parsedEntry.ok) {
    return NextResponse.json({ ok: false, error: "invalidEntry" }, { status: 400 });
  }
  const meaning =
    typeof body.meaning_vi === "string" ? body.meaning_vi.trim() : "";
  if (!meaning) {
    return NextResponse.json({ ok: false, error: "meaningRequired" }, { status: 400 });
  }
  if (meaning.length > MEANING_MAX) {
    return NextResponse.json({ ok: false, error: "meaningTooLong" }, { status: 400 });
  }
  const bookId = Number(body.bookId);
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return NextResponse.json({ ok: false, error: "invalidBookId" }, { status: 400 });
  }

  try {
    const result = await approveWordDb({
      entry: parsedEntry.entry,
      meaningVi: meaning,
      bookId,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    // duplicate=true → word reuse trả 200; mới → 201 (cùng convention create)
    return NextResponse.json(
      {
        ok: true,
        id: result.id,
        duplicate: result.duplicate,
        audioAttached: result.audioAttached,
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    console.error("[crawl:approve] failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
