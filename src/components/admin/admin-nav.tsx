"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

/**
 * Nav /admin — client component để active state theo pathname.
 * ilec gốc đọc label qua next-intl (NextIntlClientProvider locale="vi" của
 * admin layout) — v2 bỏ i18n cho subtree admin: label hard-code tiếng Việt
 * (UI admin cố định VI, đúng catalog messages/vi/admin.json).
 *
 * SF4 migrate: thêm item "Từ vựng" + "Crawl Oxford" (vocabulary cluster +
 * oxford crawl thuộc phạm vi SF4). Active rule item "Từ vựng" (VU-43 SF-2
 * t1): prefix `/admin/vocabulary` TRỪ `/admin/vocabulary/crawl` — item Crawl
 * (href `/admin/vocabulary/crawl`) tranh prefix, xử lý explicit + unit test
 * (admin-nav.test.ts). Pure leg để test không DOM.
 */

/** Rule riêng item "Từ vựng": prefix /admin/vocabulary nhưng KHÔNG /crawl. */
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

const ITEMS = [
  { href: "/admin", label: "Tổng quan" },
  { href: "/admin/books", label: "Sách" },
  { href: "/admin/vocabulary", label: "Từ vựng" },
  { href: "/admin/vocabulary/crawl", label: "Crawl Oxford" },
  { href: "/admin/users", label: "Người dùng" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex items-center gap-1">
      {ITEMS.map((item) => {
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
