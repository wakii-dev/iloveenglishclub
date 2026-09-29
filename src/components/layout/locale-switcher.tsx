"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "cn";

/**
 * §2.1 LocaleSwitch — pill EN|VI (ToggleGroup style, rounded-full),
 * active = bg-secondary text-secondary-foreground. Switch = đổi route locale.
 */
export function LocaleSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: string) {
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div
      role="group"
      aria-label={t("header.language")}
      className={cn(
        "flex items-center rounded-full border-2 border-border bg-card p-0.5",
        isPending && "opacity-60",
      )}
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          disabled={l === locale || isPending}
          aria-pressed={l === locale}
          className={cn(
            "rounded-full px-2.5 py-1 text-[12px] font-extrabold uppercase tracking-wide transition-colors duration-150",
            l === locale
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
