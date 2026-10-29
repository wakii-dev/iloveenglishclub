import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { TodayBadgeStrip } from "@/components/today/today-badges";
import { TodayHero } from "@/components/today/today-hero";
import { TodayQuestList } from "@/components/today/today-quests";
import { TodayStreakCard } from "@/components/today/today-streak";
import { TodaySuggestions } from "@/components/today/today-suggestions";
import { TodayToastBridge } from "@/components/today/today-toast-bridge";
import { hasMissingDuration } from "@/lib/today/duration-hint";
import { getTodaySnapshot } from "@/lib/today/today-store";

/**
 * /today — "Hôm nay học gì" (daily-journey SF-3, VU-51 — spec §2.1, hand-off
 * direction A dashboard-dense): RSC force-dynamic, auth-gate pattern
 * /me (guest → login ?next), MỘT h1, render từ getTodaySnapshot (SF-2) —
 * KHÔNG query trực tiếp trong page (trừ duration-hint — REQUIREMENT-GAP
 * epic VU-48). Grid 2 cột desktop (hero+suggestions trái, quests+badges+
 * streak phải — hand-off A), mobile 375px stack dọc.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "today" });
  return { title: t("title"), description: t("description") };
}

/** Dynamic page (auth/db) — blocking route for Next 16 cacheComponents. */
export const instant = false;

export default async function TodayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
    const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    // Pattern /me: locale-prefix tường minh + ?next quay lại đúng trang
    redirect(`/${locale}/login?next=/${locale}/today`);
  }
  const t = await getTranslations("today");

  const snapshot = await getTodaySnapshot(userId, new Date());
  // Read phụ nhỏ (fallback-safe) — xem duration-hint.ts header
  const durationHint = snapshot.dictationNext
    ? await hasMissingDuration(snapshot.dictationNext)
    : false;

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12">
      <h1 className="font-display text-[33px] leading-tight font-bold tracking-tight">
        {t("h1")}
      </h1>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <TodayHero
            listenMinutes={snapshot.listenMinutesToday}
            goalMinutes={snapshot.dailyGoalMinutes}
            practiced={snapshot.practicedToday}
            goalWords={snapshot.dailyGoalWords}
            durationHint={durationHint}
          />
          <TodaySuggestions
            dictation={snapshot.dictationNext}
            dueToday={snapshot.dueToday}
            vocabContinue={snapshot.vocabContinue}
            listenMinutes={snapshot.listenMinutesToday}
            goalMinutes={snapshot.dailyGoalMinutes}
            practiced={snapshot.practicedToday}
            goalWords={snapshot.dailyGoalWords}
          />
        </div>
        <div className="grid gap-5">
          <TodayQuestList quests={snapshot.quests} />
          <TodayBadgeStrip owned={snapshot.badges} />
          <TodayStreakCard
            streak={snapshot.streak}
            activeToday={snapshot.activeToday}
            shieldCredits={snapshot.shield.credits}
            shieldCap={snapshot.shield.cap}
            shieldFreezes={snapshot.shield.freezes}
          />
        </div>
      </div>

      <TodayToastBridge
        newlyCompletedQuests={snapshot.newlyCompletedQuests}
        newlyEarnedBadges={snapshot.newlyEarnedBadges}
      />
    </div>
  );
}
