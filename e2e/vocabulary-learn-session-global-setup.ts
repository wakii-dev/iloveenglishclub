import { ensureLearnSessionFixture } from "./vocabulary-learn-session-fixture";

/**
 * GlobalSetup learn-session (SF-3 VU-40) — seed book+từ QA (pattern 3315)
 * + WARM-UP route/page: dev-server compile lạnh lần đầu chạm module (bài học
 * SF-6: action compile 60-115s) làm expect 5s chết trước khi POST kịp trả —
 * bấm 1 GET 401 vào /api/vocabulary/session + 1 GET trang learn (redirect
 * login) để Next compile xong trước khi spec chạy.
 */
export default async function learnSessionGlobalSetup(): Promise<void> {
  await ensureLearnSessionFixture();
  const port = process.env.E2E_PORT ?? 3317;
  const base = `http://localhost:${port}`;
  await fetch(`${base}/api/vocabulary/session?kind=learn&book=9904`).catch(
    () => undefined, // 401/mất mạng đều được — đích là compile module
  );
  await fetch(`${base}/en/vocabulary/learn/9904`).catch(() => undefined);
}
