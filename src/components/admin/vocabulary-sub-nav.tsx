"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "cn";

/**
 * Sub-nav 3 tab khối vocabulary CMS (VU-43 SF-1 task 13 — shared tier-0, SF-2/
 * SF-3/SF-4 CHỈ render, KHÔNG sửa): Catalog `/admin/vocabulary` | Curation
 * `/admin/vocabulary/curation` | Stats `/admin/vocabulary/stats`. Active theo
 * pathname CHÍNH XÁC (không prefix — chống double-active với crawl VU-32, test
 * e2e nav thuộc SF-2). Labels từ vocabCmsCommon (SF-1 skeleton).
 */

export const VOCABULARY_TABS = [
  { key: "catalog", href: "/admin/vocabulary" },
  { key: "curation", href: "/admin/vocabulary/curation" },
  { key: "stats", href: "/admin/vocabulary/stats" },
] as const;

export type VocabularyTabKey = (typeof VOCABULARY_TABS)[number]["key"];

/** Pure leg (unit test): tab active chỉ khi pathname === href chính xác. */
export function activeVocabularyTab(
  pathname: string,
): VocabularyTabKey | null {
  const found = VOCABULARY_TABS.find((tab) => tab.href === pathname);
  return found?.key ?? null;
}

export function VocabularySubNav() {
  const t = useTranslations("vocabCmsCommon.tabs");
  const pathname = usePathname();
  const active = activeVocabularyTab(pathname);

  return (
    <nav
      aria-label="Vocabulary CMS"
      className="flex items-center gap-1 border-b-2 pb-3"
    >
      {VOCABULARY_TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-[12px] px-3 py-1.5 text-[13px] font-bold transition-colors focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2",
              isActive
                ? "bg-muted text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
