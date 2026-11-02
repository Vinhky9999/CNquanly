"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { HandCoins, Pencil } from "lucide-react";
import { toast } from "sonner";

import type { CashLedgerEntry } from "@prisma/client";
import {
  updateCashLedgerEntryAction,
  type CashEntryActionState,
} from "@/server/actions/cash-flow";
import { canConvertToReceivable } from "@/lib/cash-ledger";
import { formatVND } from "@/lib/utils";
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

function SubmitButton({ converting }: { converting: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Đang lưu..." : converting ? "Chuyển vào Công nợ phải thu" : "Lưu thay đổi"}
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
  // "Chuyển vào Công nợ": the entry stops being cash and becomes a receivable of the same amount.
  const customerName = (entry as CashLedgerEntry & { transaction?: { customer?: { name: string } | null } | null }).transaction?.customer?.name ?? "";
  const [toDebt, setToDebt] = useState(false);
  const [debtPerson, setDebtPerson] = useState(customerName);
  const convertible = canConvertToReceivable(entry);
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
          {convertible && (
            <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="convertToDebt"
                  checked={toDebt}
                  onChange={(e) => {
                    setToDebt(e.target.checked);
                    if (e.target.checked && !debtPerson) setDebtPerson(customerName);
                  }}
                  className="mt-0.5 h-4 w-4 accent-amber-500"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <HandCoins className="h-4 w-4 text-amber-500" />
                    Chuyển vào Công nợ phải thu
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Khoản này chưa thu được tiền: gỡ khỏi Dòng tiền (tiền mặt không tăng) và ghi {formatVND(Number(amount) || 0)} vào Sổ công nợ.
                  </span>
                </span>
              </label>
              {toDebt && (
                <div className="space-y-1.5">
                  <Label htmlFor="debtPersonName">Khách / người đang nợ</Label>
                  <Input
                    id="debtPersonName"
                    name="debtPersonName"
                    value={debtPerson}
                    onChange={(e) => setDebtPerson(e.target.value)}
                    placeholder="Tên khách hàng"
                    required
                  />
                </div>
              )}
            </div>
          )}
          {isLinked && (
            <p className="text-xs text-muted-foreground">
              Giao dịch này gắn với một đơn mua/bán hoặc một khoản Ghi Nợ/Ứng Tiền nên chỉ sửa
              được mô tả — số tiền lấy theo bản ghi gốc. Muốn đổi số tiền, hãy sửa/xoá ở trang
              Inventory hoặc Giao Hàng.
            </p>
          )}
          <SubmitButton converting={toDebt} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
