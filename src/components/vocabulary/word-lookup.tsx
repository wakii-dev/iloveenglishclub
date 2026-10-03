"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { WordPlayButton } from "@/components/content/word-play-button";
import {
  normalizeLookupToken,
  tokenizeWords,
} from "@/lib/vocabulary/word-tokenize";

/**
 * Click-word lookup trên nội dung sách (SF-5 t-5.2) — bấm 1 từ trong transcript
 * → gọi /api/vocabulary/lookup → popover nghĩa/IPA/audio (WordPlayButton SF-2).
 * Text render qua tokenizer PURE (plain text, không đụng markup); 404 → thông
 * báo "chưa có trong bộ từ vựng"; đóng khi click ngoài / Escape; lookup mới
 * abort request cũ (debounce-in-flight). disabled (câu đang khoá) → text thuần.
 */

type LookupHit = {
  word: string;
  ipa: string | null;
  meaning_vi: string;
  example: string | null;
  audio_url: string | null;
};

type LookupResult =
  | { status: "loading" }
  | { status: "hit"; data: LookupHit }
  | { status: "miss" }
  | { status: "error" };

type OpenState = { token: string; left: number; top: number };

export function WordLookupText({
  text,
  bookId,
  disabled = false,
}: {
  text: string;
  bookId: number;
  disabled?: boolean;
}) {
  const t = useTranslations("vocabulary");
  const [open, setOpen] = useState<OpenState | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setOpen(null);
    setResult(null);
  }, []);

  // dọn request khi unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  // đóng khi click ngoài / Escape — chỉ gắn khi popover mở
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const openLookup = (token: string, rect: DOMRect) => {
    const word = normalizeLookupToken(token);
    if (word === "") return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // card ~280px — kẹp mép phải viewport (dịch chuyển thô, đủ dùng)
    const left = Math.min(Math.max(rect.left, 150), window.innerWidth - 150);
    setOpen({ token, left, top: rect.bottom + 8 });
    setResult({ status: "loading" });
    fetch(
      `/api/vocabulary/lookup?word=${encodeURIComponent(word)}&bookId=${bookId}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as LookupHit;
          setResult({ status: "hit", data });
        } else if (res.status === 404) {
          setResult({ status: "miss" });
        } else {
          setResult({ status: "error" });
        }
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === "AbortError") return;
        setResult({ status: "error" });
      });
  };

  if (disabled) return <>{text}</>;

  return (
    <>
      {tokenizeWords(text).map((token, i) =>
        token.kind === "sep" ? (
          token.text
        ) : (
          <button
            key={i}
            type="button"
            onClick={(e) => openLookup(token.text, e.currentTarget.getBoundingClientRect())}
            className="cursor-pointer underline decoration-dotted decoration-border underline-offset-4 transition-colors duration-150 hover:text-primary hover:decoration-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            {token.text}
          </button>
        ),
      )}

      {open ? (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={t("lookupAria", { word: open.token })}
          className="fixed z-50 w-[280px] -translate-x-1/2 rounded-[18px] border-2 border-border bg-card p-4 shadow-[0_10px_30px_-18px_color-mix(in_srgb,var(--primary-deep)_35%,transparent)]"
          style={{ left: open.left, top: open.top }}
        >
          {result?.status === "loading" ? (
            <p className="text-[13.5px] font-semibold text-muted-foreground">
              {t("lookupLoading")}
            </p>
          ) : null}
          {result?.status === "miss" ? (
            <p className="text-[13.5px] font-semibold text-muted-foreground">
              {t("lookupMiss")}
            </p>
          ) : null}
          {result?.status === "error" ? (
            <p className="text-[13.5px] font-semibold text-destructive">
              {t("lookupError")}
            </p>
          ) : null}
          {result?.status === "hit" ? (
            <>
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-display text-[16.5px] font-bold">
                      {result.data.word}
                    </span>
                    {result.data.ipa ? (
                      <span className="text-[13px] font-semibold text-muted-foreground">
                        /{result.data.ipa}/
                      </span>
                    ) : null}
                  </span>
                </span>
                {result.data.audio_url ? (
                  <WordPlayButton
                    word={result.data.word}
                    audioUrl={result.data.audio_url}
                  />
                ) : null}
              </div>
              <p className="mt-1 text-[13.5px] font-semibold">
                {result.data.meaning_vi}
              </p>
              {result.data.example ? (
                <p className="mt-1 text-[13px] text-muted-foreground italic">
                  {result.data.example}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
