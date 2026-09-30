"use client";

import { useEffect, useRef, useState } from "react";
import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * §3.3 TypePanel — textarea trong viền đứt (design §2.2), mobile accuracy
 * attrs (autoCapitalize/autoCorrect/spellcheck off — ACCEPTANCE #5), Enter =
 * check/next (orchestrator branch — không xuống dòng), paste bị chặn kèm
 * note tạm thời (không Toaster — infra ngoài scope).
 * maxLength 2000 (QA-102): khớp MAX_TYPED_LEN server (submit-attempt.ts) —
 * KHÔNG import được từ "use server" file nên giữ literal; đổi server constant
 * phải đổi cả đây (e2e dictation-store-edge case QA-102 bắt lệch).
 */
const MAX_TYPED_LEN = 2000;

export function TypePanel({ value, onChange, onEnter, readOnly }: Props) {
  const t = useTranslations("lesson");
  const [pasteNote, setPasteNote] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    [],
  );

  return (
    <div className="mt-4 rounded-[16px] border-2 border-dashed border-input bg-[color-mix(in_srgb,var(--muted)_55%,var(--card))]">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_TYPED_LEN}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onEnter();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          setPasteNote(true);
          if (noteTimer.current) clearTimeout(noteTimer.current);
          noteTimer.current = setTimeout(() => setPasteNote(false), 2000);
        }}
        placeholder={t("dictation.input.placeholder")}
        aria-label={t("dictation.input.aria")}
        readOnly={readOnly}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="min-h-[120px] w-full resize-y rounded-[16px] bg-transparent p-4 text-[15.5px] leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground"
      />
      {pasteNote ? (
        <p
          role="status"
          className="flex items-center gap-1.5 px-4 pb-3 text-[12.5px] font-bold text-destructive"
        >
          <Ban aria-hidden className="size-3.5" />
          {t("dictation.input.pasteBlocked")}
        </p>
      ) : null}
    </div>
  );
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  readOnly: boolean;
}
