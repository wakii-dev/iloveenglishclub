"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { assertAdmin } from "@/lib/content/guards";

/**
 * Users management action (SF-5 — spec §6.5): đổi role user⇄admin.
 * "Khóa" user CHƯA làm: schema profiles không có cột banned — REQUIREMENT-GAP
 * đã ghi trên epic VU-15 (boundary: không tự migrate).
 * Chặn đổi role CHÍNH MÌNH (tránh admin tự hạ mình mất /admin).
 */
export type UserActionState = { ok?: boolean; error?: string } | null;

export async function changeUserRoleAction(
  userId: string,
  role: "user" | "admin",
): Promise<UserActionState> {
  await assertAdmin();
  // runtime validate (review P2 — TS-only không chặn crafted payload)
  if (role !== "user" && role !== "admin") return { error: "invalidRole" };
  const session = await auth();
  if (session?.user?.id === userId) {
    return { error: "cannotChangeSelf" };
  }
  await db.update(profiles).set({ role }).where(eq(profiles.id, userId));
  return { ok: true };
}
