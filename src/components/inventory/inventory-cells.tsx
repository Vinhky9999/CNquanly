"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ProductThumbnail } from "@/components/inventory/product-thumbnail";
import { formatDateParts, formatVND } from "@/lib/utils";

/** Photo (56px, placeholder when missing), name on up to two lines, SKU underneath. */
export function ProductCell({ imageUrl, name, sku }: { imageUrl: string | null; name: string; sku: string }) {
  return (
    <div className="flex min-w-[240px] items-center gap-3">
      <ProductThumbnail src={imageUrl} alt={name} size="md" />
      <div className="min-w-0">
        <p className="line-clamp-2 font-medium leading-snug text-foreground" title={name}>
          {name}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{sku}</p>
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
    <div className="flex items-center justify-end gap-1.5">
      {sale}
      <Button asChild size="icon" variant="ghost" className="h-9 w-9 rounded-xl">
        <Link href={editHref} title="Chỉnh sửa" aria-label={`Chỉnh sửa ${name}`}>
          <Pencil className="h-4 w-4" />
        </Link>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 rounded-xl text-danger/80 hover:bg-danger/10 hover:text-danger"
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
