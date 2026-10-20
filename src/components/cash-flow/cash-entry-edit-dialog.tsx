"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import type { CashLedgerEntry } from "@prisma/client";
import {
  updateCashLedgerEntryAction,
  type CashEntryActionState,
} from "@/server/actions/cash-flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initialState: CashEntryActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Đang lưu..." : "Lưu thay đổi"}
    </Button>
  );
}

export function CashEntryEditDialog({
  entry,
  onSuccess,
}: {
  entry: CashLedgerEntry;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Number(entry.amount)));
  const [countsAsProfit, setCountsAsProfit] = useState(entry.countsAsProfit);
  const action = updateCashLedgerEntryAction.bind(null, entry.id);
  const [state, formAction] = useFormState(action, initialState);
  const isLinked =
    Boolean(entry.transactionId) || entry.type === "DEBT_REPAYMENT" ||
    entry.type === "DEBT_COLLECTION" ||
    entry.type === "GRADING_INCOME" ||
    entry.type === "GRADING_COST";

  useEffect(() => {
    if (state.success) {
      toast.success("Đã cập nhật");
      setOpen(false);
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa giao dịch</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {!isLinked && (
            <div className="space-y-2">
              <Label htmlFor="amount">Số tiền (âm nếu rút ra)</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="1000"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (!(Number(e.target.value) > 0)) setCountsAsProfit(false);
                }}
                onFocus={(e) => e.currentTarget.select()}
                required
              />
            </div>
          )}
          {!isLinked && Number(amount) > 0 && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <input
                type="checkbox"
                name="countsAsProfit"
                checked={countsAsProfit}
                onChange={(e) => setCountsAsProfit(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-500"
              />
              <span>
                <span className="font-medium">Tính khoản này vào lãi</span>
                <span className="block text-xs text-muted-foreground">Cộng số tiền vào Lợi nhuận của tháng trong báo cáo.</span>
              </span>
            </label>
          )}
          <div className="space-y-2">
            <Label htmlFor="description">Mô tả</Label>
            <Input id="description" name="description" defaultValue={entry.description ?? ""} required />
          </div>
          {isLinked && (
            <p className="text-xs text-muted-foreground">
              Giao dịch này gắn với một đơn mua/bán hoặc một khoản Ghi Nợ/Ứng Tiền nên chỉ sửa
              được mô tả — số tiền lấy theo bản ghi gốc. Muốn đổi số tiền, hãy sửa/xoá ở trang
              Inventory hoặc Giao Hàng.
            </p>
          )}
          <SubmitButton />
        </form>
      </DialogContent>
    </Dialog>
  );
}
