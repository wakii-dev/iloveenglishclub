"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import {
  createLessonAction,
  type LessonActionState,
} from "@/lib/actions/admin/lessons";

/**
 * Form tạo lesson (SF-5) — number tự tăng (max+1 trong unit, action lo);
 * tạo xong navigate thẳng vào editor (/lessons/[number]).
 */
export function LessonCreateForm({
  unitId,
  basePath,
}: {
  unitId: number;
  basePath: string; // /admin/books/{slug}/units/{n}
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("admin.common");
  const te = useTranslations("admin.errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vocab, setVocab] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result: LessonActionState = await createLessonAction(unitId, {
        titleEn: String(formData.get("titleEn") ?? ""),
        titleVi: String(formData.get("titleVi") ?? ""),
        vocabLevel: vocab as (typeof VOCAB_LEVELS)[number],
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.ok && result.lessonNumber) {
        router.push(`${basePath}/lessons/${result.lessonNumber}`);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="rounded-[14px]">
        <Plus aria-hidden className="size-4" />
        {t("lessons.createTitle")}
      </Button>
    );
  }

  return (
    <form
      action={onSubmit}
      className="w-full max-w-xl rounded-[18px] border-2 border-border bg-card p-5"
    >
      <p className="font-display text-[17px] font-bold">
        {t("lessons.createTitle")}
      </p>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="lesson-title-en">{t("lessons.titleEn")}</Label>
          <Input id="lesson-title-en" name="titleEn" required maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lesson-title-vi">{t("lessons.titleVi")}</Label>
          <Input id="lesson-title-vi" name="titleVi" maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lesson-vocab">{t("lessons.vocabLevel")}</Label>
          <Select value={vocab} onValueChange={setVocab} required>
            <SelectTrigger id="lesson-vocab" className="w-44">
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
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-bold text-destructive">
          {te(error)}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button
          type="submit"
          disabled={pending || !vocab}
          className="rounded-[14px]"
        >
          {pending ? tc("saving") : tc("create")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          {tc("cancel")}
        </Button>
      </div>
    </form>
  );
}
