import { cleanupQuizFixture } from "./vocabulary-quiz-fixture";

/** GlobalTeardown quiz flow (SF-4 t-4.4) — xoá điểm quiz + từ QA. */
export default async function quizGlobalTeardown(): Promise<void> {
  await cleanupQuizFixture();
}
