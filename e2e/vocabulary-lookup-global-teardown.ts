import { cleanupLookupFixture } from "./vocabulary-lookup-fixture";

/** GlobalTeardown word-lookup (SF-5 t-5.3) — xoá từ QA (chỉ row nghĩa QA). */
export default async function lookupGlobalTeardown(): Promise<void> {
  await cleanupLookupFixture();
}
