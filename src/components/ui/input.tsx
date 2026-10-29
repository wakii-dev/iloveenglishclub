"use client"

import * as React from "react"
import { Input as WakiiInput } from "@wakii/ui-kit"

// Adapter (ilec PHẦN C): contract shadcn giữ nguyên (React.ComponentProps<"input">),
// internals → @wakii/ui-kit Input (antd-style: invalid/prefix/suffix/classNames).
// Bridge: shadcn báo lỗi bằng `aria-invalid` → wakii `invalid`.
// Native `size` (số ký tự) bị drop — wakii repurpose `size` thành InputSize;
// `ref` không được wakii forward. "use client" thêm vì dist wakii không có banner
// mà component dùng hooks (admin/users/page.tsx — server component — import Input).
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const { size: _size, ref: _ref, ...rest } = props
  const invalid =
    props["aria-invalid"] === true || props["aria-invalid"] === "true" || undefined
  return (
    <WakiiInput
      type={type}
      className={className}
      invalid={invalid}
      {...rest}
    />
  )
}

export { Input }
