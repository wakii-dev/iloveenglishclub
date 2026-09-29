import type { LocalizedBook } from "@/lib/content/queries";

/**
 * §2.4 BookCover — placeholder typographic aspect 3/4, nền màu level, chữ
 * "Cambridge English Prepare / Level n / CEFR". Shadow đặc `0 10px 0` theo
 * hand-off §1.6. Ảnh bìa thật (license Cambridge) thay sau — chỉ thay component
 * này, không đổi layout (§4 out-of-design-scope).
 */
export function BookCover({ book }: { book: LocalizedBook }) {
  return (
    <div
      aria-hidden
      className="aspect-3/4 w-full max-w-[230px] rounded-[22px] p-5 text-white shadow-[0_10px_0_color-mix(in_srgb,var(--secondary)_55%,#000)] dark:shadow-[0_10px_0_color-mix(in_srgb,var(--secondary)_35%,#000)]"
      style={{ backgroundColor: book.color }}
    >
      <p className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] opacity-90">
        Cambridge English Prepare
      </p>
      <p className="mt-6 font-display text-[26px] font-bold leading-tight">
        {book.title}
      </p>
      <p className="mt-auto text-[13px] font-extrabold opacity-90">
        {book.cefrLabel}
      </p>
    </div>
  );
}
