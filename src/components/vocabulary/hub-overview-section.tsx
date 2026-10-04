import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { StatsCards } from "@/components/gamification/stats-cards";
import { localize } from "@/lib/content/localize";
import { HubFilters } from "@/components/vocabulary/hub-filters";
import { BookStudyButton } from "@/components/vocabulary/book-study-button";
import { buttonVariants } from "@/components/ui/button";
import {
  displayStatus,
  formatBookTitles,
  hubStatusChipClass,
  parseHubFilters,
} from "@/lib/vocabulary/hub-status";
import {
  getHubStats,
  listDiscoverBooks,
  listHubBooks,
  listHubWords,
} from "@/lib/vocabulary/hub-store";
import { getDailyPlan } from "@/lib/vocabulary/daily-plan-store";

/**
 * Tab Tổng quan (SF-1 t-1.2) — tách khỏi page.tsx khi SF-2 thêm tab Thư viện:
 * KPI mọi book + bảng từ đang học ⋈ filter book/trạng thái. Như cũ, data cá
 * nhân → query live; guest không bao giờ render section này (page điều phối).
 * story vocabulary-learn t-1.5: hàng Lộ trình hôm nay (X từ mới + Y ôn due +
 * streak derive từ user_word_progress — không bảng mới) + CTA vào phiên ôn.
 * story vocabulary-learn t-1.3: thêm hàng Khám phá — sách bạn đọc còn từ chưa
 * học, nút bulk seed (t-1.2) ngay trên hàng để học luôn không rời hub.
 */
export async function HubOverviewSection({
  userId,
  sp,
  locale,
  now,
}: {
  userId: string;
  sp: { book?: string; status?: string };
  locale: string;
  now: Date;
}) {
  const t = await getTranslations("vocabulary");
  const filter = parseHubFilters(sp);
  const [stats, books, rows, discover, plan] = await Promise.all([
    getHubStats(userId),
    listHubBooks(),
    listHubWords(userId, filter),
    listDiscoverBooks(userId),
    getDailyPlan(userId, now),
  ]);
  const bookOptions = books.map((book) => ({
    id: book.id,
    title: localize(locale, { en: book.titleEn, vi: book.titleVi }),
  }));

  return (
    <>
      <div className="mt-6">
        <StatsCards
          columns={3}
          items={[
            { label: t("hub.stats.learning"), value: stats.total },
            { label: t("hub.stats.dueToday"), value: stats.dueToday },
            { label: t("hub.stats.mastered"), value: stats.mastered },
          ]}
        />
      </div>

      {plan.total > 0 ? (
        <section
          aria-labelledby="hub-roadmap-heading"
          className="mt-[18px] rounded-[18px] border-2 border-border bg-card p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="hub-roadmap-heading"
                className="font-display text-[20px] font-bold"
              >
                {t("hub.roadmap.title")}
              </h2>
              <p className="mt-1 text-[14px] font-semibold text-muted-foreground tabular-nums">
                {t("hub.roadmap.summary", {
                  newCount: plan.newDue,
                  reviewCount: plan.reviewDue,
                })}
              </p>
              {plan.streakDays > 0 ? (
                <p className="mt-1 text-[13px] font-bold text-secondary tabular-nums">
                  {t("hub.roadmap.streak", { count: plan.streakDays })}
                </p>
              ) : null}
            </div>
            <Link
              href="/me/vocabulary"
              className={buttonVariants({ variant: "default" })}
            >
              {t("hub.roadmap.cta")}
            </Link>
          </div>
        </section>
      ) : null}

      {discover.length > 0 ? (
        <section
          aria-labelledby="hub-discover-heading"
          className="mt-[18px] rounded-[18px] border-2 border-border bg-card p-5"
        >
          <h2
            id="hub-discover-heading"
            className="font-display text-[20px] font-bold"
          >
            {t("hub.discover.title")}
          </h2>
          <p className="mt-1 text-[14px] font-semibold text-muted-foreground">
            {t("hub.discover.lead")}
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {discover.map((book) => (
              <li
                key={book.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border-2 border-border bg-background/40 p-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[16px] font-bold">
                    {localize(locale, {
                      en: book.titleEn,
                      vi: book.titleVi,
                    })}
                  </span>
                  <span className="mt-0.5 block text-[13px] font-semibold text-muted-foreground tabular-nums">
                    {t("hub.discover.unlearned", { count: book.unlearned })}
                  </span>
                </span>
                <BookStudyButton
                  bookId={book.id}
                  locale={locale}
                  nextPath={`/${locale}/vocabulary`}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="hub-words-heading"
        className="mt-[18px] rounded-[18px] border-2 border-border bg-card p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="hub-words-heading"
            className="font-display text-[20px] font-bold"
          >
            {t("hub.wordsTitle")}
          </h2>
          <HubFilters books={bookOptions} bookId={filter.bookId} status={filter.status} />
        </div>

        <div className="mt-4">
          {rows.length === 0 ? (
            stats.total === 0 ? (
              <p className="rounded-[14px] border-2 border-dashed border-border p-5 text-center text-[14px] font-semibold text-muted-foreground">
                {t("hub.emptyAll")}{" "}
                <Link
                  href="/books"
                  className="text-primary underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
                >
                  {t("hub.ctaBrowseBooks")}
                </Link>
              </p>
            ) : (
              <p className="rounded-[14px] border-2 border-dashed border-border p-5 text-center text-[14px] font-semibold text-muted-foreground">
                {t("hub.emptyFiltered")}
              </p>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b-2 border-border text-left text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">
                    <th className="px-4 py-3">{t("hub.table.colWord")}</th>
                    <th className="px-4 py-3">{t("hub.table.colMeaning")}</th>
                    <th className="px-4 py-3">{t("hub.table.colBook")}</th>
                    <th className="px-4 py-3">{t("hub.table.colStatus")}</th>
                    <th className="px-4 py-3">{t("hub.table.colDue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const status = displayStatus(row, now);
                    return (
                      <tr
                        key={row.wordId}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="px-4 py-3 font-bold">{row.word}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.meaningVi}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatBookTitles(locale, row.books)}
                        </td>
                        <td
                          className={`px-4 py-3 font-bold ${hubStatusChipClass(status)}`}
                        >
                          {t(`hub.chip.${status}`)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {row.dueAt.toLocaleDateString(
                            locale === "vi" ? "vi-VN" : "en-US",
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
