"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * §2.1 ThemeToggle — icon-btn 34px tròn; §3: default light, persist
 * localStorage, toggle light↔dark (1 nguồn thật ở header).
 */
export function ThemeToggle() {
  const t = useTranslations("common");
  const { resolvedTheme, setTheme } = useTheme();
  // Tránh hydration mismatch: hiển thị icon sau mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={t("header.theme")}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="size-[34px] rounded-full"
    >
      {mounted && isDark ? (
        <Moon className="size-4" />
      ) : (
        <Sun className="size-4" />
      )}
    </Button>
  );
}
