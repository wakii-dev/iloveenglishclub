import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { buildHubQuiz, submitQuizAttempt } from "@/lib/vocabulary/quiz-store";
import {
  QUIZ_MODE_DEFAULT,
  QUIZ_MODES,
  QUIZ_TYPES,
  parseQuizScope,
  type QuizScope,
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
 * GET /api/vocabulary/quiz (SF-4 t-4.1; scope hub SF-3 t-3.2) — sinh đề theo
 * phạm vi: ?book_id=N (tương thích cũ) | ?scope=all | ?scope=multi&book_ids=
 * 1,2,3 | ?scope=book&book_id=N. Public (nội dung public như trang
 * vocabulary); đề xáo ngẫu nhiên mỗi lần gọi và KHÔNG kèm đáp án (chấm ở POST
 * soi pool phía server). Response book scope vẫn kèm bookId (tương thích old
 * client), scope khác kèm đúng scope đã parse.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const scopeParam = sp.get("scope");

  let scope: QuizScope;
  if (scopeParam === null || scopeParam === "") {
    // contract cũ: ?book_id=N
    const bookId = Number(sp.get("book_id"));
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ ok: false, error: "invalidBookId" }, { status: 400 });
    }
    scope = { kind: "book", bookId };
  } else {
    const parsed = parseQuizScope({
      scope: scopeParam,
      bookId: sp.get("book_id"),
      bookIds: sp.get("book_ids"),
    });
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    scope = parsed.scope;
  }

  const questions = await buildHubQuiz(scope);
  return NextResponse.json({
    ok: true,
    ...(scope.kind === "book"
      ? { bookId: scope.bookId }
      : {
          scope:
            scope.kind === "all"
              ? { kind: "all" }
              : { kind: "multi", bookIds: scope.bookIds },
        }),
    mode: QUIZ_MODE_DEFAULT,
    questions,
  });
}

/**
 * POST /api/vocabulary/quiz (SF-4 t-4.1; scope hub SF-3 t-3.2) — nộp bài:
 * chấm qua engine + lưu quiz_attempts. User từ session (NextAuth) — 401 JSON
 * khi chưa đăng nhập (pattern /api/vocabulary/review). mode tùy chọn, mặc
 * định "mixed". Phạm vi: body.book_id=N (cũ) | body.scope="all" |
 * body.scope="multi" + body.book_ids=[...] | body.scope="book" + book_id.
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

  const scopeRaw = body.scope;
  let scope: QuizScope;
  if (scopeRaw === undefined || scopeRaw === null || scopeRaw === "") {
    // contract cũ: book_id bắt buộc
    const bookId = Number(body.book_id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return NextResponse.json({ ok: false, error: "invalidBookId" }, { status: 400 });
    }
    scope = { kind: "book", bookId };
  } else {
    if (typeof scopeRaw !== "string") {
      return NextResponse.json({ ok: false, error: "invalidScope" }, { status: 400 });
    }
    const parsed = parseQuizScope({
      scope: scopeRaw,
      bookId: body.book_id,
      bookIds: body.book_ids,
    });
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    scope = parsed.scope;
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
    const result = await submitQuizAttempt(userId, scope, mode, answers);
    if (!result.ok) {
      const status =
        result.error === "bookNotFound" || result.error === "poolNotFound"
          ? 404
          : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
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
