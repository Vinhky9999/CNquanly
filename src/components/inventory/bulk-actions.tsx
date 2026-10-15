"use client";

import { useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";

interface BulkActionsProps {
  /** SKUs of the selected rows. */
  skus: string[];
  /** The existing per-product delete action, called one product at a time. */
  deleteOne: (id: string) => Promise<unknown>;
  ids: string[];
  onDone: (clear: () => void) => void;
  clear: () => void;
}

// Bulk actions that already exist for single rows: copy the SKUs, delete the selection (with confirmation).
export function BulkActions({ skus, deleteOne, ids, onDone, clear }: BulkActionsProps) {
  const [busy, setBusy] = useState(false);

  async function copySkus() {
    const ok = await copyToClipboard(skus.join("\n"));
    if (ok) toast.success(`Đã sao chép ${skus.length} SKU`);
    else toast.error("Không sao chép được, hãy thử lại");
  }

  async function removeAll() {
    if (!confirm(`Xoá ${ids.length} sản phẩm đã chọn? Thao tác này không thể hoàn tác.`)) return;
    setBusy(true);
    let failed = 0;
    for (const id of ids) {
      try {
        await deleteOne(id);
      } catch {
        failed += 1; // e.g. a product that already has sales history cannot be removed
      }
    }
    setBusy(false);
    if (failed === 0) toast.success(`Đã xoá ${ids.length} sản phẩm`);
    else toast.warning(`Đã xoá ${ids.length - failed}/${ids.length} sản phẩm — ${failed} sản phẩm không xoá được`);
    onDone(clear);
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg bg-input" onClick={copySkus}>
        <Copy className="h-3.5 w-3.5" />
        Sao chép SKU
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 rounded-lg border-danger/50 bg-input text-danger hover:bg-danger/10 hover:text-danger"
        disabled={busy}
        onClick={removeAll}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {busy ? "Đang xoá..." : "Xoá đã chọn"}
      </Button>
    </>
  );
}
