import { getTranslations } from "next-intl/server";
import { HeartCrack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * 404 theo direction B (user 2026-09-29): worksheet card 24px + shadow đặc,
 * Baloo "404" lớn màu coral, heart-crack mark. Đặt trong [locale] — middleware
 * luôn prefix locale nên mọi path lạ đều rơi vào đây với locale đúng.
 */
export default async function NotFoundPage() {
  const t = await getTranslations("errors.notFound");

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[560px] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <HeartCrack className="size-8 text-primary" aria-hidden />
      </div>
      <p
        aria-hidden
        className="mt-6 font-display text-[88px] leading-none font-bold tracking-tight text-primary/25 select-none"
      >
        {t("code")}
      </p>
      <h1 className="-mt-4 font-display text-[28px] font-bold">
        {t("title")}
      </h1>
      <p className="mt-3 max-w-[42ch] text-[15.5px] leading-relaxed font-semibold text-muted-foreground">
        {t("desc")}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button
          size="lg"
          asChild
          className="rounded-[14px] text-[15px] font-extrabold shadow-[0_4px_0_var(--primary-deep)] transition-[transform,box-shadow] duration-[80ms] hover:brightness-105 active:translate-y-[3px] active:shadow-[0_1px_0_var(--primary-deep)]"
        >
          <Link href="/">{t("backHome")}</Link>
        </Button>
        <Button size="lg" variant="ghost" asChild className="rounded-[14px] text-[15px] font-extrabold">
          <Link href="/books">{t("browseLevels")}</Link>
        </Button>
      </div>
    </div>
  );
}
