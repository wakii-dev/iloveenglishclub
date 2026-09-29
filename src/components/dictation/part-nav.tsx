"use client";

interface Props {
  current: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

/** STUB T1 → FULL T4: progress + ‹ Part n/m › (thuần điều hướng). */
export const PartNav: React.FC<Props> = () => null;
