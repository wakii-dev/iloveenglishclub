import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  buildBookQuiz,
  submitQuizAttempt,
} from "@/lib/vocabulary/quiz-store";
import {
  QUIZ_MODE_DEFAULT,
  QUIZ_MODES,
  QUIZ_TYPES,
  type QuizType,
} from "@/lib/vocabulary/quiz";

export const runtime = "nodejs";

const RESPONSE_MAX = 500;

function isQuizType(value: unknown): value is QuizType {
  return typeof value === "string" && (QUIZ_TYPES as readonly string[]).includes(value);
}

function isQuizMode(value: unknown): value is (typeof QUIZ_MODES)[number] {
  return typeof value === "string" && (QUIZ_MODES as readonly string[]).includes(value);
}

/**
 * GET /api/vocabulary/quiz?book_id=N (SF-4 t-4.1) — sinh đề cho book. Public
 * (nội dung public như trang vocabulary); đề xáo ngẫu nhiên mỗi lần gọi và
 * KHÔNG kèm đáp án (chấm ở POST soi pool phía server).
 */
export async function GET(req: NextRequest) {
  const bookId = Number(req.nextUrl.searchParams.get("book_id"));
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return NextResponse.json({ ok: false, error: "invalidBookId" }, { status: 400 });
  }

  const questions = await buildBookQuiz(bookId);
  return NextResponse.json({
    ok: true,
    bookId,
    mode: QUIZ_MODE_DEFAULT,
    questions,
  });
}

/**
 * POST /api/vocabulary/quiz (SF-4 t-4.1) — nộp bài: chấm qua engine + lưu
 * quiz_attempts. User từ session (NextAuth) — 401 JSON khi chưa đăng nhập
 * (pattern /api/vocabulary/review). mode tùy chọn, mặc định "mixed".
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

  const mode =
    body.mode === undefined ? QUIZ_MODE_DEFAULT : body.mode;
  if (!isQuizMode(mode)) {
    return NextResponse.json({ ok: false, error: "invalidMode" }, { status: 400 });
  }

  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return NextResponse.json({ ok: false, error: "invalidAnswer" }, { status: 400 });
  }
  const answers: { wordId: number; type: QuizType; response: string }[] = [];
  for (const raw of body.answers) {
    if (typeof raw !== "object" || raw === null) {
      return NextResponse.json({ ok: false, error: "invalidAnswer" }, { status: 400 });
    }
    const item = raw as Record<string, unknown>;
    const wordId = Number(item.word_id);
    const response = item.response;
    if (
      !isQuizType(item.type) ||
      !Number.isInteger(wordId) ||
      wordId <= 0 ||
      typeof response !== "string" ||
      response.trim().length === 0 ||
      response.length > RESPONSE_MAX
    ) {
      return NextResponse.json({ ok: false, error: "invalidAnswer" }, { status: 400 });
    }
    answers.push({ wordId, type: item.type, response });
  }

  try {
    const result = await submitQuizAttempt(userId, bookId, mode, answers);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.error === "bookNotFound" ? 404 : 400 });
    }
    return NextResponse.json({
      ok: true,
      score: result.score,
      correct: result.correct,
      total: result.total,
      detail: result.detail,
    });
  } catch (error) {
    console.error("[vocabulary:quiz] submit failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
