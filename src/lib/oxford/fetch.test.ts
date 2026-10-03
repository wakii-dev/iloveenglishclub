import { describe, expect, it } from "vitest";
import {
  fetchEntry,
  HttpError,
  HostNotAllowedError,
  SizeCapError,
  slugFromUrl,
  TimeoutError,
} from "./fetch";

const OK_URL = "https://www.oxfordlearnersdictionaries.com/definition/english/tree";

/** Fake Response đủ dùng cho fetchEntry. */
function fakeResponse(opts: {
  body?: string | null;
  status?: number;
  url?: string;
}): Response {
  const body = opts.body ?? "<html>ok</html>";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return {
    ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
    status: opts.status ?? 200,
    url: opts.url ?? OK_URL,
    body: stream,
  } as unknown as Response;
}

describe("fetchEntry — pure (inject fetchImpl)", () => {
  it("200 → html + finalSlug; UA riêng ILEC-VocabBot (KHÔNG UA thương hiệu AI)", async () => {
    let seenHeaders: HeadersInit | undefined;
    const res = await fetchEntry("tree", {
      siteUrl: "https://ilec.example",
      fetchImpl: async (_url, init) => {
        seenHeaders = init?.headers;
        return fakeResponse({ body: "<h1 class='headword'>tree</h1>" });
      },
    });
    expect(res).toEqual({
      html: "<h1 class='headword'>tree</h1>",
      finalSlug: "tree",
    });
    const ua = new Headers(seenHeaders).get("user-agent") ?? "";
    expect(ua).toMatch(/^ILEC-VocabBot\/1\.0 \(educational; \+https:\/\/ilec\.example\)$/);
    expect(ua.toLowerCase()).not.toMatch(/anthropic|ccbot|gpt|claude/);
  });

  it("redirect tree_1 → tree: finalSlug từ URL CUỐI (decode)", async () => {
    const res = await fetchEntry("tree_1", {
      fetchImpl: async () =>
        fakeResponse({
          url: "https://www.oxfordlearnersdictionaries.com/definition/english/tree",
        }),
    });
    expect(res!.finalSlug).toBe("tree");
  });

  it("404 → null (không throw)", async () => {
    const res = await fetchEntry("a-piece-of-cake", {
      fetchImpl: async () => fakeResponse({ status: 404 }),
    });
    expect(res).toBeNull();
  });

  it("429/500 → HttpError retryable; 403 → không retryable", async () => {
    const err429 = await fetchEntry("tree", {
      fetchImpl: async () => fakeResponse({ status: 429 }),
    }).catch((e) => e);
    expect(err429).toBeInstanceOf(HttpError);
    expect(err429.retryable).toBe(true);

    const err500 = await fetchEntry("tree", {
      fetchImpl: async () => fakeResponse({ status: 500 }),
    }).catch((e) => e);
    expect(err500.retryable).toBe(true);

    const err403 = await fetchEntry("tree", {
      fetchImpl: async () => fakeResponse({ status: 403 }),
    }).catch((e) => e);
    expect(err403.retryable).toBe(false);
  });

  it("timeout → TimeoutError retryable (signal abort được đưa vào fetch)", async () => {
    const err = await fetchEntry("tree", {
      timeoutMs: 20,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err.retryable).toBe(true);
  });

  it("size vượt cap → SizeCapError, stream bị cancel", async () => {
    const big = "x".repeat(100);
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (cancelled) return;
        controller.enqueue(new TextEncoder().encode(big));
      },
      cancel() {
        cancelled = true;
      },
    });
    const err = await fetchEntry("tree", {
      maxBytes: 50,
      fetchImpl: async () => ({ ok: true, status: 200, url: OK_URL, body: stream }) as unknown as Response,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SizeCapError);
    expect(cancelled).toBe(true);
  });

  it("redirect ra host ngoài allowlist → HostNotAllowedError (SSRF qua redirect)", async () => {
    const err = await fetchEntry("tree", {
      fetchImpl: async () =>
        fakeResponse({ url: "https://evil.example.com/definition/english/tree" }),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(HostNotAllowedError);
  });

  // Reviewer nhóm B P1: lỗi giữa stream phải NetworkError RETRYABLE (không raw)
  it("stream đứt giữa chừng → NetworkError retryable", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<html>par"));
        // lỗi sau chunk đầu — mô phỏng undici "terminated"
        controller.error(new TypeError("terminated"));
      },
    });
    const err = await fetchEntry("tree", {
      fetchImpl: async () =>
        ({ ok: true, status: 200, url: OK_URL, body: stream }) as unknown as Response,
    }).catch((e) => e);
    expect(err.name).toBe("NetworkError");
    expect(err.retryable).toBe(true);
    // cancel() trên stream đã errored là no-op theo spec ReadableStream —
    // đừng assert callback cancel (đã bọc try/catch để không nuốt lỗi thật)
  });
});

describe("slugFromUrl", () => {
  it("lấy segment cuối, decode", () => {
    expect(slugFromUrl("https://www.oxfordlearnersdictionaries.com/definition/english/three-d_2")).toBe("three-d_2");
    expect(slugFromUrl("https://www.oxfordlearnersdictionaries.com/definition/english/a1%20level")).toBe("a1 level");
  });
});
