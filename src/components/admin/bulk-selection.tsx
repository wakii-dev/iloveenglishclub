"use client";

import { useCallback, useState, type ReactNode } from "react";
import { cn } from "cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Shared tier-0 bulk-selection primitives (VU-43 SF-1 task 13 — contract PIN
 * spec §2.5, SF-2/3/4 CHỈ render, KHÔNG sửa file này):
 * - useBulkSelection<T>(rows, getId) → {selectedIds, isSelected, toggle,
 *   togglePage, clear, count} — selection GIỮ qua refetch trang (Set state
 *   theo id, không tự xoá khi rows đổi).
 * - BulkActionBar sticky, ẨN khi count=0.
 * - ConfirmDialog destructive confirm chuẩn admin (rounded-[12px],
 *   font-display — cùng design language vocabulary-manager).
 */

export type BulkSelectionId = string | number;

/** Pure leg (unit test trực tiếp): toggle 1 id trong Set — immutable. */
export function toggleSelectionId(
  prev: Set<BulkSelectionId>,
  id: BulkSelectionId,
): Set<BulkSelectionId> {
  const next = new Set(prev);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/**
 * Pure leg: chọn/bỏ TOÀN BỘ trang hiện tại — đã chọn đủ page → bỏ page;
 * ngược lại → thêm page vào selection hiện có (giữ selection trang khác).
 */
export function toggleSelectionPage(
  prev: Set<BulkSelectionId>,
  pageIds: BulkSelectionId[],
): Set<BulkSelectionId> {
  const allSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
  const next = new Set(prev);
  for (const id of pageIds) {
    if (allSelected) {
      next.delete(id);
    } else {
      next.add(id);
    }
  }
  return next;
}

export function useBulkSelection<T>(
  rows: T[],
  getId: (row: T) => BulkSelectionId,
): {
  selectedIds: Set<BulkSelectionId>;
  isSelected: (id: BulkSelectionId) => boolean;
  toggle: (row: T) => void;
  togglePage: () => void;
  clear: () => void;
  count: number;
} {
  const [selectedIds, setSelectedIds] = useState<Set<BulkSelectionId>>(
    () => new Set(),
  );

  const isSelected = useCallback(
    (id: BulkSelectionId) => selectedIds.has(id),
    [selectedIds],
  );

  const toggle = useCallback(
    (row: T) => {
      setSelectedIds((prev) => toggleSelectionId(prev, getId(row)));
    },
    [getId],
  );

  const togglePage = useCallback(() => {
    setSelectedIds((prev) =>
      toggleSelectionPage(
        prev,
        rows.map(getId),
      ),
    );
  }, [rows, getId]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return {
    selectedIds,
    isSelected,
    toggle,
    togglePage,
    clear,
    count: selectedIds.size,
  };
}

/** Sticky bulk bar — ẨN khi count=0 (không render gì). */
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div
      className={cn(
        "sticky bottom-4 z-30 mt-4 flex flex-wrap items-center gap-3 rounded-[12px] border",
        "bg-card/95 p-3 shadow-lg backdrop-blur",
      )}
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="font-display text-[13px] font-bold">
        Đã chọn {count}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="ml-auto"
      >
        Bỏ chọn hết
      </Button>
    </div>
  );
}

/**
 * Destructive confirm chuẩn admin — open từ state của caller (SF-2/3/4 render
 * với title/description từ i18n của mình).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[12px] sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[17px] font-bold">
            {title}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange?.(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
