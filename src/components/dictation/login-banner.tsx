"use client";

import { LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** §3.11 LoginBanner (§5.8 — guest): "đăng nhập để lưu" + link /login rõ. */
export function LoginBanner({ className }: { className?: string }) {
  const t = useTranslations("lesson");

  return (
    <div
      className={
        className ??
        "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border-2 border-border bg-card px-5 py-4"
      }
    >
      <p className="m-0 text-[14.5px] font-bold">
        {t("dictation.banner.login")}
        <span className="ml-2 font-semibold text-muted-foreground">
          {t("dictation.banner.ephemeral")}
        </span>
      </p>
      <Link
        href="/login"
        className="inline-flex items-center gap-2 rounded-[14px] border-2 border-border bg-card px-4 py-2 text-[14px] font-extrabold text-primary transition-colors duration-150 hover:border-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <LogIn aria-hidden className="size-4" />
        {t("dictation.banner.loginCta")}
      </Link>
    </div>
  );
}
