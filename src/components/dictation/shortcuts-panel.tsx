"use client";

import { useState } from "react";
import { Keyboard, X } from "lucide-react";
import { useTranslations } from "next-intl";

/** §3.7 ShortcutsPanel: nút "?" icon keyboard + popover — xem được mọi lúc
 *  trong DICTATION (Tab replay · Enter check/next · Ctrl+Shift+/ hint ·
 *  Esc pause · ←/→ seek ±3s khi không gõ). */
export function ShortcutsPanel() {
  const t = useTranslations("lesson");
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("dictation.shortcuts.open")}
        aria-expanded={open}
        className="grid size-[34px] place-items-center rounded-full border-2 border-border bg-card text-muted-foreground transition-colors duration-150 hover:border-primary hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        {open ? (
          <X aria-hidden className="size-4" />
        ) : (
          <Keyboard aria-hidden className="size-4" />
        )}
      </button>

      {open ? (
        <>
          {/* backdrop bắt click-outside */}
          <div
            aria-hidden
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label={t("dictation.shortcuts.title")}
            className="absolute right-0 top-full z-20 mt-2 w-64 rounded-[18px] border-2 border-border bg-card p-4 shadow-[0_10px_30px_-18px_color-mix(in_srgb,var(--primary-deep)_35%,transparent)]"
          >
            <p className="mb-2 text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
              {t("dictation.shortcuts.title")}
            </p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
              <ShortcutRow keys="Tab" label={t("dictation.shortcuts.replay")} />
              <ShortcutRow keys="Enter" label={t("dictation.shortcuts.enter")} />
              <ShortcutRow keys="Ctrl+Shift+/" label={t("dictation.shortcuts.hintKey")} />
              <ShortcutRow keys="Esc" label={t("dictation.shortcuts.escape")} />
              <ShortcutRow keys="← / →" label={t("dictation.shortcuts.arrows")} />
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <kbd className="rounded-md border-2 border-border bg-muted px-2 py-0.5 font-bold text-foreground">
        {keys}
      </kbd>
    </li>
  );
}
