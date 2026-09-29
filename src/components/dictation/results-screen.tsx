"use client";

interface Props {
  name: string | null;
  isGuest: boolean;
  nextHref: string | null;
  unitHref: string;
  onTryAgain: () => void;
}

/** STUB T1 → FULL T5: AccuracyRing + RewardPills + Try again/Bài tiếp theo. */
export const ResultsScreen: React.FC<Props> = () => null;
