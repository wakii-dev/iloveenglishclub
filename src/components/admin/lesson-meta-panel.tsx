"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ExternalLink, Rocket, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VOCAB_LEVELS } from "@/lib/admin/vocab-levels";
import type { AdminLessonDetail } from "@/lib/admin/queries";
import {
  publishLessonAction,
  unpublishLessonAction,
  updateLessonMetaAction,
} from "@/lib/actions/admin/lessons";
import { deleteLessonAction } from "@/lib/actions/admin/lessons";

/**
 * Panel meta + publish của lesson editor (SF-5): sửa title/vocab, publish
 * (GATE — blocked hiện missing[] rõ ràng), unpublish, xóa bài (RESTRICT-safe),
 * link trang public.
 */
export function LessonMetaPanel({
  lesson,
  publicUrl,
  lessonsBaseUrl,
}: {
  lesson: AdminLessonDetail;
  publicUrl: string;
  lessonsBaseUrl: string;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("admin.common");
  const te = useTranslations("admin.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gate, setGate] = useState<string | null>(null);
  const [vocab, setVocab] = useState<string>(lesson.vocabLevel);

  function saveMeta(formData: FormData) {
    setGate(null);
    startTransition(async () => {
      const result = await updateLessonMetaAction(lesson.id, {
        titleEn: String(formData.get("titleEn") ?? ""),
        titleVi: String(formData.get("titleVi") ?? ""),
        vocabLevel: vocab as (typeof VOCAB_LEVELS)[number],
      });
      if (result?.error) {
        toast.error(te(result.error));
        return;
      }
      toast.success(tc("save"));
      router.refresh();
    });
  }

  function publish() {
    setGate(null);
    startTransition(async () => {
      const result = await publishLessonAction(lesson.id);
      if (result?.error === "publishBlocked") {
        setGate(
          t("errors.publishBlocked", {
            missing: (result.missing ?? []).join(", "),
          }),
        );
        return;
      }
      if (result?.error) {
        toast.error(te(result.error));
        return;
      }
      toast.success(t("editor.published"));
      router.refresh();
    });
  }

  function unpublish() {
    setGate(null);
    startTransition(async () => {
      const result = await unpublishLessonAction(lesson.id);
      if (result?.error) {
        toast.error(te(result.error));
        return;
      }
      toast.success(t("editor.draft"));
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(t("lessons.deleteConfirm"))) return;
    startTransition(async () => {
      const result = await deleteLessonAction(lesson.id);
      if (result?.error) {
        toast.error(te(result.error));
        return;
      }
      toast.success(tc("delete"));
      router.push(lessonsBaseUrl);
    });
  }

  return (
    <section className="space-y-4 rounded-[18px] border-2 border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="font-display text-[17px] font-bold">
            {t("editor.metaTitle")}
          </p>
          <Badge
            variant={lesson.published ? "secondary" : "outline"}
            className="rounded-full"
          >
            {lesson.published ? t("editor.published") : t("editor.draft")}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-primary transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <ExternalLink aria-hidden className="size-4" />
            {t("editor.publicPage")}
          </a>
          {lesson.published ? (
            <Button
              variant="outline"
              onClick={unpublish}
              disabled={pending}
              className="rounded-[14px]"
            >
              <Undo2 aria-hidden className="size-4" />
              {t("editor.unpublish")}
            </Button>
          ) : (
            <Button onClick={publish} disabled={pending} className="rounded-[14px]">
              <Rocket aria-hidden className="size-4" />
              {pending ? tc("saving") : t("editor.publish")}
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={remove}
          >
            {t("editor.deleteLesson")}
          </Button>
        </div>
      </div>

      {gate ? (
        <p
          role="alert"
          className="rounded-[14px] border-2 border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13.5px] font-bold text-destructive"
        >
          {gate}
        </p>
      ) : (
        <p className="text-[13px] font-semibold text-muted-foreground">
          {t("editor.gateHint")}
        </p>
      )}

      <form action={saveMeta} className="grid gap-3 sm:grid-cols-[1fr_170px]">
        <div className="space-y-1.5">
          <Label htmlFor="lesson-meta-title-en">{t("lessons.titleEn")}</Label>
          <Input
            id="lesson-meta-title-en"
            name="titleEn"
            defaultValue={lesson.titleEn}
            required
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lesson-meta-vocab">{t("lessons.vocabLevel")}</Label>
          <input type="hidden" name="vocabLevel" value={vocab} />
          <Select value={vocab} onValueChange={setVocab}>
            <SelectTrigger id="lesson-meta-vocab" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOCAB_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="lesson-meta-title-vi">{t("lessons.titleVi")}</Label>
          <Input
            id="lesson-meta-title-vi"
            name="titleVi"
            defaultValue={lesson.titleVi ?? ""}
            maxLength={200}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="outline" disabled={pending} className="rounded-[14px]">
            {pending ? tc("saving") : tc("save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
