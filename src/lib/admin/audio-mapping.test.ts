import { describe, expect, it } from "vitest";
import {
  MAX_AUDIO_BYTES,
  mimeToAudioExt,
  numericFileSort,
  parseFileNameIndex,
  persistedAudioPath,
} from "./audio-mapping";

describe("parseFileNameIndex", () => {
  it("số đầu có/không zero-pad", () => {
    expect(parseFileNameIndex("01.mp3")).toBe(1);
    expect(parseFileNameIndex("1.mp3")).toBe(1);
    expect(parseFileNameIndex("10.mp3")).toBe(10);
    expect(parseFileNameIndex("005 - intro.mp3")).toBe(5);
  });

  it("không có số đầu / số 0 / số âm → null", () => {
    expect(parseFileNameIndex("intro.mp3")).toBeNull();
    expect(parseFileNameIndex("lesson-03.mp3")).toBeNull(); // số không ở đầu
    expect(parseFileNameIndex("0.mp3")).toBeNull(); // không có part 0
    expect(parseFileNameIndex("audio.mp4")).toBeNull();
  });

  it("tên có khoảng trắng đầu", () => {
    expect(parseFileNameIndex("  3 ghi chú.mp3")).toBe(3);
  });
});

describe("numericFileSort", () => {
  it("sort NUMERIC — 10 sau 2 (lexicographic sẽ sai)", () => {
    const files = [
      { name: "10.mp3", index: 10, file: "f10" },
      { name: "2.mp3", index: 2, file: "f2" },
      { name: "1.mp3", index: 1, file: "f1" },
    ];
    expect(numericFileSort(files).map((f) => f.index)).toEqual([1, 2, 10]);
  });

  it("stable: file trùng số giữ thứ tự input", () => {
    const files = [
      { name: "1-a.mp3", index: 1, file: "a" },
      { name: "01-b.mp3", index: 1, file: "b" },
      { name: "2.mp3", index: 2, file: "c" },
    ];
    expect(numericFileSort(files).map((f) => f.name)).toEqual([
      "1-a.mp3",
      "01-b.mp3",
      "2.mp3",
    ]);
  });

  it("file không có số → cuối danh sách, giữ tương đối", () => {
    const files = [
      { name: "zzz.mp3", index: null, file: "z" },
      { name: "1.mp3", index: 1, file: "a" },
      { name: "aaa.mp3", index: null, file: "y" },
    ];
    expect(numericFileSort(files).map((f) => f.name)).toEqual([
      "1.mp3",
      "zzz.mp3",
      "aaa.mp3",
    ]);
  });
});

describe("mimeToAudioExt", () => {
  it("map mime quen thuộc", () => {
    expect(mimeToAudioExt("audio/mpeg")).toBe("mp3");
    expect(mimeToAudioExt("audio/mp3")).toBe("mp3");
    expect(mimeToAudioExt("audio/wav")).toBe("wav");
    expect(mimeToAudioExt("audio/x-wav")).toBe("wav");
    expect(mimeToAudioExt("audio/mp4")).toBe("m4a");
    expect(mimeToAudioExt("audio/ogg")).toBe("ogg");
    expect(mimeToAudioExt("AUDIO/WEBM")).toBe("webm"); // case-insensitive
  });

  it("mime lạ / không phải audio → null (per-file error ở route)", () => {
    expect(mimeToAudioExt("audio/unknown-codec")).toBeNull();
    expect(mimeToAudioExt("text/plain")).toBeNull();
    expect(mimeToAudioExt("image/png")).toBeNull();
    expect(mimeToAudioExt("")).toBeNull();
  });
});

describe("MAX_AUDIO_BYTES", () => {
  it("cap 4MB đúng (Vercel serverless ~4.5MB body limit)", () => {
    expect(MAX_AUDIO_BYTES).toBe(4 * 1024 * 1024);
  });
});

describe("persistedAudioPath — giá trị lưu DB audioPath theo driver", () => {
  const put = {
    path: "audio/level-3/unit-1/lesson-3/02.mp3",
    url: "https://abc.public.blob.vercel-storage.com/audio/level-3/unit-1/lesson-3/02.mp3",
  };

  it("blob driver: URL CDN đầy đủ (resolveAudioUrl pass-through, storage.test §blob)", () => {
    expect(persistedAudioPath("blob", put)).toBe(put.url);
  });

  it("local driver: path tương đối (playback resolve / + path)", () => {
    expect(persistedAudioPath("local", put)).toBe(put.path);
  });
});
