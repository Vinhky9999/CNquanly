"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  createCashWithdrawalAction,
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
    <Button type="submit" variant="destructive" disabled={pending} className="w-full">
      {pending ? "Đang lưu..." : "Ghi nhận rút tiền"}
    </Button>
  );
}

export function CashWithdrawalDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(createCashWithdrawalAction, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success("Đã ghi nhận rút tiền");
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10">
          − Rút tiền
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rút tiền khỏi Dòng Tiền</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="withdrawal-amount">Số tiền muốn rút</Label>
            <Input
              id="withdrawal-amount"
              name="amount"
              type="number"
              min={0}
              step="1000"
              placeholder="VD: 5000000"
              required
            />
            <p className="text-xs text-muted-foreground">
              Nhập số dương — hệ thống sẽ tự ghi nhận thành khoản Chi (số âm) trong Dòng Tiền.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="withdrawal-description">Lý do rút tiền</Label>
            <Input id="withdrawal-description" name="description" placeholder="VD: Rút vốn cá nhân" required />
          </div>
          <SubmitButton />
        </form>
      </DialogContent>
    </Dialog>
  );
}
