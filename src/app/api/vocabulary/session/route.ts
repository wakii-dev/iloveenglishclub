import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  applyStep,
  getLearnSession,
  getReviewSession,
} from "@/lib/vocabulary/learn-session-store";
import { isSessionKind, isStepKind } from "@/lib/vocabulary/learn-session";

export const runtime = "nodejs";

/**
 * GET/POST /api/vocabulary/session (vocab-memrise SF-2, VU-39 — epic §5).
 * User từ session (NextAuth — pattern review route, 401 JSON không redirect).
 * Stateless: sessionKey chỉ audit/idempotency, queue re-derive mỗi GET.
 *
 * Taxonomy (pin route.test.ts):
 * - 401 not-authenticated
 * - 400 invalidKind | invalidBook | invalidSession | invalidStep |
 *   invalidResponse | invalidJson (parse — kế thừa review route);
 *   GET ?word= sai số cũng 400 invalidStep (mở rộng hợp lý — không ignore
 *   input bậy)
 * - 404 sessionNotFound (scope hụt + sessionKey chưa có activity) |
 *   wordNotFound (prefill không có progress / word ngoài scope)
 * - success-rỗng = 200 {ok, steps:[]} (không 204)
 * Payload KHÔNG BAO GIỜ chứa đáp án — engine buildSteps contract
 * (learn-session.ts, pin no-leak tests).
 */

/** Số nguyên dương chặt — param/body số học (pattern parseHubFilters). */
function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function err(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json({ ok: false, ...body }, { status });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return err({ error: "not-authenticated" }, 401);

  const params = req.nextUrl.searchParams;
  const kind = params.get("kind");
  if (!isSessionKind(kind)) return err({ error: "invalidKind" }, 400);

  const rawBook = params.get("book");
  if (rawBook !== null && positiveInt(rawBook) === null) {
    return err({ error: "invalidBook" }, 400);
  }
  const bookId = rawBook === null ? undefined : positiveInt(rawBook);
  if (kind === "learn" && bookId === undefined) {
    return err({ error: "invalidBook" }, 400); // learn PHẢI scoped sách
  }
  const rawWord = params.get("word");
  if (rawWord !== null && positiveInt(rawWord) === null) {
    return err({ error: "invalidStep" }, 400); // prefill ?word= phải là số
  }

  try {
    const outcome =
      kind === "learn"
        ? await getLearnSession(userId, bookId as number)
        : await getReviewSession(userId, {
            bookId,
            wordId: rawWord === null ? undefined : positiveInt(rawWord),
          });
    if (!outcome.ok) {
      return err(
        { error: outcome.error },
        outcome.error === "invalidBook" ? 400 : 404,
      );
    }
    return NextResponse.json({
      ok: true,
      sessionKey: outcome.sessionKey,
      kind: outcome.kind,
      bookId: outcome.bookId,
      steps: outcome.steps,
    });
  } catch (error) {
    console.error("[vocabulary:session] get failed:", error);
    return err({ error: "generic" }, 500);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return err({ error: "not-authenticated" }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return err({ error: "invalidJson" }, 400);
  }

  const sessionKey = body.sessionKey;
  if (
    typeof sessionKey !== "string" ||
    sessionKey === "" ||
    sessionKey.length > 200
  ) {
    return err({ error: "invalidSession" }, 400);
  }
  if (!isSessionKind(body.kind)) return err({ error: "invalidKind" }, 400);
  const bookId = positiveInt(body.bookId);
  if (bookId === null) return err({ error: "invalidBook" }, 400);
  const wordId = positiveInt(body.wordId);
  if (wordId === null) return err({ error: "invalidStep" }, 400);
  const stepIndex = Number(body.stepIndex);
  if (!Number.isInteger(stepIndex) || stepIndex < 0) {
    return err({ error: "invalidStep" }, 400);
  }
  const attemptNo = Number(body.attemptNo);
  if (!Number.isInteger(attemptNo) || attemptNo < 1) {
    return err({ error: "invalidStep" }, 400);
  }
  if (!isStepKind(body.stepKind) || body.stepKind === "introduce") {
    return err({ error: "invalidStep" }, 400); // introduce không chấm được
  }
  const response = body.response;
  if (
    typeof response !== "string" ||
    response.trim() === "" ||
    response.length > 500
  ) {
    return err({ error: "invalidResponse" }, 400);
  }

  try {
    const outcome = await applyStep(userId, {
      sessionKey,
      kind: body.kind,
      bookId,
      wordId,
      stepIndex,
      attemptNo,
      stepKind: body.stepKind,
      response,
    });
    if (!outcome.ok) return err({ error: outcome.error }, 404);
    // Response FLAT theo spec §5 — {ok, correct, grade, xpAwarded, xpCapped,
    // totalXp, streak, goalDone} (không bọc object con)
    return NextResponse.json({ ok: true, ...outcome.result });
  } catch (error) {
    console.error("[vocabulary:session] apply failed:", error);
    return err({ error: "generic" }, 500);
  }
}
