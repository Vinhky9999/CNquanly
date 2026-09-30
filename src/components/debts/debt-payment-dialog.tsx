"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { Debt } from "@prisma/client";
import { toast } from "sonner";

import { createDebtPaymentAction, type DebtActionState } from "@/server/actions/debts";
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
import { formatVND } from "@/lib/utils";

const initialState: DebtActionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Đang lưu..." : label}
    </Button>
  );
}

export function DebtPaymentDialog({ debt, onSuccess }: { debt: Debt; onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(createDebtPaymentAction, initialState);

  const remaining = Number(debt.amount) - Number(debt.paidAmount);
  const isRepayment = debt.type === "ADVANCED_BY_PERSON";

  useEffect(() => {
    if (state.success) {
      toast.success(isRepayment ? "Đã ghi nhận trả nợ" : "Đã ghi nhận thu hồi");
      setOpen(false);
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (debt.status === "PAID") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Thanh toán
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isRepayment ? "Trả nợ ứng tiền" : "Thu hồi tiền ứng"} — {debt.personName}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="debtId" value={debt.id} />
          <p className="rounded-md bg-muted/30 px-3 py-2 text-sm">
            Tổng khoản nợ: <span className="font-medium">{formatVND(Number(debt.amount))}</span>
            {" · "}Đã {isRepayment ? "trả" : "thu"}: <span className="font-medium">{formatVND(Number(debt.paidAmount))}</span>
            {" · "}Còn lại:{" "}
            <span className="font-semibold text-foreground">{formatVND(remaining)}</span>
          </p>
          <div className="space-y-2">
            <Label htmlFor="payment-amount">
              Số tiền {isRepayment ? "trả" : "thu hồi"} lần này
            </Label>
            <Input
              id="payment-amount"
              name="amount"
              type="number"
              min={0}
              max={remaining}
              step="1000"
              defaultValue={remaining}
              onFocus={(e) => e.currentTarget.select()}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-note">Ghi chú (tuỳ chọn)</Label>
            <Input id="payment-note" name="note" placeholder="VD: Trả bằng tiền mặt tại shop" />
          </div>
          <SubmitButton label={isRepayment ? "Ghi nhận trả nợ" : "Ghi nhận thu hồi"} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
