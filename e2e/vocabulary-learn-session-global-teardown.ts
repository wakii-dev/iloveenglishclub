import { cleanupLearnSessionFixture } from "./vocabulary-learn-session-fixture";

/** GlobalTeardown learn-session (SF-3 VU-40) — self-clean words + book QA. */
export default async function learnSessionGlobalTeardown(): Promise<void> {
  await cleanupLearnSessionFixture();
}
