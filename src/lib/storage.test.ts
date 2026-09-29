import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAudioPath, resolveAudioUrl, storageDriver } from "./storage";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildAudioPath — layout spec §3", () => {
  it("audio/{book}/{unit}/{lesson}/{NN}.mp3 với NN zero-pad 2 chữ số", () => {
    expect(
      buildAudioPath({ book: "prepare-1", unit: "u01", lesson: "l001", index: 7 }),
    ).toBe("audio/prepare-1/u01/l001/07.mp3");
  });

  it("index ≥ 10 giữ nguyên (zero-pad 2 không cắt)", () => {
    expect(
      buildAudioPath({ book: "prepare-2", unit: "u12", lesson: "l034", index: 21 }),
    ).toBe("audio/prepare-2/u12/l034/21.mp3");
  });

  it("index 0 → 00", () => {
    expect(
      buildAudioPath({ book: "b", unit: "u", lesson: "l", index: 0 }),
    ).toBe("audio/b/u/l/00.mp3");
  });
});

describe("storageDriver — chọn theo env", () => {
  it("thiếu BLOB_READ_WRITE_TOKEN → local (public/uploads, dev)", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect(storageDriver()).toBe("local");
  });

  it("có BLOB_READ_WRITE_TOKEN → blob (Vercel Blob, prod)", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test.token");
    expect(storageDriver()).toBe("blob");
  });
});

describe("resolveAudioUrl", () => {
  it("local driver: / + path (Next dev serve public/)", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect(resolveAudioUrl("audio/b/u/l/01.mp3")).toBe("/audio/b/u/l/01.mp3");
  });

  it("blob driver: path nguyên trạng (đã là URL CDN từ putAudio)", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test.token");
    expect(resolveAudioUrl("https://blob.vercel-storage.com/audio/b.mp3")).toBe(
      "https://blob.vercel-storage.com/audio/b.mp3",
    );
  });
});
