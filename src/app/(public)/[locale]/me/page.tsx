import { Flame } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { Heatmap } from "@/components/gamification/heatmap";
import { StatsCards } from "@/components/gamification/stats-cards";
import { getBookProgress, getMyStats } from "@/lib/gamification/queries";
import { localize } from "@/lib/content/localize";
import { vnToday } from "@/lib/gamification/streak";

/**
 * /me — stats cá nhân (context pack #6): tổng phần đã luyện, accuracy TB,
 * tổng phút nghe (DISTINCT parts — làm lại không đếm kép), heatmap 12 tuần,
 * tiến độ từng book (% lessons done, 0 skipped). Auth bắt buộc — redirect
 * login kèm ?next để quay lại (flow guest-commit dùng cùng contract).
 */
export const dynamic = "force-dynamic"; // auth() đọc cookies

export default async function MePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    // Pattern admin layout: next/navigation redirect (locale-prefix tường minh)
    // + ?next quay lại đúng trang (guest-commit dùng cùng contract)
    redirect(`/${locale}/login?next=/${locale}/me`);
  }
  const t = await getTranslations("gamification");

  const [stats, bookRows] = await Promise.all([
    getMyStats(userId),
    getBookProgress(userId),
  ]);

  const accuracyPct = Math.round(stats.averageAccuracy * 100);
  const listenMinutes = Math.round(stats.listenMinutes * 10) / 10;
  const today = vnToday(new Date());

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12">
      <h1 className="font-display text-[33px] leading-tight font-bold tracking-tight">
        {t("me.title")}
      </h1>

      <div className="mt-6">
        <StatsCards
          items={[
            { label: t("me.stats.partsPracticed"), value: stats.partsPracticed },
            { label: t("me.stats.accuracy"), value: `${accuracyPct}%` },
            {
              label: t("me.stats.listenTime"),
              value: t("me.minutes", { minutes: listenMinutes }),
            },
            { label: t("me.stats.xp"), value: stats.totalXp.toLocaleString("vi-VN") },
            {
              label: t("me.stats.streak"),
              value: (
                <span className="inline-flex items-center gap-1">
                  <Flame
                    aria-hidden
                    className="size-5"
                    style={{ color: "#f97316" }}
                  />
                  {stats.streak}
                </span>
              ),
            },
          ]}
        />
      </div>

      <section
        aria-labelledby="heatmap-heading"
        className="mt-[18px] rounded-[18px] border-2 border-border bg-card p-5"
      >
        <h2
          id="heatmap-heading"
          className="mb-3.5 font-display text-[20px] font-bold"
        >
          {t("me.heatmap.title")}
        </h2>
        {stats.activity.length === 0 ? (
          <p className="rounded-[14px] border-2 border-dashed border-border p-5 text-center text-[14px] font-semibold text-muted-foreground">
            {t("me.heatmap.empty")}
          </p>
        ) : (
          <Heatmap
            activity={stats.activity}
            today={today}
            labels={{
              legendLess: t("me.heatmap.legendLess"),
              legendMore: t("me.heatmap.legendMore"),
              cellAria: t("me.heatmap.cellAria", {
                date: "{date}",
                parts: "{parts}",
              }),
              summary: t("me.heatmap.summary", {
                days: "{days}",
                parts: "{parts}",
              }),
            }}
          />
        )}
      </section>

      <section
        aria-labelledby="books-heading"
        className="mt-[18px] rounded-[18px] border-2 border-border bg-card p-5"
      >
        <h2
          id="books-heading"
          className="mb-3.5 font-display text-[20px] font-bold"
        >
          {t("me.books.title")}
        </h2>
        <ul className="flex flex-col gap-2.5">
          {bookRows.map((book) => {
            const title = localize(locale, {
              en: book.titleEn,
              vi: book.titleVi,
            });
            const percent =
              book.totalLessons === 0
                ? 0
                : Math.round((book.doneLessons / book.totalLessons) * 100);
            return (
              <li key={book.slug}>
                <Link
                  href={`/books/${book.slug}`}
                  className="flex items-center gap-3.5 rounded-[18px] border-2 border-transparent p-2.5 transition-colors duration-150 hover:border-border focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
                >
                  <span
                    aria-hidden="true"
                    className="size-10 shrink-0 rounded-[14px]"
                    style={{ background: book.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">
                      {title}
                    </span>
                    <span className="mt-1 block h-[10px] overflow-hidden rounded-full border-2 border-border bg-muted">
                      <span
                        className="block h-full rounded-full bg-secondary transition-[width] duration-200"
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-bold text-muted-foreground tabular-nums">
                    {percent === 100
                      ? t("me.books.complete")
                      : book.doneLessons === 0
                        ? t("me.books.notStarted")
                        : t("me.books.progress", {
                            done: book.doneLessons,
                            total: book.totalLessons,
                            percent,
                          })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
