"use client"

import * as React from "react"
import { cn } from "cn"
import { Avatar as WakiiAvatar } from "@wakii/ui-kit"

/**
 * Adapter shadcn Avatar (compound radix) → wakii Avatar (@wakii/ui-kit 2.0.2).
 * wakii Avatar là component đơn (src/alt/children/size px) — adapter quét
 * children để bóc AvatarImage (src/alt) + AvatarFallback (nội dung + class),
 * giữ nguyên call site `<Avatar><AvatarImage/><AvatarFallback>…</…></Avatar>`.
 * - size: wakii nhận px; "size-N" trong className (size-7 = 28px) thắng vì
 *   wakii set kích thước bằng inline style (utility không đè được).
 * - fallback: bọc span flex đầy + class ilec gốc (bg-secondary, text-[11px]…).
 */
type AvatarSize = "default" | "sm" | "lg"

const SIZE_TO_PX: Record<AvatarSize, number> = {
  default: 32,
  sm: 24,
  lg: 40,
}

function extractSizePx(className: string | undefined, size: AvatarSize) {
  const match = /(?:^|\s)size-(\d+)(?:\s|$)/.exec(className ?? "")
  return match ? Number(match[1]) * 4 : SIZE_TO_PX[size]
}

function Avatar({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<"span"> & {
  size?: AvatarSize
}) {
  let src: string | undefined
  let alt: string | undefined
  let fallback: React.ReactNode = null
  let fallbackClass: string | undefined
  const extra: React.ReactNode[] = []

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const childProps = child.props as {
      src?: string
      alt?: string
      className?: string
      children?: React.ReactNode
    }
    if (child.type === AvatarImage) {
      src = childProps.src
      alt = childProps.alt
    } else if (child.type === AvatarFallback) {
      fallback = childProps.children ?? null
      fallbackClass = childProps.className
    } else {
      extra.push(child)
    }
  })

  return (
    <WakiiAvatar
      src={src}
      alt={alt}
      size={extractSizePx(className, size)}
      className={cn("relative", className)}
      {...props}
    >
      <span
        className={cn(
          "flex h-full w-full items-center justify-center",
          fallbackClass,
        )}
      >
        {fallback}
        {extra}
      </span>
    </WakiiAvatar>
  )
}

function AvatarImage({
  className,
  alt = "",
  ...props
}: React.ComponentProps<"img">) {
  // Standalone compat — trong <Avatar> đã bị quét thành src/alt, không render.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} className={cn("aspect-square size-full", className)} {...props} />
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<"span">) {
  // Standalone compat — trong <Avatar> đã bị quét thành children + class.
  return <span className={className} {...props} />
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none",
        className,
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  // wakii AvatarGroup nhận items array — giữ div shadcn gốc (chưa có call site).
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className,
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background",
        className,
      )}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
}
