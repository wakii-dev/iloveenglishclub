import { revalidateTag } from "next/cache";

/**
 * Tag cache cho mọi content read (books/units/lessons/parts) — wire từ đầu
 * theo spec §3: Server Action CRUD/publish của SF-5 gọi revalidateContent()
 * để stale toàn bộ trang SSG/ISR dùng queries.ts.
 */
export const CONTENT_TAG = "content";

export function revalidateContent(): void {
  revalidateTag(CONTENT_TAG);
}
