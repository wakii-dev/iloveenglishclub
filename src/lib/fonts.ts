import { Baloo_2, Nunito } from "next/font/google";

/**
 * §1.3 Typography — hand-off "Classroom Warm":
 * - Display: Baloo 2 (600, 700) — h1/h2/h3, số step, wordmark
 * - Body: Nunito (400, 600, 700, 800) — toàn bộ còn lại
 * subsets vietnamese cho UI tiếng Việt.
 */
export const fontDisplay = Baloo_2({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700"],
  variable: "--font-display",
});

export const fontBody = Nunito({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-body",
});
