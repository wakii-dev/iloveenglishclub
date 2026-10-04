import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { seedBookProgress } from "@/lib/vocabulary/study-store";

export const runtime = "nodejs";

/**
 * POST /api/vocabulary/study-book (story vocabulary-learn t-1.2) — "Bắt đầu
 * học sách này": bulk seed user_word_progress cả book, due_at trải 5 từ/ngày
 * (seedBookProgress). User từ session (NextAuth) — 401 JSON khi chưa đăng
 * nhập; book_id nguyên > 0 nếu không → 400. Idempotent — gọi lại chỉ thêm
 * từ chưa có, KHÔNG đè SRS state (client báo "đã trong lộ trình" khi added 0).
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

  const bookId = Number(body.book_id);
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return NextResponse.json({ ok: false, error: "invalidBookId" }, { status: 400 });
  }

  try {
    const { added, total } = await seedBookProgress(userId, bookId);
    return NextResponse.json({ ok: true, added, total });
  } catch (error) {
    console.error("[vocabulary:study-book] seed failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
