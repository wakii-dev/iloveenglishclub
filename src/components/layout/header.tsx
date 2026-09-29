import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * §2.1 SiteHeader — hand-off "Classroom Warm": sticky 64px, backdrop-blur,
 * bg color-mix(background 90%), border-b-2. Brand mark 32px xoay -6° + heart.
 * Nav: Home + Levels (SF-2 wire route /books — sticky RSC nên chưa có
 * active-state theo route; cần client pathname hook thì tách SF sau).
 */
export function Header() {
  const t = useTranslations("common");

  return (
    <header className="sticky top-0 z-40 border-b-2 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 -rotate-6 items-center justify-center rounded-[11px] bg-primary"
          >
            <Heart className="size-[18px] fill-primary-foreground text-primary-foreground" />
          </span>
          <span className="font-display text-[17px] font-bold">
            I Love English <span className="text-primary">Club</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link
            href="/"
            className="rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-primary"
          >
            {t("nav.home")}
          </Link>
          <Link
            href="/books"
            className="rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-primary"
          >
            {t("nav.levels")}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
