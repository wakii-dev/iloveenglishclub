"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * LevelPathCarousel — LevelPath §2.3 phiên bản slide (user request 2026-09-29):
 * viewport snap-x + nút ‹ › scroll theo trang + progress bar. Cells co giãn
 * theo perView (4/3/2/1 theo width viewport, ResizeObserver); items-stretch
 * → mọi card CAO BẰNG NHAU. Touch swipe native giữ nguyên (scroll-snap).
 */
const arrowClass =
  "flex size-10 items-center justify-center rounded-full border-2 border-border bg-card text-foreground " +
  "transition-[transform,border-color,opacity,box-shadow] duration-[80ms] hover:border-primary " +
  "active:translate-y-[2px] disabled:pointer-events-none disabled:opacity-35 " +
  "focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2";

export function LevelPathCarousel({ children }: { children: React.ReactNode[] }) {
  const t = useTranslations("home.levels");
  const viewportRef = useRef<HTMLDivElement>(null);
  const [perView, setPerView] = useState(4);
  const [progress, setProgress] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  // perView theo width viewport — 4 desktop / 3 tablet / 2 mobile lớn / 1 mobile
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      setPerView(w >= 1024 ? 4 : w >= 768 ? 3 : w >= 480 ? 2 : 1);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const updateState = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const p = max > 0 ? el.scrollLeft / max : 0;
    setProgress(p);
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    updateState();
    window.addEventListener("resize", updateState);
    return () => window.removeEventListener("resize", updateState);
  }, [updateState]);

  const slide = (dir: 1 | -1) => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  const count = children.length;

  return (
    <div className="relative mt-8">
      {/* đường nối dashed giữa các head band (§2.3) — overlay, card trượt qua trên nó */}
      <div
        aria-hidden
        className="absolute top-16 right-0 left-0 border-t-[3px] border-dashed border-border"
      />
      <div
        ref={viewportRef}
        onScroll={updateState}
        className="relative overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-smooth"
      >
        <div className="flex items-stretch gap-[18px]">
          {children.map((child, i) => (
            <div
              key={i}
              className="flex snap-start shrink-0"
              style={{ width: `calc((100% - ${(perView - 1) * 18}px) / ${perView})` }}
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      {/* controls — ‹ › + progress bar (cam kết slide, thay scrollbar) */}
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label={t("prev")}
          disabled={!canPrev}
          onClick={() => slide(-1)}
          className={arrowClass}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div
          aria-hidden
          className="h-1.5 w-40 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-secondary transition-[width] duration-200"
            style={{ width: `${Math.max(8, progress * 100)}%` }}
          />
        </div>
        <button
          type="button"
          aria-label={t("next")}
          disabled={!canNext}
          onClick={() => slide(1)}
          className={arrowClass}
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {t("position", { current: Math.round(progress * (count - 1)) + 1, count })}
      </span>
    </div>
  );
}
