import { NextResponse, type NextRequest } from "next/server";
import { putAudio } from "@/lib/storage-server";
import { ForbiddenError, assertAdmin } from "@/lib/content/guards";

export const runtime = "nodejs";

/**
 * POST /api/admin/vocabulary/image (VU-43 SF-1 task 12) — upload 1 image qua
 * multipart (SF-2 edit dialog dùng): max 2MB (imageTooLarge), mime allowlist
 * png/jpeg/webp (imageMime), put storage dual-driver path images/words/
 * {wordId|tmp}-{timestamp}.{ext} (cùng dual-driver audio — local public/,
 * prod Blob CDN). Response {ok, url}. Upload xong mà save từ fail → Blob mồ
 * côi chấp nhận (không GC — spec §2.1 note).
 */

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

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
    console.error("[vocabulary:image] auth failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "imageMime" }, { status: 400 });
  }

  // multipart 1 file — nhận field name BẤT KỲ (uploader SF-2 tự chọn)
  const file = [...form.values()].find(
    (v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v,
  );
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "imageMime" }, { status: 400 });
  }
  const ext = IMAGE_MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ ok: false, error: "imageMime" }, { status: 400 });
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "imageTooLarge" }, { status: 400 });
  }

  const wordIdRaw = Number(form.get("wordId"));
  const namePrefix =
    Number.isInteger(wordIdRaw) && wordIdRaw > 0 ? String(wordIdRaw) : "tmp";
  const path = `images/words/${namePrefix}-${Date.now()}.${ext}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await putAudio(path, buffer, file.type);
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error("[vocabulary:image] upload failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
