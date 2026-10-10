import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/admin/vocabulary/image (VU-43 SF-1 task 12) — contract: max 2MB →
 * imageTooLarge; mime allowlist png/jpeg/webp → imageMime (txt/missing cũng
 * imageMime); file chuẩn → {ok, url} playback được; path images/words/
 * {wordId|tmp}-{ts}.{ext}; put qua storage-server (mock — không Blob thật).
 */
const guardsMock = vi.hoisted(() => ({ assertAdmin: vi.fn() }));
vi.mock("@/lib/content/guards", () => {
  class ForbiddenError extends Error {
    constructor(message = "forbidden") {
      super(message);
      this.name = "ForbiddenError";
    }
  }
  return { ForbiddenError, assertAdmin: guardsMock.assertAdmin };
});
const putAudioMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage-server", () => ({ putAudio: putAudioMock }));

const { POST } = await import("./route");
const { ForbiddenError } = await import("@/lib/content/guards");

function req(form: FormData): NextRequest {
  return new NextRequest("http://localhost/api/admin/vocabulary/image", {
    method: "POST",
    body: form,
  });
}

function formWith(opts: {
  name?: string;
  type?: string;
  size?: number | null;
  wordId?: string;
}): FormData {
  const form = new FormData();
  if (opts.size !== null) {
    const bytes = new Uint8Array(opts.size ?? 10);
    form.append("image", new File([bytes], opts.name ?? "img.png", { type: opts.type ?? "image/png" }));
  }
  if (opts.wordId) form.append("wordId", opts.wordId);
  return form;
}

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  putAudioMock.mockReset().mockResolvedValue({
    path: "images/words/x.png",
    url: "https://blob.vercel-storage.com/images/words/x.png",
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/vocabulary/image", () => {
  it("thiếu admin → 401/403, không chạm storage", async () => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError("not-admin"));
    const res = await POST(req(formWith({})));
    expect(res.status).toBe(403);
    expect(putAudioMock).not.toHaveBeenCalled();
  });

  it("mime sai (.txt / missing) → 400 imageMime", async () => {
    const txt = await POST(req(formWith({ type: "text/plain", name: "a.txt" })));
    expect(await txt.json()).toEqual({ ok: false, error: "imageMime" });
    const empty = await POST(req(formWith({ size: null })));
    expect(await empty.json()).toEqual({ ok: false, error: "imageMime" });
    expect(putAudioMock).not.toHaveBeenCalled();
  });

  it(">2MB → 400 imageTooLarge (biên: 2MB đúng + 1 byte → lỗi)", async () => {
    const big = await POST(req(formWith({ type: "image/png", size: 2 * 1024 * 1024 + 1 })));
    expect(await big.json()).toEqual({ ok: false, error: "imageTooLarge" });
    const ok = await POST(req(formWith({ type: "image/png", size: 2 * 1024 * 1024 })));
    expect(ok.status).toBe(200);
  });

  it("file png chuẩn → {ok:true, url}; path images/words/tmp-{ts}.png; jpeg/webp ext map", async () => {
    const res = await POST(req(formWith({ type: "image/png" })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toContain("https://");
    const [path, buffer, contentType] = putAudioMock.mock.calls[0];
    expect(path).toMatch(/^images\/words\/tmp-\d+\.png$/);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(contentType).toBe("image/png");

    await POST(req(formWith({ type: "image/jpeg" })));
    expect(putAudioMock.mock.calls[1]?.[0]).toMatch(/\.jpg$/);
    await POST(req(formWith({ type: "image/webp" })));
    expect(putAudioMock.mock.calls[2]?.[0]).toMatch(/\.webp$/);
  });

  it("wordId cung cấp → path prefix wordId (replace semantics như audio)", async () => {
    await POST(req(formWith({ wordId: "42" })));
    expect(putAudioMock.mock.calls[0]?.[0]).toMatch(/^images\/words\/42-\d+\.png$/);
  });
});
