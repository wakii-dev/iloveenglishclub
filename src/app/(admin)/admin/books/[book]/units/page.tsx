import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { UnitCreateForm } from "@/components/admin/unit-create-form";
import { UnitRowActions } from "@/components/admin/unit-row-actions";
import { getAdminBookBySlug, getAdminUnits } from "@/lib/admin/queries";

/**
 * /admin/books/[book]/units — units list + tạo/sửa/xóa (SF-5).
 * Slug sai → notFound (nhất quán public pages).
 */
export default async function AdminUnitsPage({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book: bookSlug } = await params;
  const t = await getTranslations({ locale: "vi", namespace: "admin" });
  const book = await getAdminBookBySlug(bookSlug);
  if (!book) notFound();
  const units = await getAdminUnits(book.id);

  return (
    <div className="space-y-6">
      <nav aria-label="breadcrumb" className="text-[13.5px] font-bold">
        <Link
          href="/admin/books"
          className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {t("books.title")}
        </Link>
        <span aria-hidden className="mx-2 text-muted-foreground/60">/</span>
        <span className="text-foreground">{book.titleVi ?? book.titleEn}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight">
            {t("units.title")}
          </h1>
          <p className="mt-1 text-[15px] font-semibold text-muted-foreground">
            {t("units.lead")}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Link
            href={`/admin/books/${bookSlug}/vocabulary`}
            className="rounded-[14px] border-2 border-border bg-card px-4 py-2 text-[13.5px] font-bold transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            {t("vocabulary.open")}
          </Link>
          <UnitCreateForm bookId={book.id} />
        </div>
      </div>

      {units.length === 0 ? (
        <p className="rounded-[18px] border-2 border-dashed border-border bg-card p-8 text-center text-[14px] font-semibold text-muted-foreground">
          {t("units.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {units.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-4 rounded-[18px] border-2 border-border bg-card px-5 py-4"
            >
              <span
                aria-hidden
                className="flex size-[46px] shrink-0 items-center justify-center rounded-[14px] bg-muted font-display text-[18px] font-bold text-secondary tabular-nums"
              >
                {u.number}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15.5px] font-bold">
                  {u.titleVi ?? u.titleEn}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {u.titleEn}
                  {u.descVi || u.descEn ? ` — ${u.descVi ?? u.descEn}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-[13px] font-bold text-muted-foreground tabular-nums">
                {t("units.lessonsCount", {
                  published: u.publishedCount,
                  total: u.lessonCount,
                })}
              </span>
              <Link
                href={`/admin/books/${bookSlug}/units/${u.number}/lessons`}
                className="shrink-0 rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-primary transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                {t("units.open")}
              </Link>
              <UnitRowActions unit={u} />
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/admin/books"
        className="inline-flex items-center gap-1 text-[13.5px] font-bold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("common.back")}
      </Link>
    </div>
  );
}
