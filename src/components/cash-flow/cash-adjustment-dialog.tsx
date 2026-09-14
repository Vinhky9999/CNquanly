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

export function CashAdjustmentDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(createCashAdjustmentAction, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success("Đã ghi nhận điều chỉnh tiền mặt");
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">+ Điều chỉnh tiền mặt</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Điều chỉnh tiền mặt thủ công</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền (âm nếu rút ra)</Label>
            <Input id="amount" name="amount" type="number" step="1000" required />
          </div>
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
