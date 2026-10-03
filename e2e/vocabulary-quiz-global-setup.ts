import { ensureQuizWordsFixture } from "./vocabulary-quiz-fixture";

/** GlobalSetup quiz flow (SF-4 t-4.4) — seed từ QA + gate bảng (pattern SF-2/3). */
export default async function quizGlobalSetup(): Promise<void> {
  await ensureQuizWordsFixture();
}
