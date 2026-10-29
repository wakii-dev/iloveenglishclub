/**
 * Hub export Button/buttonVariants — GIỮ ĐÚNG path import shadcn cũ
 * (`@/components/ui/button`) cho mọi call site, nhưng tách 2 lớp:
 * - `buttonVariants` (hàm thường, server GỌI ĐƯỢC để dựng className string —
 *   7+ file server dùng) ← ./button-variants (thuần cva, không "use client").
 * - `Button` (component) ← ./button-client ("use client" — internals wakii,
 *   barrel @wakii/ui-kit chứa createContext module-level nên phải chạy client).
 * KHÔNG gộp lại 1 file: gộp = build fail (server gọi client function / RSC
 * crash createContext).
 */
export { Button } from "./button-client"
export { buttonVariants, type ButtonSize, type ButtonVariant } from "./button-variants"
