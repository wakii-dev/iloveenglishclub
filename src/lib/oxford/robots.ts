/**
 * robots.txt runtime-guard (VU-32 SF-1): TRƯỚC MỖI RUN crawl — fetch
 * /robots.txt, lấy nhóm `User-agent: *`, Disallow prefix-match trên path.
 * `/definition/english/` xuất hiện trong Disallow → runner TỪ CHỐI chạy
 * (exit rõ ràng — politeness có chủ đích, không phải chỉ khai báo).
 *
 * robots CHỈ là khai báo kỹ thuật — © OUP vẫn áp dụng (runbook: OUP yêu cầu
 * dừng → tắt runner + xoá crawl_entries + prefix blob).
 */

import { DEFAULT_TIMEOUT_MS, HttpError, TimeoutError } from "./fetch";

export class RobotsDeniedError extends Error {
  constructor(path: string) {
    super(
      `robots.txt Disallow ${path} — crawl bị từ chối. Oxford có thể đã đổi chính sách; KHÔNG vòng qua guard.`,
    );
    this.name = "RobotsDeniedError";
  }
}

export type RobotsPolicy = {
  /** Disallow prefixes của nhóm User-agent yêu cầu (luật rỗng = cho phép hết). */
  disallowed: string[];
};

/** Lấy 1 nhóm `User-agent:` (mặc định `*`) — nhóm AI-brand Disallow toàn site, KHÔNG dùng. */
export function parseRobots(text: string, ua: string = "*"): RobotsPolicy {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  const disallowed = new Set<string>();
  let currentAgents: string[] = [];
  let lastFieldWasUA = false;
  let inGroup = false;
  for (const line of lines) {
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (!m) continue;
    const [, field, value] = m;
    if (field.toLowerCase() === "user-agent") {
      // các dòng User-agent LIỀN NHAU (không dòng khác chen giữa) = 1 nhóm;
      // dòng UA đầu của nhóm MỚI → reset danh sách agent
      if (!lastFieldWasUA) currentAgents = [];
      currentAgents.push(value);
      lastFieldWasUA = true;
      inGroup = currentAgents.includes(ua);
      continue;
    }
    lastFieldWasUA = false;
    if (!inGroup) continue;
    if (field.toLowerCase() === "disallow" && value) {
      disallowed.add(value);
    }
  }
  return { disallowed: [...disallowed] };
}

/** Prefix-match Disallow (chuẩn robots: prefix; `Disallow: /abc` chặn /abc*). */
export function isAllowed(policy: RobotsPolicy, path: string): boolean {
  return !policy.disallowed.some((d) => path.startsWith(d));
}

export type RobotsCheckDeps = {
  fetchImpl?: typeof fetch;
  /** Robots text inject trực tiếp (test) — ưu tiên hơn fetch. */
  robotsText?: string;
  /** Cho test — mặc định 15s. */
  timeoutMs?: number;
};

/**
 * Guard cho crawl path: fetch robots.txt thật (hoặc inject) → parse nhóm `*`
 * → Disallow → throw RobotsDeniedError (runner exit 1 với message rõ).
 */
export async function assertCrawlAllowed(
  path: string,
  deps: RobotsCheckDeps = {},
): Promise<void> {
  const doFetch: typeof fetch = deps.fetchImpl ?? fetch;
  let text: string;
  if (deps.robotsText !== undefined) {
    text = deps.robotsText;
  } else {
    // timeout 15s (runner không treo vô hạn) + fail-CLOSED khi !ok (RFC 9309:
    // robots unreachable/5xx → KHÔNG crawl — reviewer nhóm B P1/P2; 5xx
    // retryable để caller withRetry thử lại trước khi exit)
    let res: Response;
    try {
      res = await doFetch("https://www.oxfordlearnersdictionaries.com/robots.txt", {
        signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
        throw new TimeoutError("robots.txt");
      }
      throw err;
    }
    if (!res.ok) throw new HttpError(res.status, "robots.txt");
    text = await res.text();
  }
  const policy = parseRobots(text, "*");
  if (!isAllowed(policy, path)) throw new RobotsDeniedError(path);
}
