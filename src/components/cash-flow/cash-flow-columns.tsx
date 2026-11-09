"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { CashLedgerEntry } from "@prisma/client";
import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, formatVND } from "@/lib/utils";
import { deleteCashLedgerEntryAction } from "@/server/actions/cash-flow";
import { CashEntryEditDialog } from "@/components/cash-flow/cash-entry-edit-dialog";

const typeLabel: Record<string, string> = {
  PURCHASE: "Mua hàng",
  SALE: "Doanh thu",
  MANUAL_ADJUSTMENT: "Điều chỉnh",
  WITHDRAWAL: "Rút tiền",
  DEBT_REPAYMENT: "Trả nợ ứng tiền",
  DEBT_COLLECTION: "Thu hồi tiền ứng",
  GRADING_INCOME: "Thu chấm điểm",
  GRADING_COST: "Chi phí chấm điểm",
};

const typeVariant: Record<string, "secondary" | "success" | "destructive" | "rose" | "indigo"> = {
  PURCHASE: "secondary",
  SALE: "success",
  MANUAL_ADJUSTMENT: "secondary",
  WITHDRAWAL: "destructive",
  DEBT_REPAYMENT: "rose",
  DEBT_COLLECTION: "indigo",
  GRADING_INCOME: "success",
  GRADING_COST: "rose",
};

// One line of goods behind a cash entry (sold / bought product, or a grading card).
interface GoodsLine {
  name: string;
  sku: string | null;
  quantity: number;
  unit: number;
  total: number;
  note?: string;
}

interface EntryExtra {
  transaction?: {
    source: string | null;
    totalAmount: unknown;
    totalCost: unknown;
    items?: {
      quantity: number;
      unitPrice: unknown;
      subtotal: unknown;
      sealedProduct: { name: string; sku: string } | null;
      singleCard: { cardName: string; sku: string } | null;
    }[];
  } | null;
  gradingIncome?: {
    markup: unknown;
    items?: { cardName: string; quantity: number; listedFee: unknown; company: string; tier: string }[];
  } | null;
  gradingCost?: {
    items?: { cardName: string; quantity: number; costPrice: unknown; shipFee: unknown; company: string; tier: string }[];
  } | null;
}

/** Collects the goods of an entry: sale / purchase lines, or the cards of a grading order (price = what was charged / paid per card). */
function goodsOf(entry: CashLedgerEntry & EntryExtra): GoodsLine[] {
  const tx = entry.transaction?.items;
  if (tx && tx.length > 0) {
    return tx.map((i) => ({
      name: i.sealedProduct?.name ?? i.singleCard?.cardName ?? "Sản phẩm đã xoá",
      sku: i.sealedProduct?.sku ?? i.singleCard?.sku ?? null,
      quantity: i.quantity,
      unit: Number(i.unitPrice),
      total: Number(i.subtotal),
    }));
  }
  const income = entry.gradingIncome?.items;
  if (income && income.length > 0) {
    return income.map((i) => ({
      name: i.cardName,
      sku: null,
      quantity: i.quantity,
      unit: Number(i.listedFee),
      total: Number(i.listedFee) * i.quantity,
      note: `${i.company} ${i.tier} · giá dịch vụ`,
    }));
  }
  const cost = entry.gradingCost?.items;
  if (cost && cost.length > 0) {
    return cost.map((i) => ({
      name: i.cardName,
      sku: null,
      quantity: i.quantity,
      unit: Number(i.costPrice) + Number(i.shipFee),
      total: (Number(i.costPrice) + Number(i.shipFee)) * i.quantity,
      note: `${i.company} ${i.tier} · giá gốc + ship`,
    }));
  }
  return [];
}

// "2 món: A ×2, B ×1" with a button that opens the full list (SKU, quantity, unit price, line total).
function GoodsDetail({ lines, kind }: { lines: GoodsLine[]; kind: "sale" | "purchase" | "grading" }) {
  const [open, setOpen] = useState(false);
  const label = kind === "sale" ? "Đã bán" : kind === "purchase" ? "Đã mua" : "Thẻ chấm điểm";
  const summary = lines.map((l) => `${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ""}`).join(", ");

  return (
    <div className="mt-1 w-full max-w-[520px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-start gap-1.5 rounded-lg border border-border/60 bg-background/40 px-2 py-1 text-left text-xs transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="shrink-0 font-semibold text-foreground">
          {label} ({lines.length} món)
        </span>
        <span className={cn("min-w-0 flex-1 text-muted-foreground", !open && "truncate")}>{summary}</span>
        <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-1 space-y-1 rounded-lg border border-border/60 bg-background/40 p-2">
          {lines.map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-3 text-xs">
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{l.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {[l.sku, l.note].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="block text-muted-foreground">
                  {l.quantity} × {formatVND(l.unit)}
                </span>
                <span className="block font-semibold text-foreground">{formatVND(l.total)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const cashFlowColumns: ColumnDef<CashLedgerEntry, any>[] = [
  {
    accessorKey: "createdAt",
    header: "Ngày",
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
  {
    accessorKey: "type",
    header: "Loại",
    cell: ({ row }) => (
      <Badge variant={typeVariant[row.original.type] ?? "secondary"}>
        {typeLabel[row.original.type] ?? row.original.type}
      </Badge>
    ),
  },
  {
    accessorKey: "description",
    header: "Mô tả",
    cell: ({ row }) => {
      const extra = row.original as CashLedgerEntry & EntryExtra;
      const tx = extra.transaction;
      const goods = goodsOf(extra);
      // Grading order paid by the customer: its service profit is counted in the month's profit.
      const gradingProfit = extra.gradingIncome ? Number(extra.gradingIncome.markup) : null;
      const fromChat = tx?.source?.startsWith("MESSENGER") ?? false;
      // Sold below cost: the loss is recorded and deducted from the month's profit.
      const loss = tx && tx.totalCost != null ? Number(tx.totalCost) - Number(tx.totalAmount) : 0;
      return (
        <div className="min-w-[280px]">
        <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
          {row.original.description ?? "—"}
          {row.original.countsAsProfit && <Badge variant="success">Tính vào lãi</Badge>}
          {loss > 0 && <Badge variant="rose">Bán lỗ -{formatVND(loss)}</Badge>}
          {gradingProfit !== null && (
            <Badge variant={gradingProfit < 0 ? "rose" : "success"}>
              {gradingProfit < 0 ? `Lỗ dịch vụ -${formatVND(-gradingProfit)}` : `Lãi dịch vụ +${formatVND(gradingProfit)}`}
            </Badge>
          )}
          {fromChat && <Badge variant="indigo">Chốt qua Page</Badge>}
        </span>
        {goods.length > 0 && (
          <GoodsDetail
            lines={goods}
            kind={row.original.type === "PURCHASE" ? "purchase" : row.original.type === "SALE" ? "sale" : "grading"}
          />
        )}
        </div>
      );
    },
  },
  {
    accessorKey: "amount",
    header: "Số tiền",
    cell: ({ row }) => {
      const amount = Number(row.original.amount);
      return (
        <span
          className={cn(
            "font-semibold",
            amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
          )}
        >
          {amount >= 0 ? "+" : ""}
          {formatVND(amount)}
        </span>
      );
    },
  },
  {
    accessorKey: "balanceAfter",
    header: "Số dư sau GD",
    enableSorting: false,
    cell: ({ row }) => formatVND(row.original.balanceAfter as unknown as number),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const entry = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <div className="flex items-center justify-end gap-2">
          <CashEntryEditDialog entry={entry} onSuccess={onMutated} />
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              if (!confirm("Xoá giao dịch này?")) return;
              const result = await deleteCashLedgerEntryAction(entry.id);
              if (result?.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Đã xoá");
              onMutated?.();
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      );
    },
  },
];
