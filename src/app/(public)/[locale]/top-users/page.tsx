import { getTranslations, setRequestLocale } from "next-intl/server";
import { LeaderboardTable } from "@/components/gamification/leaderboard-table";
import { getLeaderboard } from "@/lib/gamification/queries";
import { topQuizScores } from "@/lib/vocabulary/quiz-store";

/**
 * /top-users — leaderboard 2 bảng (context pack #5): tuần ISO Mon–Sun TZ +07
 * (từ attempts.xp) + all-time (profiles.xp), cộng mục "Điểm quiz" (SF-4 t-4.3:
 * MAX quiz_attempts.score group by user — điểm tốt nhất, không thưởng đi làm
 * lại). Public (anon xem được, §4 view public read). SEO metadata trang này là
 * việc SF-7 — KHÔNG thêm ở đây.
 */
export const revalidate = 60;

export default async function TopUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("gamification");

  const [weekly, allTime, quizTop] = await Promise.all([
    getLeaderboard("weekly"),
    getLeaderboard("all_time"),
    topQuizScores(),
  ]);

  const labels = {
    rank: t("topUsers.rank"),
    player: t("topUsers.player"),
    xp: t("topUsers.xp"),
    empty: t("topUsers.empty"),
    anonymous: t("topUsers.anonymous"),
    medalAria: t("topUsers.medalAria", { rank: "{rank}" }),
  };

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12">
      <h1 className="font-display text-[33px] leading-tight font-bold tracking-tight">
        {t("topUsers.title")}
      </h1>
      <p className="mt-2 max-w-2xl text-[15.5px] font-semibold text-muted-foreground">
        {t("topUsers.lead")}
      </p>

      <div className="mt-8 grid gap-[18px] lg:grid-cols-2">
        <section
          aria-labelledby="weekly-heading"
          className="rounded-[18px] border-2 border-border bg-card p-5"
        >
          <h2
            id="weekly-heading"
            className="mb-3 font-display text-[20px] font-bold text-primary"
          >
            {t("topUsers.weekly")}
          </h2>
          <LeaderboardTable rows={weekly} labels={labels} />
        </section>

        <section
          aria-labelledby="alltime-heading"
          className="rounded-[18px] border-2 border-border bg-card p-5"
        >
          <h2
            id="alltime-heading"
            className="mb-3 font-display text-[20px] font-bold text-secondary"
          >
            {t("topUsers.allTime")}
          </h2>
          <LeaderboardTable rows={allTime} labels={labels} />
        </section>
      </div>

      <section
        aria-labelledby="quiz-heading"
        className="mt-[18px] rounded-[18px] border-2 border-border bg-card p-5"
      >
        <h2
          id="quiz-heading"
          className="mb-3 font-display text-[20px] font-bold text-primary"
        >
          {t("topUsers.quizSection")}
        </h2>
        <LeaderboardTable
          rows={quizTop.map((row) => ({
            displayName: row.displayName,
            avatarUrl: row.avatarUrl,
            xp: Math.round(row.bestScore * 100),
          }))}
          labels={{
            ...labels,
            xp: t("topUsers.quizScore"),
            empty: t("topUsers.quizEmpty"),
          }}
          valueSuffix="%"
        />
      </section>
    </div>
  );
}
