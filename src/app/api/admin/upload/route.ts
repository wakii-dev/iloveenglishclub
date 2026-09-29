import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { books, lessonParts, lessons, units } from "@/db/schema";
import { CONTENT_TAG } from "@/lib/revalidate";
import { buildAudioPath, putAudio } from "@/lib/storage";
import {
  MAX_AUDIO_BYTES,
  mimeToAudioExt,
} from "@/lib/admin/audio-mapping";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";

export const runtime = "nodejs";

/**
 * Upload audio THẲNG browser → route handler (SF-5 — spec §6: KHÔNG Server
 * Action vì body limit ~1MB). Single write path cho audio: build path theo
 * convention seed `audio/{book}/unit-{n}/lesson-{n}/{NN}.{ext}` (NN = số part,
 * extension theo mime), putAudio theo driver (local dev / Blob prod-SF-8),
 * update part (audioPath + durationMs fail-soft), revalidate nếu published
 * (matrix spec §5). Upload lại cùng part = replace (overwrite cùng path).
 * AssertAdmin lại ở server (spec §3 trust boundary) — 401/403 JSON.
 */
export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      const status = error.message === "not-authenticated" ? 401 : 403;
      return NextResponse.json(
        { ok: false, error: error.message },
        { status },
      );
    }
    console.error("[upload] auth check failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalidForm" }, { status: 400 });
  }

  const file = form.get("file");
  const lessonId = Number(form.get("lessonId"));
  const partIndex = Number(form.get("partIndex"));
  const durationRaw = String(form.get("durationMs") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "noFile" }, { status: 400 });
  }
  if (!Number.isInteger(lessonId) || !Number.isInteger(partIndex) || partIndex < 1) {
    return NextResponse.json({ ok: false, error: "invalidTarget" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ ok: false, error: "tooLarge" }, { status: 413 });
  }
  const ext = mimeToAudioExt(file.type);
  if (!ext) {
    return NextResponse.json({ ok: false, error: "unsupportedFormat" }, { status: 415 });
  }

  // Path context từ lessonId: books.slug + units.number + lessons.number (join)
  const [part] = await db
    .select({
      partId: lessonParts.id,
      bookSlug: books.slug,
      unitNumber: units.number,
      lessonNumber: lessons.number,
      published: lessons.published,
    })
    .from(lessonParts)
    .innerJoin(lessons, eq(lessonParts.lessonId, lessons.id))
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(books, eq(units.bookId, books.id))
    .where(and(eq(lessonParts.lessonId, lessonId), eq(lessonParts.sortOrder, partIndex)))
    .limit(1);
  if (!part) {
    return NextResponse.json({ ok: false, error: "partNotFound" }, { status: 404 });
  }

  const path = buildAudioPath({
    book: part.bookSlug,
    unit: `unit-${part.unitNumber}`,
    lesson: `lesson-${part.lessonNumber}`,
    index: partIndex,
  }).replace(/\.mp3$/, `.${ext}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  await putAudio(path, buffer, file.type || `audio/${ext}`);

  // durationMs fail-soft (spec §6): parse lỗi → null, KHÔNG block
  const durationMs = /^\d+$/.test(durationRaw)
    ? Math.min(Number.parseInt(durationRaw, 10), 600000)
    : null;

  await db
    .update(lessonParts)
    .set({ audioPath: path, durationMs })
    .where(eq(lessonParts.id, part.partId));

  if (part.published) revalidateTag(CONTENT_TAG);

  return NextResponse.json({ ok: true, path });
}
