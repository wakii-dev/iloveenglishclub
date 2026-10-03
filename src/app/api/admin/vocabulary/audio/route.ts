import { NextResponse, type NextRequest } from "next/server";
import { updateVocabularyWord } from "@/lib/admin/vocabulary-store";
import { buildWordAudioPath } from "@/lib/admin/vocabulary";
import {
  MAX_AUDIO_BYTES,
  mimeToAudioExt,
  persistedAudioPath,
} from "@/lib/admin/audio-mapping";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";
import { putAudio } from "@/lib/storage-server";
import { storageDriver } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Upload audio cho 1 word (SF-1 t-1.3) — CÙNG pattern upload route (SF-5):
 * browser → FormData → putAudio theo driver → persistedAudioPath lưu
 * words.audio_url (blob = URL CDN đầy đủ, local = path public/). Path theo
 * word id → re-upload = replace. assertAdmin re-check ở MỖI request.
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
    console.error("[vocabulary:audio] auth check failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalidForm" }, { status: 400 });
  }

  const file = form.get("file");
  const wordId = Number(form.get("wordId"));
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "noFile" }, { status: 400 });
  }
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return NextResponse.json({ ok: false, error: "invalidId" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ ok: false, error: "tooLarge" }, { status: 413 });
  }
  const ext = mimeToAudioExt(file.type);
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "unsupportedFormat" },
      { status: 415 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await putAudio(
      buildWordAudioPath(wordId, ext),
      buffer,
      file.type || `audio/${ext}`,
    );
    const url = persistedAudioPath(storageDriver(), stored);
    const result = await updateVocabularyWord(wordId, { audioUrl: url });
    if (!result.ok) {
      const status = result.error === "notFound" ? 404 : 409;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error("[vocabulary:audio] storage/db failed:", error);
    return NextResponse.json(
      { ok: false, error: "uploadFailed" },
      { status: 500 },
    );
  }
}
