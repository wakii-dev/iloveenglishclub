"use client"

import * as React from "react"
import { cn } from "cn"
import { Card as WakiiCard } from "@wakii/ui-kit"

/**
 * Adapter shadcn Card (compound) → wakii Card (@wakii/ui-kit 2.0.2).
 * wakii Card là component đơn antd-style (title/extra props) — KHÔNG có
 * sub-component Card.Header…, nên: Card root chạy wakii (bg/border/radius/
 * shadow từ token, đã map sang var ilec trong UiKitProvider), còn các part
 * Header/Title/Description/Action/Content/Footer giữ nguyên layout div shadcn
 * (wakii không có compound tương đương — đổi sẽ phá mọi call site, mission
 * cấm sửa pages). Body reset p-0 + tái lập gap-6/py-6 của shadcn root.
 */
function Card({ className, style, children, ...props }: React.ComponentProps<"div">) {
  void props
  return (
    <WakiiCard
      bordered
      classNames={{ body: "flex flex-col gap-6 p-0 py-6 text-card-foreground" }}
      className={className}
      style={style}
    >
      {children}
    </WakiiCard>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
