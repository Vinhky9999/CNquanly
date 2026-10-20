"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  createCashAdjustmentAction,
  type CashAdjustmentActionState,
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

const initialState: CashAdjustmentActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Đang lưu..." : "Ghi nhận điều chỉnh"}
    </Button>
  );
}

export function CashAdjustmentDialog({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [countsAsProfit, setCountsAsProfit] = useState(false);
  const [state, formAction] = useFormState(createCashAdjustmentAction, initialState);

  // A fresh form every time the dialog opens.
  useEffect(() => {
    if (open) {
      setAmount("");
      setCountsAsProfit(false);
    }
  }, [open]);

  const positive = Number(amount) > 0;

  useEffect(() => {
    if (state.success) {
      toast.success("Đã ghi nhận điều chỉnh tiền mặt");
      setOpen(false);
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10">+ Điều chỉnh tiền mặt</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Điều chỉnh tiền mặt thủ công</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền (âm nếu rút ra)</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="1000"
              required
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (!(Number(e.target.value) > 0)) setCountsAsProfit(false);
              }}
            />
          </div>
          {positive && (
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
                <span className="block text-xs text-muted-foreground">
                  {countsAsProfit
                    ? "Số tiền sẽ được cộng vào Lợi nhuận của tháng này trong báo cáo Tổng quan và file Excel."
                    : "Bỏ chọn nếu chỉ là bù quỹ / góp vốn (tiền vào quỹ nhưng không phải lãi)."}
                </span>
              </span>
            </label>
          )}
          <div className="space-y-2">
            <Label htmlFor="description">Lý do</Label>
            <Input id="description" name="description" required />
          </div>
          <SubmitButton />
        </form>
      </DialogContent>
    </Dialog>
  );
}
