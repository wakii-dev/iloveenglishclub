import { describe, expect, it, vi } from "vitest";
import { downloadMp3, isAllowedAudioUrl, oxfordAudioPath, syncEntryAudio } from "./audio";

const MP3_URL = "https://www.oxfordlearnersdictionaries.com/media/english/uk_pron/t/tre/tree_/tree__gb_2.mp3";

describe("oxfordAudioPath — prefix ép cứng audio/oxford/", () => {
  it("đúng shape {slug}.{uk|us}.mp3", () => {
    expect(oxfordAudioPath("tree", "uk")).toBe("audio/oxford/tree.uk.mp3");
    expect(oxfordAudioPath("three-d_2", "us")).toBe("audio/oxford/three-d_2.us.mp3");
  });
  it("slug chứa / hoặc \\ → throw (không thoát prefix)", () => {
    expect(() => oxfordAudioPath("../evil", "uk")).toThrow(/slug/);
    expect(() => oxfordAudioPath("a/b", "uk")).toThrow(/slug/);
  });
});

describe("isAllowedAudioUrl", () => {
  it("host Oxford (+subdomain) OK; host khác / URL rác → false", () => {
    expect(isAllowedAudioUrl(MP3_URL)).toBe(true);
    expect(
      isAllowedAudioUrl("https://media.oxfordlearnersdictionaries.com/x.mp3"),
    ).toBe(true);
    expect(isAllowedAudioUrl("https://evil.example.com/x.mp3")).toBe(false);
    expect(isAllowedAudioUrl("not-a-url")).toBe(false);
  });
});

describe("downloadMp3 — inject fetch", () => {
  it("200 mp3 → Buffer; host ngoài allowlist → throw trước khi fetch", async () => {
    const buf = await downloadMp3(MP3_URL, {
      fetchImpl: (async () =>
        new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as typeof fetch,
    });
    expect(buf).toEqual(Buffer.from([1, 2, 3]));

    await expect(
      downloadMp3("https://evil.example.com/x.mp3", {
        fetchImpl: (async () => new Response("", { status: 200 })) as typeof fetch,
      }),
    ).rejects.toThrow(/allowlist/);
  });

  it("HTTP 404 → throw (caller markFailed); size vượt cap → throw", async () => {
    await expect(
      downloadMp3(MP3_URL, {
        fetchImpl: (async () => new Response("", { status: 404 })) as typeof fetch,
      }),
    ).rejects.toThrow(/404/);
    await expect(
      downloadMp3(MP3_URL, {
        maxBytes: 1,
        fetchImpl: (async () => new Response(new Uint8Array(10), { status: 200 })) as typeof fetch,
      }),
    ).rejects.toThrow(/size/i);
  });

  // Review B P2 (VU-36): fetch mặc định redirect:"follow" — host CUỐI (res.url
  // sau redirect) phải re-check allowlist như fetch.ts:129 — redirect ra host
  // lạ → throw, KHÔNG trả buffer. (Response constructor không nhận url — mock
  // plain object y shape downloadMp3 đọc: ok/status/url/arrayBuffer.)
  it("redirect ra host ngoài allowlist (res.url lạ) → throw sau fetch", async () => {
    const evilRes = {
      ok: true,
      status: 200,
      url: "https://evil.example.com/redirected.mp3",
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
    await expect(
      downloadMp3(MP3_URL, {
        fetchImpl: (async () => evilRes as unknown as Response) as typeof fetch,
      }),
    ).rejects.toThrow(/allowlist/);
  });
});

describe("syncEntryAudio — resumable qua blob hiện có, throw propagation", () => {
  const base = {
    id: 1,
    slug: "tree",
    audioUkUrl: MP3_URL,
    audioUsUrl: "https://www.oxfordlearnersdictionaries.com/media/english/us_pron/y.mp3",
    audioUkBlob: null,
    audioUsBlob: null,
  };

  function makeDeps(putImpl = async (path: string) => `https://blob.example/${path}`) {
    const put = vi.fn(putImpl);
    const save = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = (async () =>
      new Response(new Uint8Array([9]), { status: 200 })) as typeof fetch;
    return { deps: { put, save, fetchImpl } as const, put, save };
  }

  it("tải đủ uk+us → put đúng path audio/oxford/{slug}.{v}.mp3 → save 2 lần", async () => {
    const { deps, put, save } = makeDeps();
    const res = await syncEntryAudio(base, deps);
    expect(res).toEqual({ uploaded: 2, skipped: 0 });
    expect(put.mock.calls.map((c) => c[0])).toEqual([
      "audio/oxford/tree.uk.mp3",
      "audio/oxford/tree.us.mp3",
    ]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0]).toEqual([1, "uk", "https://blob.example/audio/oxford/tree.uk.mp3"]);
  });

  it("variant đã có blob → skip (resumable); URL null → skip (US-only bình thường)", async () => {
    const { deps, put, save } = makeDeps();
    const res = await syncEntryAudio(
      { ...base, audioUkBlob: "https://blob.example/audio/oxford/tree.uk.mp3", audioUsUrl: null },
      deps,
    );
    expect(res).toEqual({ uploaded: 0, skipped: 2 });
    expect(put).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("put throw (thiếu BLOB token — helper blob-only) → KHÔNG nuốt, save không được gọi", async () => {
    const { deps, save } = makeDeps(async () => {
      throw new Error("putBlobAudio: BLOB_READ_WRITE_TOKEN thiếu");
    });
    await expect(syncEntryAudio(base, deps)).rejects.toThrow(/BLOB_READ_WRITE_TOKEN/);
    expect(save).not.toHaveBeenCalled();
  });

  it("put fail ở variant uk → us KHÔNG chạy tiếp (lỗi dừng entry, runner retry-failed)", async () => {
    const { deps, put, save } = makeDeps(async (path) => {
      if (path.endsWith("uk.mp3")) throw new Error("network down");
      return `https://blob.example/${path}`;
    });
    await expect(syncEntryAudio(base, deps)).rejects.toThrow(/network down/);
    expect(save).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledTimes(1);
  });
});
