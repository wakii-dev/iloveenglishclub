import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LEVEL_LABELS = [
  "Level 1 — Starter",
  "Level 2",
  "Level 3",
  "Level 4",
  "Level 5",
  "Level 6",
  "Level 7 — B2",
];

/**
 * §2.6 Footer — bg card, border-t-2, grid 1.6fr_1fr_1fr_1fr.
 * Cột Levels liệt kê 7 level dạng text — thành link khi SF-2 tạo route
 * /books/[slug] (tránh dead links ở bản nền tảng).
 */
export function Footer() {
  const t = useTranslations("common");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t-2 bg-card">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-8 px-6 py-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-8 -rotate-6 items-center justify-center rounded-[11px] bg-primary"
            >
              <Heart className="size-[18px] fill-primary-foreground text-primary-foreground" />
            </span>
            <span className="font-display text-[17px] font-bold">
              I Love English <span className="text-primary">Club</span>
            </span>
          </span>
          <p className="text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-[12.5px] font-extrabold uppercase tracking-[0.06em]">
            {t("footer.levels")}
          </h4>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {LEVEL_LABELS.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-[12.5px] font-extrabold uppercase tracking-[0.06em]">
            {t("footer.learn")}
          </h4>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            <li>
              <Link href="/" className="hover:text-primary">
                {t("footer.method")}
              </Link>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-[12.5px] font-extrabold uppercase tracking-[0.06em]">
            {t("footer.support")}
          </h4>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            <li>{t("footer.contact")}</li>
          </ul>
        </div>
      </div>

      <div className="border-t-2">
        <div className="mx-auto flex max-w-[1120px] flex-col items-center justify-between gap-1 px-6 py-4 text-center text-[13px] text-muted-foreground sm:flex-row sm:text-left">
          <p>
            © {year} {t("appName")}. {t("footer.rights")}
          </p>
          <p className="font-semibold">
            {routing.locales.map((l) => t(`locale.${l}`)).join(" / ")} ·{" "}
            {t("footer.steps")}
          </p>
        </div>
      </div>
    </footer>
  );
}
