import { describe, expect, it } from "vitest";
// RED lúc viết: module chưa tồn tại (TDD — test trước)
import { planSync } from "./audio-sync";

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
});
