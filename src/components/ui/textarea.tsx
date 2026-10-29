"use client"

import * as React from "react"
import { Textarea as WakiiTextarea } from "@wakii/ui-kit"

// Adapter (ilec PHẦN C): contract shadcn giữ nguyên; internals → @wakii/ui-kit
// Textarea (invalid/showCount/autoSize/classNames). Bridge: aria-invalid → invalid;
// `ref` không được wakii forward. "use client" vì dist wakii không có banner + dùng hooks.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const invalid =
    props["aria-invalid"] === true || props["aria-invalid"] === "true" || undefined
  return <WakiiTextarea className={className} invalid={invalid} {...props} />
}

export { Textarea }
