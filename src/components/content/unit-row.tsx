import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { LocalizedUnit } from "@/lib/content/queries";

/**
 * §2.4 UnitRow — idx vuông 46px rounded-[14px] bg-muted text-secondary Baloo
 * + title + side lessons count. Hover: border teal. Anon: bỏ progress/score.
 */
export async function UnitRow({
  unit,
  bookSlug,
}: {
  unit: LocalizedUnit;
  bookSlug: string;
}) {
  const t = await getTranslations("books");

  return (
    <Link
      href={`/books/${bookSlug}/units/${unit.number}`}
      className="group flex items-center gap-4 rounded-[18px] border-2 border-border bg-card p-4 transition-colors duration-150 hover:border-secondary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      <span
        aria-hidden
        className="flex size-[46px] shrink-0 items-center justify-center rounded-[14px] bg-muted font-display text-[18px] font-bold text-secondary"
      >
        {unit.number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[16.5px] font-bold">
          {unit.title}
        </span>
        {unit.description ? (
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
            {unit.description}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-[13px] font-bold text-muted-foreground tabular-nums">
        {t("unit.lessonsCount", { count: unit.lessonCount })}
      </span>
    </Link>
  );
}
