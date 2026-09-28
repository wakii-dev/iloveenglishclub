import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * Header skeleton trung tính (shadcn default tokens) — cấu trúc theo spec §3:
 * logo + nav + user menu + locale switch + theme toggle.
 * ⚠ PM gate: visual final theo design hand-off (docs/superpowers/designs/).
 */
export function Header() {
  const t = useTranslations("common");

  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="text-base font-bold tracking-tight">
          {t("appName")}
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            {t("nav.home")}
          </Link>
        </nav>

        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
