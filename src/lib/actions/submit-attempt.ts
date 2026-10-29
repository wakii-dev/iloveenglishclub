"use server";

import { scoreAttempt } from "@/lib/dictation/diff";

/**
 * Submit attempt (SF-6 — spec §4, CHỐT CỨNG trust boundary ở ilec): client
 * CHỈ gửi partId + typed_text + client_attempt_id + used_hint; server
 * recompute toàn bộ bằng pure module (scoreAttempt — giữ nguyên ở v2 qua
 * lib/dictation/diff). mode lấy từ profiles.relaxed_mode — relaxed là XP
 * economy nên KHÔNG tin client.
 *
 * ilec-v2 SF2: CHƯA có DB/attempts/profiles (SF3+). Giữ NGUYÊN validation +
 * error contract của ilec; không có session → trả `unauthorized` (đúng nhánh
 * guest thật của ilec — client chỉ gọi hàm này khi có user nên về thực tế
 * không ai chạm nhánh này ở SF2). SF3 thay seam bằng auth+DB là khôi phục
 * full transaction (SELECT FOR UPDATE → count isFirst → insert idempotent →
 * daily_activity → streak recompute → progress upsert — xem ilec
 * src/lib/actions/submit-attempt.ts làm mẫu).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TYPED_LEN = 2000;

export interface SubmitAttemptResult {
  ok: boolean;
  /** attempt đã tồn tại (client_attempt_id trùng) — KHÔNG cộng gì lần 2. */
  duplicate?: boolean;
  xpAwarded: number;
  totalXp: number;
  streak: number;
  error?: "unauthorized" | "badInput" | "partNotFound" | "noProfile" | "serverError";
}

export async function submitAttempt(input: {
  partId: number;
  typedText: string;
  usedHint: boolean;
  clientAttemptId: string;
}): Promise<SubmitAttemptResult> {
  try {
    const { getCurrentUserId } = await import("@/lib/auth/server");
    const userId = await getCurrentUserId();
    if (!userId) return { ok: false, xpAwarded: 0, totalXp: 0, streak: 0, error: "unauthorized" };

    const { partId, typedText, usedHint, clientAttemptId } = input;
    if (
      !Number.isInteger(partId) ||
      partId <= 0 ||
      typeof typedText !== "string" ||
      typedText.length === 0 ||
      typedText.length > MAX_TYPED_LEN ||
      typeof usedHint !== "boolean" ||
      typeof clientAttemptId !== "string" ||
      !UUID_RE.test(clientAttemptId)
    ) {
      return { ok: false, xpAwarded: 0, totalXp: 0, streak: 0, error: "badInput" };
    }

    // Validation tổng (server-side score recompute vẫn chạy được khi SF3 cần):
    // part lookup + transaction XP/streak là SF3+ (cần DB).
    void scoreAttempt;
    return { ok: false, xpAwarded: 0, totalXp: 0, streak: 0, error: "partNotFound" };
  } catch (error) {
    console.error("[submit-attempt] failed:", error);
    return { ok: false, xpAwarded: 0, totalXp: 0, streak: 0, error: "serverError" };
  }
}
