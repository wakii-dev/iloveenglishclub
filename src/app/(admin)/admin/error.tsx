"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary cho /admin (user 2026-09-29: server action lỗi ở admin hiện
 * 500 thô — subtree admin nằm NGOÀI [locale] nên không dùng được
 * [locale]/error.tsx). UI tiếng Việt (spec §3 admin ngoài i18n). Hiện digest
 * để report, log đầy đủ ra console.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[560px] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <TriangleAlert className="size-8 text-destructive" aria-hidden />
      </div>
      <div className="mt-6 w-full rounded-[24px] border-2 border-border bg-card p-8 shadow-[0_10px_30px_-18px_color-mix(in_srgb,var(--primary-deep)_35%,transparent)]">
        <h1 className="font-display text-[28px] font-bold text-foreground">
          Có lỗi xảy ra
        </h1>
        <p className="mt-3 text-[15.5px] leading-relaxed font-semibold text-muted-foreground">
          Thao tác chưa hoàn tất. Dữ liệu hiện có vẫn nguyên vẹn — thử lại, hoặc
          tải lại trang.
        </p>
        {error.digest ? (
          <p className="mt-4 text-[12px] font-bold text-muted-foreground/70">
            Mã lỗi:{" "}
            <span className="font-mono font-semibold">{error.digest}</span>
          </p>
        ) : null}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={reset}
            className="rounded-[14px] text-[15px] font-extrabold shadow-[0_4px_0_var(--primary-deep)] transition-[transform,box-shadow] duration-[80ms] hover:brightness-105 active:translate-y-[3px] active:shadow-[0_1px_0_var(--primary-deep)]"
          >
            <RefreshCw aria-hidden />
            Thử lại
          </Button>
          <Button
            size="lg"
            variant="ghost"
            asChild
            className="rounded-[14px] text-[15px] font-extrabold"
          >
            <Link href="/admin">Về dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
