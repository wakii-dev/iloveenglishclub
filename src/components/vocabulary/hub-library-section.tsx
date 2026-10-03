import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { WordPlayButton } from "@/components/content/word-play-button";
import { buttonVariants } from "@/components/ui/button";
import { localize } from "@/lib/content/localize";
import { LibraryFilters } from "@/components/vocabulary/library-filters";
import {
  displayStatus,
  formatBookTitles,
  hubStatusChipClass,
  libraryHref,
  parseLibraryFilters,
} from "@/lib/vocabulary/hub-status";
import { listHubBooks, listLibraryWords } from "@/lib/vocabulary/hub-store";

/**
 * Tab Thư viện (SF-2 t-2.2) — duyệt TOÀN BỘ words (gồm từ độc lập), server
 * render theo searchParams (search/book/audio/status/page — GET-filter như
 * tab Tổng quan). Guest được duyệt: không cột trạng thái SRS + ẩn filter
 * status. "Học từ này" → /me/vocabulary?word=<id> prefill thẻ flashcard.
 */
export async function HubLibrarySection({
  userId,
  sp,
  locale,
  now,
}: {
  userId: string | null;
  sp: {
    search?: string;
    book?: string;
    audio?: string;
    status?: string;
    page?: string;
  };
  locale: string;
  now: Date;
}) {
  const t = await getTranslations("vocabulary");
  const filter = parseLibraryFilters(sp);
  const [books, page] = await Promise.all([
    listHubBooks(),
    listLibraryWords(userId, filter),
  ]);
  const bookOptions = books.map((book) => ({
    id: book.id,
    title: localize(locale, { en: book.titleEn, vi: book.titleVi }),
  }));
  const filtered =
    filter.search !== "" ||
    filter.bookId !== null ||
    filter.hasAudio ||
    (userId !== null && filter.status !== "all");

  return (
    <section
      aria-labelledby="library-heading"
      className="mt-6 rounded-[18px] border-2 border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="library-heading" className="font-display text-[20px] font-bold">
            {t("hub.libraryTitle")}
          </h2>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground tabular-nums">
            {t("hub.library.count", { count: page.total })}
          </p>
        </div>
        <LibraryFilters
          books={bookOptions}
          filter={filter}
          showStatus={userId !== null}
        />
      </div>

      <div className="mt-4">
        {page.rows.length === 0 ? (
          <p className="rounded-[14px] border-2 border-dashed border-border p-5 text-center text-[14px] font-semibold text-muted-foreground">
            {page.total === 0 && !filtered
              ? t("hub.library.emptyAll")
              : t("hub.emptyFiltered")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b-2 border-border text-left text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">
                  <th className="px-4 py-3">{t("hub.table.colWord")}</th>
                  <th className="px-4 py-3">{t("hub.table.colMeaning")}</th>
                  <th className="px-4 py-3">{t("hub.table.colBook")}</th>
                  <th className="px-4 py-3">{t("hub.library.table.colAudio")}</th>
                  {userId !== null ? (
                    <th className="px-4 py-3">{t("hub.table.colStatus")}</th>
                  ) : null}
                  <th className="px-4 py-3">{t("hub.library.table.colAction")}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => {
                  const status =
                    row.progress === null
                      ? null
                      : displayStatus(row.progress, now);
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
                      <td className="px-4 py-3">
                        {row.audioUrl ? (
                          <WordPlayButton
                            word={row.word}
                            audioUrl={row.audioUrl}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      {userId !== null ? (
                        <td
                          className={`px-4 py-3 font-bold ${status ? hubStatusChipClass(status) : "text-muted-foreground"}`}
                        >
                          {status
                            ? t(`hub.chip.${status}`)
                            : t("hub.library.chipNotLearning")}
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <Link
                          href={`/me/vocabulary?word=${row.wordId}`}
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
                        >
                          {t("hub.library.learn")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {page.totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-3">
          {page.page > 1 ? (
            <Link
              href={libraryHref(filter, page.page - 1)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t("hub.library.prev")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">
            {t("hub.library.pageInfo", {
              page: page.page,
              total: page.totalPages,
            })}
          </span>
          {page.page < page.totalPages ? (
            <Link
              href={libraryHref(filter, page.page + 1)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t("hub.library.next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}
