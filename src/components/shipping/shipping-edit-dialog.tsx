"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import type { Customer, Transaction } from "@prisma/client";
import {
  updateShippingOrderAction,
  type ShippingActionState,
} from "@/server/actions/shipping";
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

const initialState: ShippingActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Đang lưu..." : "Lưu thay đổi"}
    </Button>
  );
}

export function ShippingEditDialog({
  order,
  onSuccess,
}: {
  order: Transaction & { customer: Customer | null };
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const action = updateShippingOrderAction.bind(null, order.id);
  const [state, formAction] = useFormState(action, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success("Đã cập nhật đơn giao hàng");
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
          <DialogTitle>Sửa đơn giao hàng</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="trackingCode">Mã tracking</Label>
              <Input id="trackingCode" name="trackingCode" defaultValue={order.trackingCode ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shippingCarrier">Đơn vị vận chuyển</Label>
              <Input
                id="shippingCarrier"
                name="shippingCarrier"
                defaultValue={order.shippingCarrier ?? ""}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipientName">Tên người nhận</Label>
            <Input id="recipientName" name="recipientName" defaultValue={order.recipientName ?? ""} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recipientPhone">SĐT</Label>
              <Input id="recipientPhone" name="recipientPhone" defaultValue={order.recipientPhone ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipientAddress">Địa chỉ</Label>
              <Input
                id="recipientAddress"
                name="recipientAddress"
                defaultValue={order.recipientAddress ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Input id="notes" name="notes" defaultValue={order.notes ?? ""} />
          </div>
          <SubmitButton />
        </form>
      </DialogContent>
    </Dialog>
  );
}
