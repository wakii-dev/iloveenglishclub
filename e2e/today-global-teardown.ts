import { cleanupTodayFixture } from "./today-fixture";

/** GlobalTeardown /today 3321 — xoá users + words qa-today-% (cascade). */
export default async function todayGlobalTeardown(): Promise<void> {
  await cleanupTodayFixture();
}
