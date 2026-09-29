import { afterEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: factory của vi.mock được hoist lên đầu file — biến phải hoist theo
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag }));

import { CONTENT_TAG, revalidateContent } from "./revalidate";

describe("revalidateContent — wire tag 'content' từ đầu (spec §3)", () => {
  afterEach(() => {
    revalidateTag.mockClear();
  });

  it("gọi revalidateTag('content') — SF-5 publish sẽ dùng helper này", () => {
    revalidateContent();
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(CONTENT_TAG);
  });
});
