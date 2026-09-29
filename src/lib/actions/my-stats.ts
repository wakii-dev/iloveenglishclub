"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";

/**
 * Đọc XP + streak cache cho header (context pack #8 — "XP header live từ
 * profiles"). Cache values — cập nhật bởi submit-attempt; client nghe event
 * `ilec:stats-updated` (events.ts) để re-fetch sau mỗi submit.
 */
export async function readMyStats(): Promise<{
  xp: number;
  streak: number;
} | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const [row] = await db
    .select({ xp: profiles.xp, streakCount: profiles.streakCount })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row ? { xp: row.xp, streak: row.streakCount } : null;
}
