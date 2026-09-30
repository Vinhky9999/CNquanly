"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";

import { createDebtAction, type DebtActionState } from "@/server/actions/debts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initialState: DebtActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Đang lưu..." : "Thêm khoản ứng tiền"}
    </Button>
  );
}

export function DebtFormDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"ADVANCED_BY_PERSON" | "ADVANCED_TO_PERSON">(
    "ADVANCED_BY_PERSON"
  );
  const [state, formAction] = useFormState(createDebtAction, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success("Đã thêm khoản ứng tiền");
      setOpen(false);
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="ml-auto">
          + Thêm khoản ứng tiền
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm khoản Ghi Nợ / Ứng Tiền</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label>Loại nợ</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={type === "ADVANCED_BY_PERSON" ? "default" : "outline"}
                className="h-auto flex-col items-start gap-1 whitespace-normal p-3 text-left"
                onClick={() => setType("ADVANCED_BY_PERSON")}
              >
                <span className="font-semibold">Người ứng tiền mua hộ</span>
                <span className="text-xs font-normal opacity-80">CardNest nợ người này (phải trả)</span>
              </Button>
              <Button
                type="button"
                variant={type === "ADVANCED_TO_PERSON" ? "default" : "outline"}
                className="h-auto flex-col items-start gap-1 whitespace-normal p-3 text-left"
                onClick={() => setType("ADVANCED_TO_PERSON")}
              >
                <span className="font-semibold">CardNest ứng tiền quỹ</span>
                <span className="text-xs font-normal opacity-80">Người này nợ CardNest (phải thu)</span>
              </Button>
            </div>
            <input type="hidden" name="type" value={type} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="personName">Tên người ứng tiền</Label>
            <Input id="personName" name="personName" placeholder="VD: Anh Long, Chị Mai..." required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              min={0}
              step="1000"
              placeholder="VD: 5000000"
              onFocus={(e) => e.currentTarget.select()}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="referenceLabel">Mã SKU / Tên lô hàng liên quan (tuỳ chọn)</Label>
            <Input
              id="referenceLabel"
              name="referenceLabel"
              placeholder="VD: POKE-M2al hoặc Lô Base Set tháng 10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú (tuỳ chọn)</Label>
            <Textarea id="notes" name="notes" placeholder="Chi tiết thêm về khoản ứng tiền này..." />
          </div>

          <SubmitButton />
        </form>
      </DialogContent>
    </Dialog>
  );
}
