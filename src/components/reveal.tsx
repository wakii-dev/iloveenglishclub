"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal — entrance animation khi element scroll vào viewport (IO), stagger
 * qua delay (ms). No-JS / reduced-motion → hiện ngay (không giấu content).
 * Keyframes `fade-up` định nghĩa ở globals.css; global reduced-motion rule
 * đã tắt animation-duration nên user reduced-motion thấy content tĩnh.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      className={`${shown ? "anim-fade-up" : "opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}
