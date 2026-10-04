import {
  cleanupOxfordFullchainFixture,
  endOxfordFullchainClient,
} from "./oxford-fullchain-fixture";

/**
 * GlobalTeardown SF-4 fullchain — sweep fixture theo prefix `qasf4*` /
 * `qa-sf4-*` (pattern SF-3) rồi ĐÓNG client sạch (end({timeout}) — chống
 * global error "write CONNECTION_ENDED" Neon pooler làm run exit 1 dù tests
 * xanh). Audio static `public/audio/qa-sf4/` là file committed — KHÔNG dọn
 * (fixture chỉ seed đường dẫn tương đối trong DB).
 */
export default async function oxfordFullchainGlobalTeardown(): Promise<void> {
  await cleanupOxfordFullchainFixture();
  await endOxfordFullchainClient();
}
