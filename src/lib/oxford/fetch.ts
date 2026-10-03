/**
 * fetchEntry — tải 1 entry Oxford (VU-32 SF-1) — PURE: fetch impl INJECT
 * (unit test offline; chỉ CLI chạy mạng thật).
 *
 * - UA riêng định danh `ILEC-VocabBot/1.0 (educational; +site)` — KHÔNG UA
 *   thương hiệu AI (nhóm anthropic-ai/CCBot/GPTBot bị Disallow toàn site
 *   theo robots.txt của Oxford).
 * - redirect follow (fetch default) → finalSlug từ URL CUỐI (tree_1 → tree =
 *   1 row 'tree' dưới slug cuối — runner upsert dưới finalSlug).
 * - 404 → null (entry không tồn tại — status failed bên runner).
 * - timeout 15s (AbortSignal), size cap 2MB (đọc stream, vượt → throw).
 * - host allowlist: suffix `.oxfordlearnersdictionaries.com` kiểm trên URL
 *   CUỐI (redirect ra ngoài → throw — chống SSRF qua redirect).
 * - HttpError{status}.retryable: 429/5xx true; 4xx khác false. Timeout +
 *   lỗi mạng → TimeoutError/NetworkError retryable (withRetry ở rate-limit).
 */

export const ENTRY_HOST_SUFFIX = ".oxfordlearnersdictionaries.com";
export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // entry ~98KB — cap 2MB

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} — ${url}`);
    this.name = "HttpError";
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export class TimeoutError extends Error {
  constructor(url: string) {
    super(`timeout — ${url}`);
    this.name = "TimeoutError";
  }
  get retryable(): boolean {
    return true;
  }
}

export class NetworkError extends Error {
  constructor(
    cause: unknown,
    url: string,
  ) {
    super(`network — ${url}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "NetworkError";
  }
  get retryable(): boolean {
    return true;
  }
}

export class SizeCapError extends Error {
  constructor(
    public readonly maxBytes: number,
    url: string,
  ) {
    super(`size > ${maxBytes}B — ${url}`);
    this.name = "SizeCapError";
  }
  get retryable(): boolean {
    return false;
  }
}

export class HostNotAllowedError extends Error {
  constructor(hostname: string, url: string) {
    super(`host không thuộc allowlist (${hostname}) — ${url}`);
    this.name = "HostNotAllowedError";
  }
  get retryable(): boolean {
    return false;
  }
}

export type FetchEntryResult = { html: string; finalSlug: string };

export type FetchDeps = {
  fetchImpl?: typeof fetch;
  /** Cho test — default env NEXT_PUBLIC_SITE_URL hoặc placeholder. */
  siteUrl?: string;
  timeoutMs?: number;
  maxBytes?: number;
};

export function crawlUserAgent(siteUrl?: string): string {
  return `ILEC-VocabBot/1.0 (educational; +${siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://ilec.example"})`;
}

function isAllowedHost(hostname: string): boolean {
  return (
    hostname === ENTRY_HOST_SUFFIX.slice(1) || hostname.endsWith(ENTRY_HOST_SUFFIX)
  );
}

/** Slug từ path URL cuối (decode — 'three-d_2', 'tree'). */
export function slugFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export async function fetchEntry(
  slug: string,
  deps: FetchDeps = {},
): Promise<FetchEntryResult | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
  const url = `https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(slug)}`;

  let res: Response;
  try {
    res = await doFetch(url, {
      headers: { "user-agent": crawlUserAgent(deps.siteUrl) },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") throw new TimeoutError(url);
    if (err instanceof Error && err.name === "AbortError") throw new TimeoutError(url);
    throw new NetworkError(err, url);
  }

  // Host allowlist kiểm trên URL CUỐI (res.url — sau mọi redirect)
  const finalHostname = new URL(res.url).hostname;
  if (!isAllowedHost(finalHostname)) {
    throw new HostNotAllowedError(finalHostname, res.url);
  }

  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(res.status, res.url);

  // Đọc stream với size cap — lỗi giữa chừng (undici "terminated", abort trễ)
  // phải bọc NetworkError retryable (reviewer nhóm B P1: read-loop ngoài try
  // → withRetry bỏ qua + reader leak)
  let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
  try {
    reader = res.body?.getReader();
    if (!reader) throw new NetworkError(new Error("no body"), res.url);
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new SizeCapError(maxBytes, res.url);
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString("utf8");
    return { html, finalSlug: slugFromUrl(res.url) };
  } catch (err) {
    if (err instanceof SizeCapError) throw err; // có chủ đích — không re-wrap
    await reader?.cancel().catch(() => {});
    if (err instanceof NetworkError) throw err;
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new TimeoutError(res.url);
    }
    throw new NetworkError(err, res.url);
  }
}
