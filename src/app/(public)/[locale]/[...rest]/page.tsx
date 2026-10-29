import { notFound } from "next/navigation";

/**
 * Catch-all (user 2026-09-29): mọi path lạ dưới locale → notFound() → render
 * [locale]/not-found.tsx styled (boundary không bắt unmatched-URL tự nhiên —
 * chỉ bắt notFound() từ pages, nên cần route này chặn hết).
 * ilec-v2: `instant = false` — Next 16 cacheComponents chặn prerender route có
 * params runtime (catch-all không enumerate được qua generateStaticParams);
 * route 404 render-per-request là hành vi mong muốn.
 */
export const instant = false;

export default function CatchAllPage() {
  notFound();
}
