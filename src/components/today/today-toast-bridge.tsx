"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Toaster, toast } from "sonner";

/**
 * Toast bridge (daily-journey SF-3, VU-51 — spec §2.4/§2.5 "toast đúng 1
 * lần"): newlyCompletedQuests/newlyEarnedBadges từ snapshot — ledger
 * RETURNING (SF-2) đảm bảo mỗi render chỉ liệt kê quest/badge VỪA ghi lần
 * đầu → fire useEffect mount là đủ 1 lần (reload/rerender sau đó list rỗng
 * — không lặp). Toaster scoped trang /today (public layout không mount
 * Toaster — footprint hẹp theo boundary).
 */
export function TodayToastBridge({
  newlyCompletedQuests,
  newlyEarnedBadges,
}: {
  newlyCompletedQuests: string[];
  newlyEarnedBadges: string[];
}) {
  const t = useTranslations("today");
  // props RSC đổi ref mỗi render — chốt list lần đầu mount vào ref để
  // StrictMode double-invoke effect không fire 2 lần
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    for (const questId of newlyCompletedQuests) {
      toast.success(t("toast.questDone", { title: t(`quests.${questId}.title`) }));
    }
    for (const badgeId of newlyEarnedBadges) {
      toast.success(t("toast.badgeEarned", { title: t(`badges.${badgeId}.title`) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire ĐÚNG 1 lần trên props render đầu
  }, []);

  return <Toaster position="top-right" richColors />;
}
