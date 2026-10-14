"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { readMyStats } from "@/lib/actions/my-stats";
import { STATS_UPDATED_EVENT } from "@/lib/gamification/events";

/**
 * Nav-dot nhắc học (daily-journey SF-3, VU-51 — spec §2.6, hand-off
 * "Behavior pin"): dot coral trên link "Hôm nay" khi user đăng nhập AND
 * goalDone KÉP = false hôm nay; đạt goal kép → tắt. Nguồn readMyStats()
 * (server action) — refresh NGAY qua event `ilec:stats-updated` (dictation
 * + session-runner dispatch — KHÔNG cần reload). Guest: không dot (null /
 * fetch fail → ẩn, link vẫn dẫn /today). Đặt trong link — dot thuần trang
 * trí (aria-hidden); tắt khi chưa fetch xong (chống flash nhầm).
 */
export function TodayNavDot() {
  const { status } = useSession();
  const [goalDone, setGoalDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    const refresh = () =>
      readMyStats()
        .then((s) => {
          if (!cancelled) setGoalDone(s?.goalDone ?? null);
        })
        .catch(() => {});
    refresh();
    window.addEventListener(STATS_UPDATED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(STATS_UPDATED_EVENT, refresh);
    };
  }, [status]);

  if (status !== "authenticated" || goalDone !== false) return null;
  return (
    <span
      aria-hidden
      data-testid="today-nav-dot"
      className="size-2 rounded-full bg-primary motion-safe:animate-pulse"
    />
  );
}
