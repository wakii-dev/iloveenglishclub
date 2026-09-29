import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { LessonCreateForm } from "@/components/admin/lesson-create-form";
import { LessonDeleteButton } from "@/components/admin/lesson-delete-button";
import {
  getAdminBookBySlug,
  getAdminLessons,
  getAdminUnit,
} from "@/lib/admin/queries";

/**
 * /admin/books/[book]/units/[unit]/lessons — lessons list + tạo (number tự
 * tăng) (SF-5). Editor ở lessons/[lesson] (T4).
 */
export default async function AdminLessonsPage({
  params,
}: {
  params: Promise<{ book: string; unit: string }>;
}) {
  const { book: bookSlug, unit: unitParam } = await params;
  const t = await getTranslations({ locale: "vi", namespace: "admin" });
  const book = await getAdminBookBySlug(bookSlug);
  if (!book) notFound();
  const unitNumber = Number(unitParam);
  if (!Number.isInteger(unitNumber)) notFound();
  const unit = await getAdminUnit(book.id, unitNumber);
  if (!unit) notFound();
  const lessons = await getAdminLessons(unit.id);
  const basePath = `/admin/books/${bookSlug}/units/${unitNumber}`;

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
        <Link
          href={basePath}
          className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {t("units.title")} {unit.number}
        </Link>
        <span aria-hidden className="mx-2 text-muted-foreground/60">/</span>
        <span className="text-foreground">{t("lessons.title")}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight">
            {unit.titleVi ?? unit.titleEn}
          </h1>
          <p className="mt-1 text-[15px] font-semibold text-muted-foreground">
            {t("lessons.lead")}
          </p>
        </div>
        <LessonCreateForm unitId={unit.id} basePath={basePath} />
      </div>

      {lessons.length === 0 ? (
        <p className="rounded-[18px] border-2 border-dashed border-border bg-card p-8 text-center text-[14px] font-semibold text-muted-foreground">
          {t("lessons.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {lessons.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-4 rounded-[18px] border-2 border-border bg-card px-5 py-4"
            >
              <span
                aria-hidden
                className="flex size-[46px] shrink-0 items-center justify-center rounded-[14px] bg-muted font-display text-[18px] font-bold text-secondary tabular-nums"
              >
                {l.number}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15.5px] font-bold">
                  {l.titleVi ?? l.titleEn}
                </p>
                <p className="truncate text-[13px] text-muted-foreground tabular-nums">
                  {l.vocabLevel} ·{" "}
                  {t("lessons.partsSummary", { count: l.partsCount })}
                  {l.partsMissingAudio > 0
                    ? ` · ${t("lessons.missingAudio", { count: l.partsMissingAudio })}`
                    : ""}
                </p>
              </div>
              <Badge
                variant={l.published ? "secondary" : "outline"}
                className="shrink-0 rounded-full"
              >
                {l.published ? t("lessons.statusPublished") : t("lessons.statusDraft")}
              </Badge>
              <Link
                href={`${basePath}/lessons/${l.number}`}
                className="shrink-0 rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-primary transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                {t("lessons.open")}
              </Link>
              <LessonDeleteButton lessonId={l.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
