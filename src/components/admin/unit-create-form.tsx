"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createUnitAction,
  type UnitActionState,
} from "@/lib/actions/admin/units";

/**
 * Form tạo unit (SF-5) — client component gọi server action trực tiếp
 * (typed args), hiện error key qua admin.json. Số unit bất biến sau tạo
 * (audio path neo number) nên tạo xong ẩn form.
 */
export function UnitCreateForm({ bookId }: { bookId: number }) {
  const t = useTranslations("admin");
  const tc = useTranslations("admin.common");
  const te = useTranslations("admin.errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result: UnitActionState = await createUnitAction(bookId, {
        number: Number(formData.get("number")),
        titleEn: String(formData.get("titleEn") ?? ""),
        titleVi: String(formData.get("titleVi") ?? ""),
        descEn: String(formData.get("descEn") ?? ""),
        descVi: String(formData.get("descVi") ?? ""),
      });
      if (result?.error) {
        setError(result.error);
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
        {t("units.createTitle")}
      </Button>
    );
  }

  return (
    <form
      action={onSubmit}
      className="w-full max-w-xl rounded-[18px] border-2 border-border bg-card p-5"
    >
      <p className="font-display text-[17px] font-bold">
        {t("units.createTitle")}
      </p>
      <div className="mt-4 grid grid-cols-[100px_1fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="unit-number">{t("units.number")}</Label>
          <Input
            id="unit-number"
            name="number"
            type="number"
            min={1}
            required
            className="tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit-title-en">{t("units.titleEn")}</Label>
          <Input id="unit-title-en" name="titleEn" required maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit-title-vi">{t("units.titleVi")}</Label>
          <Input id="unit-title-vi" name="titleVi" maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit-desc-en">{t("units.descEn")}</Label>
          <Textarea id="unit-desc-en" name="descEn" rows={2} maxLength={500} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit-desc-vi">{t("units.descVi")}</Label>
          <Textarea id="unit-desc-vi" name="descVi" rows={2} maxLength={500} />
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-bold text-destructive">
          {te(error)}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={pending} className="rounded-[14px]">
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
