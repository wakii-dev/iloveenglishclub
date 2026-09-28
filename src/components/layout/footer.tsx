import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("common");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-6 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{t("appName")}</p>
        <p>{t("footer.tagline")}</p>
        <p>
          © {year} {t("appName")}. {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}
