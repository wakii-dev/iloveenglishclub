import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Helper ghi Blob blob-only (VU-32 SF-1 P0): Oxford audio CHỈ được ghi lên
 * Vercel Blob — helper THROW khi thiếu BLOB_READ_WRITE_TOKEN, KHÔNG fallback
 * public/ (bare putAudio có fallback local → silent local path leak vào prod
 * là lỗi P0 đã học 2026-09-30). File tách khỏi storage-server.ts để vitest
 * + node24 CLI import được (storage-server có `import "server-only"` — không
 * resolve được ngoài Next).
 */

const putMock = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({
  put: putMock,
  del: vi.fn(),
}));

import { putBlobAudio } from "./storage-blob";

afterEach(() => {
  putMock.mockReset();
  vi.unstubAllEnvs();
});

describe("putBlobAudio — blob-only (P0)", () => {
  it("THROW khi thiếu BLOB_READ_WRITE_TOKEN — không put, không ghi local", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    delete process.env.BLOB_READ_WRITE_TOKEN;

    await expect(
      putBlobAudio("audio/oxford/tree.uk.mp3", Buffer.from("x")),
    ).rejects.toThrow(/BLOB_READ_WRITE_TOKEN/);

    expect(putMock).not.toHaveBeenCalled();
  });

  it("có token → put access=public, addRandomSuffix:false, trả URL blob", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
    putMock.mockResolvedValue({
      url: "https://blob.example/audio/oxford/tree.uk.mp3",
      pathname: "audio/oxford/tree.uk.mp3",
    });

    const url = await putBlobAudio(
      "audio/oxford/tree.uk.mp3",
      Buffer.from("mp3"),
      "audio/mpeg",
    );

    expect(url).toBe("https://blob.example/audio/oxford/tree.uk.mp3");
    expect(putMock).toHaveBeenCalledTimes(1);
    const [path, data, opts] = putMock.mock.calls[0];
    expect(path).toBe("audio/oxford/tree.uk.mp3");
    expect(data).toEqual(Buffer.from("mp3"));
    expect(opts).toMatchObject({
      contentType: "audio/mpeg",
      access: "public",
      addRandomSuffix: false,
    });
  });
});
