import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LessonMetaPanel } from "@/components/admin/lesson-meta-panel";
import { PartsEditor } from "@/components/admin/parts-editor";
import { ScriptSplitter } from "@/components/admin/script-splitter";
import {
  getAdminBookBySlug,
  getAdminLessonDetail,
  getAdminLessons,
  getAdminUnit,
} from "@/lib/admin/queries";

/**
 * Lesson editor (SF-5 — màn chính spec §6.3): meta + publish gate, script
 * splitter, parts editor (preview player), audio uploader (T5).
 * URL: /admin/books/[book]/units/[unit]/lessons/[lesson] — number-based.
 */
export default async function AdminLessonEditorPage({
  params,
}: {
  params: Promise<{ book: string; unit: string; lesson: string }>;
}) {
  const { book: bookSlug, unit: unitParam, lesson: lessonParam } = await params;
  const t = await getTranslations({ locale: "vi", namespace: "admin" });
  const book = await getAdminBookBySlug(bookSlug);
  if (!book) notFound();
  const unitNumber = Number(unitParam);
  const lessonNumber = Number(lessonParam);
  if (!Number.isInteger(unitNumber) || !Number.isInteger(lessonNumber)) {
    notFound();
  }
  const unit = await getAdminUnit(book.id, unitNumber);
  if (!unit) notFound();
  const lessonsBaseUrl = `/admin/books/${bookSlug}/units/${unitNumber}/lessons`;
  // editor thao tác theo id — lesson number lookup trong unit
  const allLessons = await getAdminLessons(unit.id);
  const lessonRow = allLessons.find((l) => l.number === lessonNumber);
  if (!lessonRow) notFound();
  const lesson = await getAdminLessonDetail(lessonRow.id);
  if (!lesson) notFound();

  const publicUrl =
    `/en/books/${bookSlug}/units/${unitNumber}/lessons/${lessonNumber}/listen-and-type`;

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
          href={`/admin/books/${bookSlug}/units`}
          className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {book.titleVi ?? book.titleEn}
        </Link>
        <span aria-hidden className="mx-2 text-muted-foreground/60">/</span>
        <Link
          href={`/admin/books/${bookSlug}/units/${unitNumber}/lessons`}
          className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {t("editor.lessons")} {unitNumber}
        </Link>
        <span aria-hidden className="mx-2 text-muted-foreground/60">/</span>
        <span className="text-foreground">
          {t("editor.breadcrumb")} {lessonNumber}
        </span>
      </nav>

      <h1 className="font-display text-[28px] font-bold tracking-tight">
        {lesson.titleVi ?? lesson.titleEn}
      </h1>

      <LessonMetaPanel
        lesson={lesson}
        publicUrl={publicUrl}
        lessonsBaseUrl={lessonsBaseUrl}
      />

      <ScriptSplitter lessonId={lesson.id} />

      <PartsEditor parts={lesson.parts} />
    </div>
  );
}
