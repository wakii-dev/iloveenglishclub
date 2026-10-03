import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { applyReview } from "@/lib/vocabulary/review-store";
import { QUALITY_MAX, QUALITY_MIN } from "@/lib/vocabulary/srs";

export const runtime = "nodejs";

/**
 * POST /api/vocabulary/review (SF-3 t-3.2) — ghi 1 lần ôn flashcard. User từ
 * session (NextAuth) — 401 JSON khi chưa đăng nhập, KHÔNG redirect (fetch
 * client). quality 0–5 nguyên (engine tự kẹp lẻ, route chặt biên trước).
 * Ghi qua applyReview (SRS engine + upsert user_word_progress).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "not-authenticated" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalidJson" }, { status: 400 });
  }

  const wordId = Number(body.word_id);
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return NextResponse.json({ ok: false, error: "invalidWordId" }, { status: 400 });
  }
  const quality = Number(body.quality);
  if (
    !Number.isInteger(quality) ||
    quality < QUALITY_MIN ||
    quality > QUALITY_MAX
  ) {
    return NextResponse.json({ ok: false, error: "invalidQuality" }, { status: 400 });
  }

  try {
    const result = await applyReview(userId, wordId, quality);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    }
    return NextResponse.json({ ok: true, progress: result.progress });
  } catch (error) {
    console.error("[vocabulary:review] apply failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
