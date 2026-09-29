"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { changeUserRoleAction } from "@/lib/actions/admin/users";

/**
 * Select đổi role (SF-5 users) — disable với chính mình (chặn server-side
 * nữa ở action); lỗi → toast qua admin.json.
 */
export function UserRoleSelect({
  userId,
  role,
  isSelf,
}: {
  userId: string;
  role: "user" | "admin";
  isSelf: boolean;
}) {
  const t = useTranslations("admin.users");
  const te = useTranslations("admin.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    const value = next === "admin" ? "admin" : "user";
    if (value === role) return;
    startTransition(async () => {
      const result = await changeUserRoleAction(userId, value);
      if (result?.error) {
        toast.error(te(result.error));
        router.refresh();
        return;
      }
      toast.success(t(value === "admin" ? "roleAdmin" : "roleUser"));
      router.refresh();
    });
  }

  return (
    <Select
      value={role}
      onValueChange={change}
      disabled={isSelf || pending}
    >
      <SelectTrigger
        aria-label={t("colRole")}
        className="w-32"
        title={isSelf ? t("selfNote") : undefined}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="user">{t("roleUser")}</SelectItem>
        <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
