import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * §2.6 Footer — bg card, border-t-2, grid 1.6fr_1fr_1fr_1fr.
 * Cột Levels: 7 link /books/[slug] (SF-2 wire). Slug `level-1..7` là contract
 * với seed — đổi slug phải đổi cả 2. Label giữ EN hardcode từ SF-1 (tên proper
 * noun; localize theo title_vi là việc của SF sau nếu cần).
 */
const LEVELS = [
  { slug: "level-1", label: "Level 1 — Starter" },
  { slug: "level-2", label: "Level 2" },
  { slug: "level-3", label: "Level 3" },
  { slug: "level-4", label: "Level 4" },
  { slug: "level-5", label: "Level 5" },
  { slug: "level-6", label: "Level 6" },
  { slug: "level-7", label: "Level 7 — B2" },
];
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
          <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.06em]">
            {t("footer.levels")}
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {LEVELS.map((level) => (
              <li key={level.slug}>
                <Link href={`/books/${level.slug}`} className="hover:text-primary">
                  {level.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.06em]">
            {t("footer.learn")}
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            <li>
              <Link href="/" className="hover:text-primary">
                {t("footer.method")}
              </Link>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.06em]">
            {t("footer.support")}
          </h2>
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
