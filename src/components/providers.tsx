"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider, useTheme } from "next-themes";
import { UiKitProvider } from "@wakii/ui-kit";
import { SessionSync } from "./session-sync";

/**
 * Adapter next-themes → wakii theming: wakii UiKitProvider (ThemeModes) tự đọc
 * attr `data-bp-theme` trên tổ tiên (MutationObserver trên <html>), còn
 * next-themes điều khiển bằng class `dark` — mirror resolvedTheme sang attr
 * để 2 hệ cùng trạng thái, next-themes vẫn là nguồn sự thật.
 */
function BpThemeSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") root.setAttribute("data-bp-theme", "dark");
    else root.removeAttribute("data-bp-theme");
  }, [resolvedTheme]);
  return null;
}

/**
 * ThemeTokens wakii trỏ về CSS var sẵn có của ilec — màu thương hiệu ilec giữ
 * nguyên cảm giác, tự đảo theo `.dark` (var resolve lúc dùng). Radius map giữ
 * thang 16px của ilec (default wakii 8/12 sẽ làm card/navigation mất rounded).
 */
const ILEC_TOKENS = {
  canvas: "var(--background)",
  s1: "var(--card)",
  s2: "var(--card)",
  s3: "var(--muted)",
  accent: "var(--primary)",
  accentHi: "var(--primary-deep)",
  ink: "var(--foreground)",
  ink2: "var(--muted-foreground)",
  ink3: "var(--dim)",
  line: "var(--border)",
  done: "var(--success)",
  doing: "var(--secondary)",
  fail: "var(--destructive)",
  radiusLg: "var(--radius)",
  radiusXl: "calc(var(--radius) + 4px)",
  radiusPill: "9999px",
  font: "var(--font-body)",
} as const;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionSync />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        disableTransitionOnChange
      >
        <BpThemeSync />
        {/* ThemeModes (2 key cùng mapping) → provider tự theo data-bp-theme,
            đồng thời giữ hành vi theo-mode cho các token không override. */}
        <UiKitProvider theme={{ light: { ...ILEC_TOKENS }, dark: { ...ILEC_TOKENS } }}>
          {children}
        </UiKitProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
