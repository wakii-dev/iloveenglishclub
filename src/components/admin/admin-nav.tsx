"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "cn";

/**
 * Active rule item "Từ vựng" (VU-43 SF-2 t1): prefix `/admin/vocabulary`
 * TRỪ `/admin/vocabulary/crawl` — item Crawl (href `/admin/vocabulary/crawl`)
 * tranh prefix, xử lý explicit + unit test. Pure leg để test không DOM.
 */
export function adminVocabularyNavActive(pathname: string): boolean {
  return (
    pathname.startsWith("/admin/vocabulary") &&
    !pathname.startsWith("/admin/vocabulary/crawl")
  );
}

/** Pure leg chung: dashboard khớp chính xác, Từ vựng theo rule riêng, còn lại prefix. */
export function adminNavActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/vocabulary") return adminVocabularyNavActive(pathname);
  return pathname.startsWith(href);
}

/**
 * Nav /admin (SF-5) — client component để active state theo pathname.
 * Messages qua NextIntlClientProvider locale="vi" của admin layout.
 * VU-43 SF-2: item "Từ vựng" giữa Books và Crawl — label từ
 * vocabCmsCommon.nav (SF-1 skeleton; admin.json KHÔNG đụng — boundary).
 */
export function AdminNav() {
  const t = useTranslations("admin.nav");
  const tv = useTranslations("vocabCmsCommon.nav");
  const pathname = usePathname();

  const items = [
    { href: "/admin", label: t("dashboard") },
    { href: "/admin/books", label: t("books") },
    { href: "/admin/vocabulary", label: tv("vocabulary") },
    { href: "/admin/vocabulary/crawl", label: t("crawl") },
    { href: "/admin/users", label: t("users") },
  ];

  return (
    <nav aria-label="Admin" className="flex items-center gap-1">
      {items.map((item) => {
        const active = adminNavActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-[12px] px-3 py-1.5 text-[13px] font-bold transition-colors focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2",
              active
                ? "bg-muted text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
