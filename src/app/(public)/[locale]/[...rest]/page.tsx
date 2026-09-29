import { notFound } from "next/navigation";

/**
 * Catch-all (user 2026-09-29): mọi path lạ dưới locale → notFound() → render
 * [locale]/not-found.tsx styled (boundary không bắt unmatched-URL tự nhiên —
 * chỉ bắt notFound() từ pages, nên cần route này chặn hết).
 */
export default function CatchAllPage() {
  notFound();
}
