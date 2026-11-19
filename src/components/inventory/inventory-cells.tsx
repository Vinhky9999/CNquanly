"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ProductThumbnail } from "@/components/inventory/product-thumbnail";
import { formatDateParts, formatVND } from "@/lib/utils";

// Cells react to the table's layout through the `group/dt` + `data-layout` that DataTable sets: in the stacked (card)
// layout values line up to the left under their label, and there is room for the full name instead of a short one.

/** Photo (56px, placeholder when missing), the full name (up to three lines in the table), SKU and badges underneath. */
export function ProductCell({
  imageUrl,
  name,
  sku,
  badges,
}: {
  imageUrl: string | null;
  name: string;
  sku: string;
  /** Shown next to the SKU, e.g. the game. */
  badges?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-[190px] items-center gap-3 group-data-[layout=stacked]/dt:min-w-0">
      <ProductThumbnail src={imageUrl} alt={name} size="md" />
      <div className="min-w-0">
        <p className="line-clamp-3 break-words font-medium leading-snug text-foreground group-data-[layout=stacked]/dt:line-clamp-none" title={name}>
          {name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="break-all">{sku}</span>
          {badges}
        </div>
      </div>
    </div>
  );
}

/** Right-aligned, never wrapping money value. */
export function MoneyCell({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <span className={strong ? "whitespace-nowrap font-semibold tabular-nums text-foreground" : "whitespace-nowrap tabular-nums"}>
      {formatVND(value)}
    </span>
  );
}

/** Total capital of the stock (bold) with the cost of one item underneath, so one column carries both. */
export function CostCell({ unit, quantity }: { unit: number; quantity: number }) {
  return (
    <div className="flex flex-col items-end gap-0.5 tabular-nums group-data-[layout=stacked]/dt:items-start">
      <span className="whitespace-nowrap font-semibold text-foreground" title="Tổng tiền vốn = giá nhập × số lượng">
        {formatVND(unit * quantity)}
      </span>
      <span className="whitespace-nowrap text-xs text-muted-foreground" title="Giá nhập gốc của 1 sản phẩm">
        {formatVND(unit)}/sp
      </span>
    </div>
  );
}

export function DateCell({ value }: { value: Date | string }) {
  const { time, date } = formatDateParts(value);
  return (
    <div className="whitespace-nowrap leading-tight">
      <p className="text-sm">{time}</p>
      <p className="text-xs text-muted-foreground">{date}</p>
    </div>
  );
}

interface RowActionsProps {
  /** The "Ghi nhận bán" dialog trigger (kept as is), when the item can still be sold. */
  sale?: React.ReactNode;
  editHref: string;
  name: string;
  onDelete: () => Promise<unknown>;
  onMutated?: () => void;
}

/** Sell / edit / delete with tooltips and the existing delete confirmation. */
export function RowActions({ sale, editHref, name, onDelete, onMutated }: RowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      {sale}
      <Button asChild size="icon" variant="ghost" className="h-8 w-8 rounded-lg">
        <Link href={editHref} title="Chỉnh sửa" aria-label={`Chỉnh sửa ${name}`}>
          <Pencil className="h-4 w-4" />
        </Link>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-lg text-danger/80 hover:bg-danger/10 hover:text-danger"
        title="Xoá"
        aria-label={`Xoá ${name}`}
        onClick={async () => {
          if (!confirm(`Xoá "${name}"?`)) return;
          try {
            await onDelete();
            toast.success("Đã xoá");
            onMutated?.();
          } catch {
            toast.error("Không xoá được sản phẩm này (có thể đã phát sinh giao dịch)");
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
