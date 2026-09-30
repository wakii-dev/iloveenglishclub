import { cleanupScoringFixture } from "./sf2-db";

/** GlobalTeardown SF-2 — self-clean lesson 99 (QA-1 lesson: content test phải
 *  tự dọn, không để DB riêng của SF dơ chéo run). Guard attempts bên trong. */
export default async function sf2GlobalTeardown(): Promise<void> {
  await cleanupScoringFixture();
}
