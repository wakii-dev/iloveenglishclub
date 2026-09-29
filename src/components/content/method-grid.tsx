import { getTranslations } from "next-intl/server";

/**
 * §2.3 MethodGrid — 2×2 (max-w 840px), step card radius 20px, số tròn 46px
 * Baloo nền theo màu step: 1 teal, 2 coral, 3 amber, 4 sky (hand-off §2.3).
 */
const STEPS = [
  { key: "step1", color: "#0e9488" },
  { key: "step2", color: "#e85d3d" },
  { key: "step3", color: "#f59e0b" },
  { key: "step4", color: "#0284c7" },
] as const;

export async function MethodGrid() {
  const t = await getTranslations("home.method");

  return (
    <ol className="mx-auto grid max-w-[840px] grid-cols-1 gap-[18px] sm:grid-cols-2">
      {STEPS.map((step, i) => (
        <li
          key={step.key}
          className="flex items-start gap-4 rounded-[20px] border-2 border-border bg-card p-5"
        >
          <span
            aria-hidden
            className="flex size-[46px] shrink-0 items-center justify-center rounded-full font-display text-[18px] font-bold text-white"
            style={{ backgroundColor: step.color }}
          >
            {i + 1}
          </span>
          <span>
            <span className="block font-display text-[16.5px] font-bold">
              {t(`${step.key}.title`)}
            </span>
            <span className="mt-1 block text-[13.5px] leading-snug text-muted-foreground">
              {t(`${step.key}.desc`)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
