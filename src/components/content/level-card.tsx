import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { LocalizedBook } from "@/lib/content/queries";

/**
 * §2.3 LevelCard — head 64px band màu level (§1.7, chữ trắng w800) + pill
 * CEFR bg white/22; body trắng border-2 (tên kỳ thi, mô tả, foot counts).
 * Anon SSG: progress cá nhân ẩn (SF-6 thay khi có data thật).
 */
export async function LevelCard({ book }: { book: LocalizedBook }) {
  const t = await getTranslations("books");

  return (
    <Link
      href={`/books/${book.slug}`}
      className="group block w-[236px] shrink-0 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      <div
        className="flex h-16 items-center justify-between gap-2 rounded-t-[18px] px-4 text-white"
        style={{
          // SF-8 a11y: band đậm 40% (color-mix) — chữ trắng ≥5.4:1 trên mọi
          // level color (raw #f59e0b chỉ 2.1:1 — FAIL Lighthouse color-contrast)
          backgroundColor: `color-mix(in srgb, ${book.color} 60%, black)`,
        }}
      >
        <span className="font-display text-[15px] font-bold leading-tight">
          {book.title}
        </span>
        <span className="rounded-full bg-black/30 px-2.5 py-0.5 text-[12px] font-extrabold whitespace-nowrap">
          {book.cefrLabel}
        </span>
      </div>
      <div className="rounded-b-[18px] border-2 border-t-0 border-border bg-card p-4 transition-colors duration-150 group-hover:border-secondary">
        <h3 className="text-[14px] font-extrabold leading-snug">
          {book.examTarget ?? t("book.noExam")}
        </h3>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
          {book.description}
        </p>
        <p className="mt-3 border-t-2 border-border pt-2.5 text-[12.5px] font-bold text-muted-foreground tabular-nums">
          {t("book.unitsCount", { count: book.unitCount })} ·{" "}
          {t("book.lessonsCount", { count: book.lessonCount })}
        </p>
      </div>
    </Link>
  );
}
