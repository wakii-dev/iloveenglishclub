"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HUB_STATUSES } from "@/lib/vocabulary/hub-store";

/**
 * Filter tab Tổng quan (SF-1 t-1.2) — 2 select cập nhật URL searchParams
 * (router.push — server re-render, pattern admin/users GET-filter nhưng qua
 * client router). Giá trị mặc định ("all") xoá param để URL gọn.
 */
export function HubFilters({
  books,
  bookId,
  status,
}: {
  books: { id: number; title: string }[];
  bookId: number | null;
  status: string;
}) {
  const t = useTranslations("vocabulary");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(key: "book" | "status", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={bookId !== null ? String(bookId) : "all"}
        onValueChange={(v) => apply("book", v)}
      >
        <SelectTrigger
          aria-label={t("hub.filterBook")}
          className="w-[210px] bg-card"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("hub.filterBookAll")}</SelectItem>
          {books.map((book) => (
            <SelectItem key={book.id} value={String(book.id)}>
              {book.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={(v) => apply("status", v)}>
        <SelectTrigger
          aria-label={t("hub.filterStatus")}
          className="w-[180px] bg-card"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HUB_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`hub.status.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
