"use client";

interface Props {
  attempts: number;
  allCorrect: boolean;
  frozen: boolean;
  canHint: boolean;
  onCheck: () => void;
  onNext: () => void;
  onSkip: () => void;
  onHint: () => void;
}

/** STUB T1 → FULL T3: Skip/Hint trái — Check/Câu tiếp phải. */
export const LessonActions: React.FC<Props> = () => null;
