"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HUB_STATUSES, type LibraryFilters } from "@/lib/vocabulary/hub-status";

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Filter tab Thư viện (SF-2 t-2.2) — search input debounce 350ms + 3 select
 * (book/audio/status), cập nhật URL searchParams qua router.push (server
 * re-render — pattern HubFilters, đọc URL lúc click qua window.location vì
 * useSearchParams stale giữa 2 push liên tiếp). Đổi filter luôn xoá param
 * page (về trang 1). Status chỉ hiện cho user đăng nhập (guest không có SRS).
 */
export function LibraryFilters({
  books,
  filter,
  showStatus,
}: {
  books: { id: number; title: string }[];
  filter: LibraryFilters;
  showStatus: boolean;
}) {
  const t = useTranslations("vocabulary");
  const router = useRouter();
  const pathname = usePathname();
  const [term, setTerm] = useState(filter.search);

  // đọc window.location lúc click (useSearchParams stale giữa 2 push liên tiếp)
  const apply = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(window.location.search);
      if (value === "") params.delete(key);
      else params.set(key, value);
      params.delete("page"); // đổi filter → về trang 1
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  // debounce search — chỉ push khi term thật sự khác giá trị đang hiển thị
  useEffect(() => {
    if (term === filter.search) return;
    const id = setTimeout(
      () => apply("search", term.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(id);
  }, [term, filter.search, apply]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder={t("hub.library.searchPlaceholder")}
        aria-label={t("hub.library.searchLabel")}
        className="w-[240px] bg-card"
      />
      <Select
        value={filter.bookId !== null ? String(filter.bookId) : "all"}
        onValueChange={(v) => apply("book", v === "all" ? "" : v)}
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
      <Select
        value={filter.hasAudio ? "with" : "all"}
        onValueChange={(v) => apply("audio", v === "with" ? "1" : "")}
      >
        <SelectTrigger
          aria-label={t("hub.library.filterAudio")}
          className="w-[170px] bg-card"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("hub.library.filterAudioAll")}</SelectItem>
          <SelectItem value="with">{t("hub.library.filterAudioWith")}</SelectItem>
        </SelectContent>
      </Select>
      {showStatus ? (
        <Select
          value={filter.status}
          onValueChange={(v) => apply("status", v === "all" ? "" : v)}
        >
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
      ) : null}
    </div>
  );
}
