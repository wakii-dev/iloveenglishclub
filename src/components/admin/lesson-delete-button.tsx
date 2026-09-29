"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteLessonAction } from "@/lib/actions/admin/lessons";

/** Nút xóa lesson (SF-5) — confirm + toast lỗi 23503 (RESTRICT attempts). */
export function LessonDeleteButton({ lessonId }: { lessonId: number }) {
  const t = useTranslations("admin");
  const tc = useTranslations("admin.common");
  const te = useTranslations("admin.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm(t("lessons.deleteConfirm"))) return;
    startTransition(async () => {
      const result = await deleteLessonAction(lessonId);
      if (result?.error) {
        toast.error(te(result.error));
        return;
      }
      toast.success(tc("delete"));
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={remove}
    >
      {tc("delete")}
    </Button>
  );
}
