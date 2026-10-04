"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { STUDY_WORDS_PER_DAY } from "@/lib/vocabulary/study-plan";

/**
 * Nút "Bắt đầu học sách này" (story vocabulary-learn t-1.2) — POST
 * /api/vocabulary/study-book bulk seed lộ trình 5 từ/ngày (idempotent —
 * chạy lại không đè SRS state). 401 (guest) → redirect login kèm ?next quay
 * lại trang sách (pattern server me/page). added=0 → báo "đã trong lộ
 * trình"; lỗi → giữ nút + alert mềm.
 */
export function BookStudyButton({
  bookId,
  locale,
  nextPath,
}: {
  bookId: number;
  locale: string;
  nextPath: string;
}) {
  const t = useTranslations("vocabulary");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const [already, setAlready] = useState(false);
  const [error, setError] = useState(false);

  async function start() {
    setPending(true);
    setError(false);
    try {
      const res = await fetch("/api/vocabulary/study-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: bookId }),
      });
      if (res.status === 401) {
        router.push(
          `/${locale}/login?next=${encodeURIComponent(nextPath)}`,
        );
        return;
      }
      if (!res.ok) throw new Error(`study-book POST ${res.status}`);
      const json = (await res.json()) as { ok: boolean; added: number };
      if (!json.ok) throw new Error("study-book not ok");
      if (json.added === 0) {
        setAlready(true);
      } else {
        setAdded(json.added);
      }
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  if (added !== null) {
    return (
      <p
        role="status"
        className="rounded-[14px] border-2 border-border bg-muted/50 px-4 py-3 text-[14px] font-semibold"
      >
        {t("bookStudy.added", { count: added, perDay: STUDY_WORDS_PER_DAY })}
      </p>
    );
  }

  return (
    <div>
      <Button
        type="button"
        onClick={start}
        disabled={pending}
        className="cursor-pointer"
      >
        {pending ? t("bookStudy.pending") : t("bookStudy.cta")}
      </Button>
      {already ? (
        <p
          role="status"
          className="mt-2 text-[13.5px] font-semibold text-muted-foreground"
        >
          {t("bookStudy.already")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[13.5px] font-semibold text-destructive">
          {t("bookStudy.error")}
        </p>
      ) : null}
    </div>
  );
}
