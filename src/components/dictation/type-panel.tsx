"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  readOnly: boolean;
}

/** STUB T1 → FULL T3: textarea Enter=check, paste-block, mobile attrs. */
export const TypePanel: React.FC<Props> = () => (
  <div className="mt-4 rounded-[16px] border-2 border-dashed border-input bg-card p-4 text-center text-[13px] font-bold text-muted-foreground">
    [type panel — T3]
  </div>
);
