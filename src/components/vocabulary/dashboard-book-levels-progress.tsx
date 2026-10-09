import type { VocabT } from "@/components/vocabulary/dashboard-types";
import { localize } from "@/lib/content/localize";
import type { BookLevelProgress } from "@/lib/vocabulary/dashboard-store";

/**
 * "Lộ trình N sách" (vocab-memrise SF-4, VU-41 — hand-off §2.1 khối 5): mỗi
 * hàng = dot màu level (level-1..7 theo sortOrder) + tên sách + chip CEFR +
 * tag trạng thái (Hoàn thành/Đang học/Chưa bắt đầu) + "planted/total" + bar
 * 7px màu level. 1 cột kể cả desktop (proto: 2 cột chật ở 1280).
 * SYNC + translator qua props — test SSR pin.
 */
export function DashboardBookLevelsProgress({
  books,
  locale,
  t,
}: {
  books: BookLevelProgress[];
  locale: string;
  t: VocabT;
}) {
  if (books.length === 0) return null;

  return (
    <section aria-label={t("hub.dash.booksAria")}>
      <h2 className="mb-2.5 font-display text-[19px] font-extrabold">
        {t("hub.dash.booksTitle", { count: books.length })}
      </h2>
      <ol className="list-none p-0">
        {books.map((book, i) => {
          const { planted, total } = book.progress;
          // màu dot/bar xoay level-1..7 theo sortOrder (hand-off §1.1)
          const lv = (i % 7) + 1;
          const pct = total === 0 ? 0 : Math.round((planted / total) * 100);
          const tag =
            planted >= total && total > 0
              ? {
                  cls: "bg-leaf-soft text-leaf-deep",
                  label: t("hub.dash.bookTagDone"),
                }
              : planted > 0
                ? {
                    cls: "bg-teal-soft text-secondary",
                    label: t("hub.dash.bookTagLearning"),
                  }
                : {
                    cls: "bg-muted text-dim",
                    label: t("hub.dash.bookTagNone"),
                  };
          const title = localize(locale, {
            en: book.titleEn,
            vi: book.titleVi,
          });
          return (
            <li
              key={book.bookId}
              className="border-b-[1.5px] border-border py-2.5 last:border-0"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 flex-none rounded-[4px]"
                  style={{ background: `var(--level-${lv})` }}
                  aria-hidden="true"
                />
                <b className="text-[14.5px]">{title}</b>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                  {book.cefrLabel}
                </span>
                <span
                  className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${tag.cls}`}
                >
                  {tag.label}
                </span>
                <span className="text-[12.5px] font-bold tabular-nums text-muted-foreground">
                  {planted}/{total}
                </span>
              </div>
              <div
                role="img"
                aria-label={`${title}: ${planted}/${total}`}
                className="h-[7px] overflow-hidden rounded-full bg-muted"
              >
                <i
                  className="block h-full rounded-full"
                  style={{ width: `${pct}%`, background: `var(--level-${lv})` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
