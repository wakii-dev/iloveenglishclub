import { describe, expect, it } from "vitest";
// RED lúc viết: module chưa tồn tại (TDD — test trước)
import { AUDIO_SYNC_EXCLUDED_PREFIXES, planSync } from "./audio-sync";

const listed = (pathname: string, size: number) => ({ pathname, size });

describe("planSync — chọn file cần tải từ Blob về public/audio", () => {
  it("file thiếu ở local → toDownload; đủ + cùng size → unchanged", () => {
    const plan = planSync(
      [listed("audio/b/u/l/01.mp3", 100), listed("audio/b/u/l/02.mp3", 200)],
      { "audio/b/u/l/01.mp3": 100 },
    );
    expect(plan.toDownload).toEqual([listed("audio/b/u/l/02.mp3", 200)]);
    expect(plan.unchanged).toBe(1);
  });

  it("file có ở local nhưng KHÁC size (đã replace trên Blob) → toDownload", () => {
    const plan = planSync([listed("audio/b/u/l/01.mp3", 300)], {
      "audio/b/u/l/01.mp3": 100,
    });
    expect(plan.toDownload).toEqual([listed("audio/b/u/l/01.mp3", 300)]);
    expect(plan.unchanged).toBe(0);
  });

  it("bỏ qua pathname ngoài prefix audio/ (store có thể chứa thứ khác)", () => {
    const plan = planSync(
      [listed("audio/b/u/l/01.mp3", 100), listed("tmp/scratch.txt", 5)],
      {},
    );
    expect(plan.toDownload).toEqual([listed("audio/b/u/l/01.mp3", 100)]);
  });

  it("local thừa file (không có trên Blob) → bỏ qua, KHÔNG xoá", () => {
    const plan = planSync([listed("audio/b/u/l/01.mp3", 100)], {
      "audio/b/u/l/01.mp3": 100,
      "audio/b/u/l/99-local-only.mp3": 42,
    });
    expect(plan.toDownload).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("listed rỗng → plan rỗng (store trống / token store khác)", () => {
    expect(planSync([], {})).toEqual({ toDownload: [], unchanged: 0 });
  });

  it("size 0 trên store (rác) → coi là unchanged nếu local cũng 0", () => {
    const plan = planSync([listed("audio/b/u/l/01.mp3", 0)], {
      "audio/b/u/l/01.mp3": 0,
    });
    expect(plan.unchanged).toBe(1);
    expect(plan.toDownload).toEqual([]);
  });

  // VU-32 SF-1: dictionary archive Oxford (audio/oxford/ — ~128k mp3) KHÔNG
  // mirror git — audio-sync phải loại prefix này khỏi plan (acceptance 4).
  it("prefix audio/oxford/ bị EXCLUDE — không toDownload, không unchanged", () => {
    const plan = planSync(
      [
        listed("audio/oxford/tree.uk.mp3", 12345),
        listed("audio/oxford/tree.us.mp3", 12345),
        listed("audio/b/u/l/01.mp3", 100),
      ],
      { "audio/oxford/tree.uk.mp3": 12345 }, // local cũng có (hi hữu) → vẫn loại
    );
    expect(plan.toDownload).toEqual([listed("audio/b/u/l/01.mp3", 100)]);
    expect(plan.unchanged).toBe(0);
  });

  it("prefix audio/oxford-tự-chi-định/ KHÔNG bị loại (chỉ prefix có / cuối)", () => {
    const plan = planSync([listed("audio/oxford-tmp/x.mp3", 7)], {});
    expect(plan.toDownload).toEqual([listed("audio/oxford-tmp/x.mp3", 7)]);
  });

  it("AUDIO_SYNC_EXCLUDED_PREFIXES chứa audio/oxford/", () => {
    expect(AUDIO_SYNC_EXCLUDED_PREFIXES).toContain("audio/oxford/");
  });
});
