import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { HubTab } from "@/lib/vocabulary/hub-status";

/**
 * Tab strip hub (SF-2 t-2.2) — chip Tổng quan (SF-1) thành link chuyển tab
 * qua searchParams ?tab= (server re-render, cùng nhánh GET-filter). Guest:
 * Tổng quan cần đăng nhập → link login ?next (next prefix locale tường minh —
 * i18n Link chỉ localize pathname, không đụng query); Review/Quiz chưa có
 * (SF-3) → giữ chip "sắp có" như SF-1.
 */
export function HubTabs({
  active,
  loggedIn,
}: {
  active: HubTab;
  loggedIn: boolean;
}) {
  const t = useTranslations("vocabulary");
  const locale = useLocale();
  const items: { key: HubTab; href: string; comingSoon: boolean }[] = [
    {
      key: "overview",
      href: loggedIn
        ? "/vocabulary"
        : `/${locale}/login?next=/${locale}/vocabulary`,
      comingSoon: false,
    },
    { key: "library", href: "/vocabulary?tab=library", comingSoon: false },
    { key: "review", href: "/vocabulary?tab=review", comingSoon: true },
    { key: "quiz", href: "/vocabulary?tab=quiz", comingSoon: true },
  ];

  return (
    <ol className="mt-6 flex w-fit flex-wrap items-center gap-1.5 rounded-[18px] border-2 border-border bg-card p-1.5">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <li key={item.key} aria-current={isActive ? "page" : undefined}>
            <Link
              href={item.href}
              className={`flex items-center gap-1.5 rounded-[12px] px-3 py-1.5 text-[13px] font-bold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t(`hub.tabs.${item.key}`)}
              {!isActive && item.comingSoon ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                  {t("hub.comingSoon")}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
