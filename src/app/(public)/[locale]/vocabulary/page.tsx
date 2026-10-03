import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { StatsCards } from "@/components/gamification/stats-cards";
import { HubFilters } from "@/components/vocabulary/hub-filters";
import { localize } from "@/lib/content/localize";
import {
  displayStatus,
  getHubStats,
  listHubBooks,
  listHubWords,
  parseHubFilters,
  type HubWordRow,
} from "@/lib/vocabulary/hub-store";

/**
 * /vocabulary — Vocabulary Hub, module tổng tầng một (SF-1 t-1.2). Shell 4 tab
 * (Tổng quan active; Thư viện/Review/Quiz placeholder sắp có — SF-2/SF-3 làm),
 * tab Tổng quan: KPI mọi book + bảng từ ⋈ filter book/trạng thái. Auth bắt
 * buộc (pattern me/vocabulary: redirect login kèm ?next); data cá nhân →
 * force-dynamic, KHÔNG cache như content dùng chung.
 */
export const dynamic = "force-dynamic"; // auth() đọc cookies

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "vocabulary" });
  return { title: t("hub.title") };
}

function statusChipClass(status: "due" | "mastered" | "learning"): string {
  // due đè màu primary, mastered secondary, learning muted — không viền mới
  if (status === "due") return "text-primary";
  if (status === "mastered") return "text-secondary";
  return "text-muted-foreground";
}

export default async function VocabularyHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ book?: string; status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    // Pattern me/page: redirect locale-prefix tường minh + ?next quay lại
    redirect(`/${locale}/login?next=/${locale}/vocabulary`);
  }
  const t = await getTranslations("vocabulary");
  const filter = parseHubFilters(await searchParams);
  const [stats, books, rows] = await Promise.all([
    getHubStats(userId),
    listHubBooks(),
    listHubWords(userId, filter),
  ]);
  const now = new Date();
  const bookOptions = books.map((book) => ({
    id: book.id,
    title: localize(locale, { en: book.titleEn, vi: book.titleVi }),
  }));

  function rowBooks(row: HubWordRow): string {
    return row.books.length === 0
      ? "—"
      : row.books
          .map((b) => localize(locale, { en: b.titleEn, vi: b.titleVi }))
          .join(", ");
  }

  function rowDue(row: HubWordRow): string {
    return row.dueAt.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US");
  }

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12">
      <h1 className="font-display text-[33px] leading-tight font-bold tracking-tight">
        {t("hub.title")}
      </h1>

      <ol className="mt-6 flex w-fit flex-wrap items-center gap-1.5 rounded-[18px] border-2 border-border bg-card p-1.5">
        <li
          aria-current="page"
          className="rounded-[12px] bg-primary px-3 py-1.5 text-[13px] font-bold text-primary-foreground"
        >
          {t("hub.tabs.overview")}
        </li>
        {(["library", "review", "quiz"] as const).map((tab) => (
          <li
            key={tab}
            className="flex items-center gap-1.5 rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-muted-foreground"
          >
            {t(`hub.tabs.${tab}`)}
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">
              {t("hub.comingSoon")}
            </span>
          </li>
        ))}
      </ol>

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
                          {rowBooks(row)}
                        </td>
                        <td
                          className={`px-4 py-3 font-bold ${statusChipClass(status)}`}
                        >
                          {t(`hub.chip.${status}`)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {rowDue(row)}
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
    </div>
  );
}
