"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminUnitRow } from "@/lib/admin/queries";
import {
  deleteUnitAction,
  updateUnitAction,
} from "@/lib/actions/admin/units";

/**
 * Hành động trên 1 unit (SF-5): sửa tiêu đề/mô tả (dialog) + xóa (confirm;
 * lỗi 23503 → toast giải thích RESTRICT). Số unit KHÔNG sửa được (audio path).
 */
export function UnitRowActions({ unit }: { unit: AdminUnitRow }) {
  const t = useTranslations("admin");
  const tc = useTranslations("admin.common");
  const te = useTranslations("admin.errors");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function saveEdit(formData: FormData) {
    startTransition(async () => {
      const result = await updateUnitAction(unit.id, {
        titleEn: String(formData.get("titleEn") ?? ""),
        titleVi: String(formData.get("titleVi") ?? ""),
        descEn: String(formData.get("descEn") ?? ""),
        descVi: String(formData.get("descVi") ?? ""),
      });
      if (result?.error) {
        toast.error(te(result.error));
        return;
      }
      setEditing(false);
      toast.success(tc("save"));
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(t("units.deleteConfirm"))) return;
    startTransition(async () => {
      const result = await deleteUnitAction(unit.id);
      if (result?.error) {
        toast.error(te(result.error));
        return;
      }
      toast.success(tc("delete"));
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={tc("edit")}
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={pending}
        onClick={remove}
      >
        {tc("delete")}
      </Button>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              {t("units.title")} {unit.number}
            </DialogTitle>
          </DialogHeader>
          <form action={saveEdit} className="space-y-3">
            <input type="hidden" name="unitId" value={unit.id} />
            <div className="space-y-1.5">
              <Label htmlFor={`unit-number-ro-${unit.id}`}>
                {t("units.number")}
              </Label>
              <Input
                id={`unit-number-ro-${unit.id}`}
                value={unit.number}
                readOnly
                disabled
                title={t("units.numberImmutable")}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`unit-title-en-${unit.id}`}>
                {t("units.titleEn")}
              </Label>
              <Input
                id={`unit-title-en-${unit.id}`}
                name="titleEn"
                defaultValue={unit.titleEn}
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`unit-title-vi-${unit.id}`}>
                {t("units.titleVi")}
              </Label>
              <Input
                id={`unit-title-vi-${unit.id}`}
                name="titleVi"
                defaultValue={unit.titleVi ?? ""}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`unit-desc-en-${unit.id}`}>
                {t("units.descEn")}
              </Label>
              <Textarea
                id={`unit-desc-en-${unit.id}`}
                name="descEn"
                defaultValue={unit.descEn ?? ""}
                rows={2}
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`unit-desc-vi-${unit.id}`}>
                {t("units.descVi")}
              </Label>
              <Textarea
                id={`unit-desc-vi-${unit.id}`}
                name="descVi"
                defaultValue={unit.descVi ?? ""}
                rows={2}
                maxLength={500}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={pending} className="rounded-[14px]">
                {pending ? tc("saving") : tc("save")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                {tc("cancel")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
