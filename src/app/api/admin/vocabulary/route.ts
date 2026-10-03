import { NextResponse, type NextRequest } from "next/server";
import {
  createVocabularyWord,
  deleteVocabularyWord,
  listVocabulary,
  updateVocabularyWord,
  type WordPatch,
} from "@/lib/admin/vocabulary-store";
import {
  AUDIO_URL_MAX,
  EXAMPLE_MAX,
  IPA_MAX,
  WORD_MAX,
  optionalField,
  validateWordInput,
} from "@/lib/admin/vocabulary";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";

export const runtime = "nodejs";

/**
 * Admin vocabulary CRUD (SF-1 t-1.2) — REST JSON. Authz app-level (pivot
 * VU-15): assertAdmin re-check DB ở MỖI method (401/403 JSON, cùng pattern
 * upload route). Validate trả error code (UI i18n map ở t-1.3); response
 * word dùng snake_case khớp cột DB + shape import.
 */

function authError(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenError) {
    const status = error.message === "not-authenticated" ? 401 : 403;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  return null;
}

function clampInt(raw: string | null, fallback: number, max: number): number {
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
    console.error("[vocabulary:GET] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  const params = req.nextUrl.searchParams;
  const bookIdRaw = Number(params.get("bookId"));
  const result = await listVocabulary({
    bookId: Number.isInteger(bookIdRaw) && bookIdRaw > 0 ? bookIdRaw : undefined,
    q: params.get("q")?.trim() || undefined,
    limit: clampInt(params.get("limit"), 50, 200),
    offset: clampInt(params.get("offset"), 0, Number.MAX_SAFE_INTEGER),
  });
  return NextResponse.json({ ok: true, ...result });
}

function bookIdsFromBody(value: unknown): number[] | null {
  if (value === undefined) return [];
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
    console.error("[vocabulary:POST] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalidJson" }, { status: 400 });
  }

  const validated = validateWordInput(body);
  if ("error" in validated) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }
  const bookIds = bookIdsFromBody(body.bookIds);
  if (bookIds === null) {
    return NextResponse.json({ ok: false, error: "invalidBookIds" }, { status: 400 });
  }

  const result = await createVocabularyWord(validated, bookIds);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  // duplicate=true → word reuse (idempotent re-create) trả 200; mới → 201
  return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
}

export async function PATCH(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (error) {
    const mapped = authError(error);
    if (mapped) return mapped;
    console.error("[vocabulary:PATCH] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalidJson" }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "invalidId" }, { status: 400 });
  }

  // Partial update: chỉ đụng field có mặt trong body (word là định danh unique
  // — validate riêng; meaning/ipa/example/audio_url cho phép rỗng hoá → null)
  const patch: WordPatch = {};
  if (body.word !== undefined) {
    if (typeof body.word !== "string" || !body.word.trim()) {
      return NextResponse.json({ ok: false, error: "wordRequired" }, { status: 400 });
    }
    const word = body.word.trim();
    if (word.length > WORD_MAX || /[\r\n]/.test(word)) {
      return NextResponse.json({ ok: false, error: "wordTooLong" }, { status: 400 });
    }
    patch.word = word;
  }
  if (body.ipa !== undefined) patch.ipa = optionalField(body.ipa, IPA_MAX);
  if (body.example !== undefined) patch.example = optionalField(body.example, EXAMPLE_MAX);
  if (body.audio_url !== undefined) {
    const audio = optionalField(body.audio_url, AUDIO_URL_MAX);
    if (audio !== null && !/^https?:\/\//.test(audio)) {
      return NextResponse.json({ ok: false, error: "invalidAudioUrl" }, { status: 400 });
    }
    patch.audioUrl = audio;
  }
  if (body.meaning_vi !== undefined) {
    const meaning = typeof body.meaning_vi === "string" ? body.meaning_vi.trim() : "";
    if (!meaning) {
      return NextResponse.json({ ok: false, error: "meaningRequired" }, { status: 400 });
    }
    patch.meaningVi = meaning;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "emptyPatch" }, { status: 400 });
  }

  const result = await updateVocabularyWord(id, patch);
  if (!result.ok) {
    const status = result.error === "notFound" ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (error) {
    const mapped = authError(error);
    if (mapped) return mapped;
    console.error("[vocabulary:DELETE] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "invalidId" }, { status: 400 });
  }
  const deleted = await deleteVocabularyWord(id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "notFound" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
