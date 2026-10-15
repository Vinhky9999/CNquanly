"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { bulkImportAction, lookupSkuAction } from "@/server/actions/batch-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GAME_OPTIONS } from "@/lib/tcg-games";
import { cn, formatVND } from "@/lib/utils";

interface GridRow {
  id: number;
  sku: string;
  name: string;
  game: string;
  kind: "SEALED" | "SINGLE";
  rawGrade: string;
  quantity: string;
  costPrice: string;
  known: boolean;
  blocked: string;
}

// Column index -> field. Used to move between cells with Enter / arrow keys.
const COLUMNS = ["sku", "name", "game", "kind", "rawGrade", "quantity", "costPrice"] as const;
const INITIAL_ROWS = 6;

const CELL =
  "h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-border focus:border-indigo-500/60 focus:bg-indigo-500/5 disabled:cursor-not-allowed disabled:opacity-40";

let nextId = 1;
function emptyRow(): GridRow {
  return {
    id: nextId++,
    sku: "",
    name: "",
    game: "",
    kind: "SEALED",
    rawGrade: "A",
    quantity: "",
    costPrice: "",
    known: false,
    blocked: "",
  };
}

function isBlank(r: GridRow) {
  return !r.sku.trim() && !r.name.trim() && !r.quantity.trim() && !r.costPrice.trim();
}

interface BatchImportDialogProps {
  onImported?: () => void;
}

export function BatchImportDialog({ onImported }: BatchImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<GridRow[]>(() => Array.from({ length: INITIAL_ROWS }, emptyRow));
  const [skipCashLedger, setSkipCashLedger] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pendingFocus = useRef<{ row: number; col: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    focusCell(target.row, target.col, 1);
  });

  function cellAt(row: number, col: number) {
    return gridRef.current?.querySelector<HTMLElement>(`[data-cell="${row}-${col}"]`) ?? null;
  }

  // Moves to the nearest enabled cell in the given direction along a row.
  function focusCell(row: number, col: number, step: 1 | -1) {
    let c = col;
    while (c >= 0 && c < COLUMNS.length) {
      const el = cellAt(row, c);
      if (el && !(el as HTMLInputElement).disabled) {
        el.focus();
        if (el instanceof HTMLInputElement) el.select();
        return;
      }
      c += step;
    }
  }

  function update(id: number, patch: Partial<GridRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow(focusRow?: number) {
    setRows((prev) => [...prev, emptyRow()]);
    if (focusRow !== undefined) pendingFocus.current = { row: focusRow, col: 0 };
  }

  function removeRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  function handleKeyDown(e: React.KeyboardEvent, rowIndex: number, colIndex: number) {
    const isSelect = e.target instanceof HTMLSelectElement;

    if (e.key === "Enter") {
      e.preventDefault();
      if (colIndex < COLUMNS.length - 1) {
        focusCell(rowIndex, colIndex + 1, 1);
      } else if (rowIndex < rows.length - 1) {
        focusCell(rowIndex + 1, 0, 1);
      } else {
        addRow(rowIndex + 1);
      }
    } else if (e.key === "ArrowDown" && !isSelect) {
      e.preventDefault();
      if (rowIndex < rows.length - 1) cellAt(rowIndex + 1, colIndex)?.focus();
    } else if (e.key === "ArrowUp" && !isSelect) {
      e.preventDefault();
      if (rowIndex > 0) cellAt(rowIndex - 1, colIndex)?.focus();
    }
  }

  async function handleSkuBlur(row: GridRow) {
    const sku = row.sku.trim();
    if (!sku) {
      if (row.known) update(row.id, { known: false, blocked: "" });
      return;
    }
    const match = await lookupSkuAction(sku);
    if (!match) {
      update(row.id, { known: false, blocked: "" });
      return;
    }
    update(row.id, {
      sku: match.sku,
      name: match.name,
      game: match.game,
      kind: match.kind,
      rawGrade: match.rawGrade || "A",
      known: true,
      blocked: match.isGraded ? "Thẻ Graded không thể gộp — dùng SKU khác" : "",
    });
  }

  const activeRows = rows.filter((r) => !isBlank(r));
  const totalQty = activeRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalValue = activeRows.reduce(
    (s, r) => s + (Number(r.quantity) || 0) * (Number(r.costPrice) || 0),
    0
  );
  const hasBlocked = activeRows.some((r) => r.blocked);

  async function handleSave() {
    setError("");
    if (activeRows.length === 0) {
      setError("Chưa có dòng nào để lưu");
      return;
    }
    setSaving(true);
    const result = await bulkImportAction({
      rows: activeRows.map((r) => ({
        sku: r.sku,
        name: r.name,
        game: r.game,
        kind: r.kind,
        rawGrade: r.rawGrade,
        quantity: Number(r.quantity),
        costPrice: Number(r.costPrice),
      })),
      skipCashLedger,
    });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(
      `Đã nhập ${activeRows.length} dòng (${result.sealed ?? 0} Sealed, ${result.single ?? 0} Single)`
    );
    setRows(Array.from({ length: INITIAL_ROWS }, emptyRow));
    setSkipCashLedger(false);
    setOpen(false);
    onImported?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 rounded-xl border-border/80 bg-input hover:bg-accent/40">
          <Table2 className="h-4 w-4" />
          Nhập Hàng Hàng Loạt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl rounded-2xl sm:rounded-2xl dark:bg-slate-900/90 dark:backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>Nhập Hàng Hàng Loạt</DialogTitle>
          <DialogDescription>
            Nhập nhiều dòng cùng lúc. Enter/Tab sang ô kế, mũi tên lên/xuống đổi dòng, Enter ở ô cuối
            tự thêm dòng mới. SKU đã có sẽ tự điền và được cộng dồn (giá vốn tính lại bình quân gia
            quyền).
          </DialogDescription>
        </DialogHeader>

        <div
          ref={gridRef}
          className="overflow-x-auto rounded-xl border border-border/60 dark:border-slate-800/80"
        >
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground dark:border-slate-800/80">
                <th className="w-8 px-2 py-2">#</th>
                <th className="w-[150px] px-1 py-2">SKU</th>
                <th className="px-1 py-2">Tên sản phẩm</th>
                <th className="w-[150px] px-1 py-2">Dòng game</th>
                <th className="w-[100px] px-1 py-2">Loại</th>
                <th className="w-[84px] px-1 py-2">Hạng Raw</th>
                <th className="w-[90px] px-1 py-2">Số lượng</th>
                <th className="w-[130px] px-1 py-2">Giá vốn</th>
                <th className="w-8 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/40 last:border-0 dark:border-slate-800/60",
                    row.blocked && "bg-rose-500/5"
                  )}
                >
                  <td className="px-2 text-xs text-muted-foreground">{r + 1}</td>
                  <td className="px-1 py-1">
                    <input
                      data-cell={`${r}-0`}
                      className={CELL}
                      value={row.sku}
                      placeholder="tự tạo nếu bỏ trống"
                      onChange={(e) => update(row.id, { sku: e.target.value, known: false, blocked: "" })}
                      onBlur={() => handleSkuBlur(row)}
                      onKeyDown={(e) => handleKeyDown(e, r, 0)}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-1">
                      <input
                        data-cell={`${r}-1`}
                        className={CELL}
                        value={row.name}
                        placeholder={row.kind === "SEALED" ? "Game - Set - Loại Box" : "Tên lá bài"}
                        readOnly={row.known}
                        onChange={(e) => update(row.id, { name: e.target.value })}
                        onKeyDown={(e) => handleKeyDown(e, r, 1)}
                      />
                      {row.known && !row.blocked && (
                        <Badge variant="success" className="shrink-0">
                          Có sẵn
                        </Badge>
                      )}
                      {row.blocked && (
                        <Badge variant="rose" className="shrink-0" title={row.blocked}>
                          Graded
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      data-cell={`${r}-2`}
                      className={CELL}
                      list="batch-game-options"
                      value={row.game}
                      placeholder="Pokémon..."
                      readOnly={row.known}
                      onChange={(e) => update(row.id, { game: e.target.value })}
                      onKeyDown={(e) => handleKeyDown(e, r, 2)}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      data-cell={`${r}-3`}
                      className={CELL}
                      value={row.kind}
                      disabled={row.known}
                      onChange={(e) => update(row.id, { kind: e.target.value as "SEALED" | "SINGLE" })}
                      onKeyDown={(e) => handleKeyDown(e, r, 3)}
                    >
                      <option value="SEALED">Sealed</option>
                      <option value="SINGLE">Single</option>
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <select
                      data-cell={`${r}-4`}
                      className={CELL}
                      value={row.rawGrade}
                      disabled={row.kind !== "SINGLE" || row.known}
                      onChange={(e) => update(row.id, { rawGrade: e.target.value })}
                      onKeyDown={(e) => handleKeyDown(e, r, 4)}
                    >
                      <option value="S">S</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      data-cell={`${r}-5`}
                      className={cn(CELL, "text-right tabular-nums")}
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) => update(row.id, { quantity: e.target.value })}
                      onKeyDown={(e) => handleKeyDown(e, r, 5)}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      data-cell={`${r}-6`}
                      className={cn(CELL, "text-right tabular-nums")}
                      type="number"
                      min={0}
                      step="1000"
                      value={row.costPrice}
                      onChange={(e) => update(row.id, { costPrice: e.target.value })}
                      onKeyDown={(e) => handleKeyDown(e, r, 6)}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => removeRow(row.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                      title="Xoá dòng"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="batch-game-options">
          {GAME_OPTIONS.filter((g) => g !== "Khác").map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <Button type="button" variant="outline" size="sm" onClick={() => addRow()}>
              <Plus className="h-4 w-4" />
              Thêm dòng
            </Button>
            <div className="flex items-center gap-2">
              <input
                id="batch-skip-ledger"
                type="checkbox"
                checked={skipCashLedger}
                onChange={(e) => setSkipCashLedger(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <Label htmlFor="batch-skip-ledger" className="font-normal">
                Hàng có sẵn (không trừ tiền vào Dòng Tiền)
              </Label>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {activeRows.length} dòng · {totalQty.toLocaleString("vi-VN")} items ·{" "}
            <span className="font-semibold tabular-nums text-foreground">{formatVND(totalValue)}</span>
          </div>
        </div>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <Button
          type="button"
          className="h-10 w-full"
          disabled={saving || activeRows.length === 0 || hasBlocked}
          onClick={handleSave}
        >
          {saving ? "Đang lưu..." : `Lưu Tất Cả (${activeRows.length})`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
