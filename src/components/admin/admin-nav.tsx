"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "cn";

/**
 * Nav /admin (SF-5) — client component để active state theo pathname.
 * Messages qua NextIntlClientProvider locale="vi" của admin layout.
 */
export function AdminNav() {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();

  const items = [
    { href: "/admin", label: t("dashboard") },
    { href: "/admin/books", label: t("books") },
    { href: "/admin/vocabulary/crawl", label: t("crawl") },
    { href: "/admin/users", label: t("users") },
  ];

  return (
    <nav aria-label="Admin" className="flex items-center gap-1">
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
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
