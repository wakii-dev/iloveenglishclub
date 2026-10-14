import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { updateDailyGoalMinutes } from "@/lib/today/today-store";

export const runtime = "nodejs";

/**
 * PATCH|POST /api/today/goal (daily-journey SF-2, VU-50 — spec §3.3): lưu
 * mục tiêu PHÚT NGHE/ngày cho hero goal kép /today. Body { minutes } nguyên
 * 5..120 (preset 5/15/30 là bề mặt UI SF-3). Taxonomy MIRROR
 * /api/vocabulary/goal: 401 not-authenticated · 400 invalidJson/invalidMinutes
 * · 500 generic. Mục tiêu TỪ giữ nguyên route /api/vocabulary/goal (một field
 * một route — không đụng contract route vocab). PATCH + POST cùng handler.
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

  const minutes = body.minutes;
  if (
    !Number.isInteger(minutes) ||
    (minutes as number) < 5 ||
    (minutes as number) > 120
  ) {
    return NextResponse.json(
      { ok: false, error: "invalidMinutes" },
      { status: 400 },
    );
  }

  try {
    const result = await updateDailyGoalMinutes(userId, minutes as number);
    if (!result.ok || result.dailyGoalMinutes === undefined) {
      return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      dailyGoalMinutes: result.dailyGoalMinutes,
    });
  } catch (error) {
    console.error("[today:goal] update failed:", error);
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}

export const PATCH = saveGoal;
export const POST = saveGoal;
