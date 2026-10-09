import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { updateDailyGoal } from "@/lib/vocabulary/dashboard-store";

export const runtime = "nodejs";

/**
 * PATCH|POST /api/vocabulary/goal (vocab-memrise SF-4, VU-41 — context pack
 * mục 4/8): lưu mục tiêu từ mới/ngày cho goal ring. Body { goal } nguyên
 * 1..100 — chốt "free 1..100"; presets 5/10/20 là bề mặt UI (popover). Trả
 * { ok, dailyGoalWords }; taxonomy hiện có: 401 not-authenticated · 400
 * invalidJson/invalidGoal · 500 generic. PATCH + POST cùng handler (PATCH từ
 * popover; POST dự phòng form action).
 */
async function saveGoal(req: NextRequest) {
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

  const goal = body.goal;
  if (
    !Number.isInteger(goal) ||
    (goal as number) < 1 ||
    (goal as number) > 100
  ) {
    return NextResponse.json({ ok: false, error: "invalidGoal" }, { status: 400 });
  }

  try {
    const result = await updateDailyGoal(userId, goal as number);
    if (!result.ok || result.dailyGoalWords === undefined) {
      return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, dailyGoalWords: result.dailyGoalWords });
  } catch (error) {
    console.error("[vocabulary:goal] update failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}

export const PATCH = saveGoal;
export const POST = saveGoal;
