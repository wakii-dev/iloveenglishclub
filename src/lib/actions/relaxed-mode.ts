"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";

/**
 * Relaxed-mode (context pack #6) — write DB DUY NHẤT của SF-4:
 * guest = in-memory (store), user đã login = persist profiles.relaxed_mode.
 * KHÔNG nhận userId từ client — id lấy từ auth() server-side (plan §4).
 * RLS prod: policy cho phép self-edit field này (epic §5.5).
 */
export async function readRelaxedMode(): Promise<boolean | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const [row] = await db
    .select({ relaxedMode: profiles.relaxedMode })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row?.relaxedMode ?? null;
}

export async function updateRelaxedMode(
  value: boolean,
): Promise<{ ok: boolean }> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { ok: false };
    await db
      .update(profiles)
      .set({ relaxedMode: value })
      .where(eq(profiles.id, userId));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
