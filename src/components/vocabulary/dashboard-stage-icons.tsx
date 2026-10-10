/**
 * 8 SVG giai đoạn tăng trưởng vườn ấm (VU-37 SF-4) — copy NGUYÊN VĂN từ
 * proto-A `docs/superpowers/designs/vocab-memrise/proto-A.html` (40×44).
 * Fill cứng theo hand-off §1.2 ("Không đổi theo dark: SVG minh họa cây trong
 * vườn — fill cứng #3f8f4f/#63ab61/#8a6b52/#d9c49f/#e85d3d/#c2482e/#f59e0b").
 * Ngưỡng stage là việc `growth.ts` (SF-1) — component chỉ vẽ theo index.
 */

const STAGE_SVGS = [
  // 0 Hạt mầm — hạt nâu
  <>
    <ellipse cx="20" cy="40" rx="8" ry="2.6" fill="#d9c49f" />
    <circle cx="20" cy="36.5" r="3.4" fill="#8a6b52" />
  </>,
  // 1 Nảy mầm — mầm 2 lá
  <>
    <ellipse cx="20" cy="40" rx="8" ry="2.6" fill="#d9c49f" />
    <path d="M20 37v-9" stroke="#3f8f4f" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M20 28c-4.5-1-6.8-3.6-6.8-7.6 4 .6 6.3 3 6.8 7.6z" fill="#3f8f4f" />
    <path d="M20 28c4.5-1 6.8-3.6 6.8-7.6-4 .6-6.3 3-6.8 7.6z" fill="#63ab61" />
  </>,
  // 2 Cây con — 2 cặp lá
  <>
    <ellipse cx="20" cy="40" rx="8" ry="2.6" fill="#d9c49f" />
    <path d="M20 38V22" stroke="#3f8f4f" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M20 30c-4.5-1-6.8-3.6-6.8-7.6 4 .6 6.3 3 6.8 7.6z" fill="#3f8f4f" />
    <path d="M20 30c4.5-1 6.8-3.6 6.8-7.6-4 .6-6.3 3-6.8 7.6z" fill="#63ab61" />
    <path d="M20 23c-3.6-.8-5.5-2.9-5.5-6.1 3.2.5 5 2.4 5.5 6.1z" fill="#3f8f4f" />
    <path d="M20 23c3.6-.8 5.5-2.9 5.5-6.1-3.2.5-5 2.4-5.5 6.1z" fill="#63ab61" />
  </>,
  // 3 Nụ — nụ coral
  <>
    <ellipse cx="20" cy="40" rx="8" ry="2.6" fill="#d9c49f" />
    <path d="M20 38V20" stroke="#3f8f4f" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M20 32c-4.5-1-6.8-3.6-6.8-7.6 4 .6 6.3 3 6.8 7.6z" fill="#3f8f4f" />
    <path d="M20 32c4.5-1 6.8-3.6 6.8-7.6-4 .6-6.3 3-6.8 7.6z" fill="#63ab61" />
    <circle cx="20" cy="16.5" r="4" fill="#c2482e" />
    <path d="M20 12.5c-1-1.5-1-3 0-4.5 1 1.5 1 3 0 4.5z" fill="#e85d3d" />
  </>,
  // 4 Cây non — bụi 3 khối
  <>
    <ellipse cx="20" cy="40" rx="8" ry="2.6" fill="#d9c49f" />
    <rect x="18.6" y="28" width="2.8" height="10" rx="1.2" fill="#8a6b52" />
    <circle cx="14.5" cy="27" r="5.4" fill="#3f8f4f" />
    <circle cx="25.5" cy="27" r="5.4" fill="#63ab61" />
    <circle cx="20" cy="20.5" r="6.6" fill="#3f8f4f" />
  </>,
  // 5 Cây xanh — tán tròn
  <>
    <ellipse cx="20" cy="40" rx="8" ry="2.6" fill="#d9c49f" />
    <rect x="18.4" y="26" width="3.2" height="12" rx="1.4" fill="#8a6b52" />
    <circle cx="20" cy="18" r="10" fill="#3f8f4f" />
    <circle cx="15.5" cy="15.5" r="3" fill="#63ab61" />
  </>,
  // 6 Trỗi dậy — cây + sparkle vàng
  <>
    <ellipse cx="20" cy="40" rx="8" ry="2.6" fill="#d9c49f" />
    <rect x="18.4" y="26" width="3.2" height="12" rx="1.4" fill="#8a6b52" />
    <circle cx="20" cy="18" r="10" fill="#2e6e3c" />
    <circle cx="15.5" cy="15.5" r="3" fill="#63ab61" />
    <path d="M7 8l1.2 2.6L11 12l-2.8 1.4L7 16l-1.2-2.6L3 12l2.8-1.4z" fill="#f59e0b" />
    <path d="M33 12l1 2.2 2.4 1.1-2.4 1.2-1 2.2-1-2.2-2.4-1.2 2.4-1.1z" fill="#f59e0b" />
  </>,
  // 7 Nở hoa — hoa 5 cánh coral/gold
  <>
    <ellipse cx="20" cy="40" rx="8" ry="2.6" fill="#d9c49f" />
    <rect x="18.4" y="26" width="3.2" height="12" rx="1.4" fill="#8a6b52" />
    <circle cx="20" cy="19" r="9.4" fill="#2e6e3c" />
    <g>
      <circle cx="20" cy="9.6" r="2.5" fill="#f59e0b" />
      <circle cx="15.4" cy="12.9" r="2.5" fill="#e85d3d" />
      <circle cx="24.6" cy="12.9" r="2.5" fill="#e85d3d" />
      <circle cx="17.1" cy="17.6" r="2.5" fill="#e85d3d" />
      <circle cx="22.9" cy="17.6" r="2.5" fill="#e85d3d" />
    </g>
  </>,
] as const;

/** SVG cây stage 0–7 — kích thước 38×42 như `.plant svg` trong proto. */
export function StagePlant({ stage }: { stage: number }) {
  return (
    <svg
      viewBox="0 0 40 44"
      width="38"
      height="42"
      aria-hidden="true"
      className="block"
    >
      {STAGE_SVGS[Math.min(7, Math.max(0, stage))]}
    </svg>
  );
}
