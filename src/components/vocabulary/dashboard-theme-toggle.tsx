"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Dark toggle scope vocabulary (VU-37 SF-4 — hand-off §4): class `dark` TRÊN
 * CONTAINER dashboard (id truyền vào) — KHÔNG đụng theme engine toàn app
 * (next-themes/html class giữ nguyên, dictation không đổi). Persist
 * localStorage `ilec.vocab-theme`; áp sau mount (hydration-safe — SSR render
 * light mặc định như hand-off "sáng mặc định").
 */
const THEME_KEY = "ilec.vocab-theme";

export function DashboardThemeToggle({ containerId }: { containerId: string }) {
  const t = useTranslations("vocabulary");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const on = localStorage.getItem(THEME_KEY) === "dark";
    setDark(on);
    document.getElementById(containerId)?.classList.toggle("dark", on);
  }, [containerId]);

  function toggle() {
    const on = !dark;
    setDark(on);
    localStorage.setItem(THEME_KEY, on ? "dark" : "light");
    document.getElementById(containerId)?.classList.toggle("dark", on);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? t("hub.dash.themeToLight") : t("hub.dash.themeToDark")}
      className="grid h-10 w-10 flex-none place-items-center rounded-xl border-[1.5px] border-border bg-card text-muted-foreground hover:bg-accent"
    >
      {dark ? (
        // mặt trời (đang dark — bấm về sáng)
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="block">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <path
            d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"
            stroke="currentColor"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        // trăng (đang sáng — bấm sang tối)
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="block">
          <path
            d="M20.4 14.2A8.3 8.3 0 0 1 9.8 3.6a8.3 8.3 0 1 0 10.6 10.6z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
}
