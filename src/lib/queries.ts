import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";

/** Đọc profile theo user id — dùng bởi auth callbacks + admin layout gate. */
export async function getProfile(id: string) {
  const [row] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  return row ?? null;
}
