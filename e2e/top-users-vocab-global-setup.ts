import { ensureTopUsersFixture } from "./top-users-vocab-fixture";

/** GlobalSetup top-users-vocab 3320 (SF-5, VU-42) — seed user vocab-only
 * qa-tu-vocab TRƯỚC webServer (ISR /top-users revalidate=60 — seed sau bind
 * thì render đầu không chứa dữ liệu; pattern vocabulary-dashboard-global-setup). */
export default async function topUsersVocabGlobalSetup(): Promise<void> {
  await ensureTopUsersFixture();
}
