import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAdminBooks } from "@/lib/admin/queries";

/** /admin/books — 7 sách cố định (không CRUD — schema note); chọn để vào units. */
export default async function AdminBooksPage() {
  const t = await getTranslations({ locale: "vi", namespace: "admin" });
  const books = await getAdminBooks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight">
          {t("books.title")}
        </h1>
        <p className="mt-1 text-[15px] font-semibold text-muted-foreground">
          {t("books.lead")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {books.map((b) => (
          <Link
            key={b.id}
            href={`/admin/books/${b.slug}/units`}
            className="group rounded-[18px] border-2 border-border bg-card p-5 transition-colors hover:border-secondary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <div className="flex items-start justify-between gap-3">
              <span
                aria-hidden
                className="inline-block h-9 w-9 rounded-[11px]"
                style={{ backgroundColor: b.color }}
              />
              <Badge
                variant="outline"
                className="rounded-full tabular-nums"
                style={{ color: b.color, borderColor: b.color }}
              >
                {b.cefrLabel}
              </Badge>
            </div>
            <p className="mt-3 font-display text-[17.5px] font-bold">
              {b.titleVi ?? b.titleEn}
            </p>
            <p className="mt-1 text-[13px] font-semibold text-muted-foreground tabular-nums">
              {t("books.unitsCount", {
                count: b.unitCount,
                published: b.publishedCount,
                total: b.lessonCount,
                parts: b.partCount,
              })}
            </p>
            <p className="mt-3 inline-flex items-center gap-1 text-[13.5px] font-bold text-primary">
              {t("books.open")}
              <ChevronRight
                aria-hidden
                className="size-4 transition-transform group-hover:translate-x-0.5"
              />
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
