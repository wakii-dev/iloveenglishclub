/**
 * Client fetch helper crawl UI (VU-32 SF-3) — dùng chung crawl-dashboard/
 * crawl-enrich-panel/crawl-add-dialog (callApi nội bộ vocabulary-manager không
 * export — KHÔNG refactor file đó, không drive-by). "use client" không cần:
 * module thuần, chỉ import từ client component.
 */

/** Shape GET /api/admin/vocabulary/crawl/stats — PIN spec §[api] (SF-2). */
export type CrawlStats = {
  counts: {
    pending: number;
    parsed: number;
    failed: number;
    failedMaxAttempts: number;
  };
  samples: { slug: string; lastError: string | null }[];
  lastRun: string | null;
};

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function callApi<T extends Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("generic");
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.ok === false) {
    throw new ApiError(typeof body.error === "string" ? body.error : "generic");
  }
  return body as T;
}

/** JSON body helper — POST/PATCH dùng chung headers. */
export function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
