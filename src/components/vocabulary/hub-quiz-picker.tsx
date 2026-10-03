"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Picker phạm vi quiz tổng (SF-3 t-3.2) — client thuần, state local: radio
 * 3 lựa chọn (tất cả / 1 sách / nhiều sách), sách chọn qua Select (1) hoặc
 * checkbox (nhiều). "Bắt đầu" đẩy URL GET-filter ?tab=quiz&scope=… (server
 * re-render sinh đề — cùng nhánh filter 2 tab kia, nút disable khi lựa chọn
 * chưa đủ).
 */

type ScopeKind = "all" | "book" | "multi";

const KINDS: readonly ScopeKind[] = ["all", "book", "multi"];

export function HubQuizPicker({
  books,
}: {
  books: { id: number; title: string }[];
}) {
  const t = useTranslations("vocabulary");
  const router = useRouter();
  const [kind, setKind] = useState<ScopeKind>("all");
  const [bookId, setBookId] = useState("");
  const [picked, setPicked] = useState<number[]>([]);

  const ready =
    kind === "all" ||
    (kind === "book" && bookId !== "") ||
    (kind === "multi" && picked.length > 0);

  function toggleBook(id: number) {
    setPicked((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function start() {
    if (!ready) return;
    const params = new URLSearchParams({ tab: "quiz", scope: kind });
    if (kind === "book") params.set("book", bookId);
    if (kind === "multi") params.set("books", picked.join(","));
    router.push(`/vocabulary?${params.toString()}`);
  }

  return (
    <section
      aria-labelledby="quiz-picker-heading"
      className="mt-6 rounded-[18px] border-2 border-border bg-card p-6"
    >
      <h2 id="quiz-picker-heading" className="font-display text-[20px] font-bold">
        {t("hub.quiz.pickerTitle")}
      </h2>

      <fieldset className="mt-4 grid gap-2.5">
        <legend className="sr-only">{t("hub.quiz.pickerTitle")}</legend>
        {KINDS.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2.5 rounded-[12px] px-1 py-1 text-[14.5px] font-semibold transition-colors duration-150 hover:bg-muted"
          >
            <input
              type="radio"
              name="quiz-scope"
              value={option}
              checked={kind === option}
              onChange={() => setKind(option)}
              className="size-4 cursor-pointer accent-primary"
            />
            <span>
              {t(`hub.quiz.scope.${option}`)}
              <span className="block text-[12.5px] font-medium text-muted-foreground">
                {t(`hub.quiz.scope.${option}Hint`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {kind === "book" ? (
        <div className="mt-4">
          <Select value={bookId} onValueChange={setBookId}>
            <SelectTrigger
              aria-label={t("hub.quiz.bookSelect")}
              className="w-[260px] bg-card"
            >
              <SelectValue placeholder={t("hub.quiz.bookPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {books.map((book) => (
                <SelectItem key={book.id} value={String(book.id)}>
                  {book.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {kind === "multi" ? (
        <fieldset className="mt-4 grid gap-1.5 sm:grid-cols-2">
          <legend className="sr-only">{t("hub.quiz.scope.multi")}</legend>
          {books.map((book) => (
            <label
              key={book.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-[12px] px-1 py-1 text-[13.5px] font-semibold transition-colors duration-150 hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={picked.includes(book.id)}
                onChange={() => toggleBook(book.id)}
                className="size-4 cursor-pointer accent-primary"
              />
              {book.title}
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="mt-5">
        <button
          type="button"
          onClick={start}
          disabled={!ready}
          className={buttonVariants()}
        >
          {t("hub.quiz.start")}
        </button>
      </div>
    </section>
  );
}
