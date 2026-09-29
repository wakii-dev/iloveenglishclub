import { auth } from "@/auth";
import { getProfile } from "@/lib/queries";

/**
 * Guard admin dùng chung cho Server Action ghi nội dung (SF-5 gọi lại được).
 * Spec §6: KHÔNG tin middleware/JWT một mình — role re-check ở DB tại thời
 * điểm gọi (JWT role có thể stale do chỉ hydrate lúc sign-in).
 * Contract test bởi scripts/test-rls.test.ts (deny non-admin/anon, allow admin).
 */
export class ForbiddenError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function assertAdmin(): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError("not-authenticated");

  const profile = await getProfile(userId).catch(() => null);
  if (profile?.role !== "admin") throw new ForbiddenError("not-admin");
}
