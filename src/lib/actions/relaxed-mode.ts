"use server";

import { getCurrentUserId } from "@/lib/auth/server";

/**
 * Relaxed-mode (context pack #6) — write DB DUY NHẤT của SF-4 ở ilec:
 * guest = in-memory (store), user đã login = persist profiles.relaxed_mode.
 * ilec-v2 SF2: CHƯA có DB/auth (SF3+) — session seam luôn null ⟹ trả nhánh
 * no-session của ilec (null / {ok:false} + log). Contract giữ nguyên để SF3
 * thay seam bằng auth+DB là chạy đúng.
 */
export async function readRelaxedMode(): Promise<boolean | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  // SF3+: đọc profiles.relaxed_mode từ DB
  return null;
}

export async function updateRelaxedMode(
  value: boolean,
): Promise<{ ok: boolean }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("[relaxed-mode] update rejected: no session");
      return { ok: false };
    }
    // SF3+: UPDATE profiles SET relaxed_mode
    void value;
    return { ok: false };
  } catch (error) {
    // nuốt lỗi là mất dấu vết (review P1-3) — log server-side trước khi trả ok:false
    console.error("[relaxed-mode] update failed:", error);
    return { ok: false };
  }
}
