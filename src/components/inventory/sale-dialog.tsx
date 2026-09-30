"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";

import { createSaleTransactionAction, type SaleActionState } from "@/server/actions/transactions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: SaleActionState = {};

interface CustomerOption {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Đang ghi nhận..." : "Ghi nhận"}
    </Button>
  );
}

interface SaleDialogProps {
  itemType: "SEALED" | "SINGLE";
  itemId: string;
  itemLabel: string;
  defaultUnitPrice: number;
  maxQuantity?: number;
  onSuccess?: () => void;
}

export function SaleDialog({
  itemType,
  itemId,
  itemLabel,
  defaultUnitPrice,
  maxQuantity,
  onSuccess,
}: SaleDialogProps) {
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState<string>("__new__");
  const [orderType, setOrderType] = useState<"DIRECT" | "DELIVERY">("DIRECT");
  const [state, formAction] = useFormState(createSaleTransactionAction, initialState);

  useEffect(() => {
    if (!open) return;
    fetch("/api/customers?pageSize=200")
      .then((res) => res.json())
      .then((json) => setCustomers(json.rows ?? []));
  }, [open]);

  useEffect(() => {
    if (state.success) {
      toast.success("Đã ghi nhận giao dịch");
      setOpen(false);
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Ghi nhận bán
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ghi nhận bán — {itemLabel}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="itemType" value={itemType} />
          <input type="hidden" name="itemId" value={itemId} />

          <div className="space-y-2">
            <Label>Loại đơn</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={orderType === "DIRECT" ? "default" : "outline"}
                onClick={() => setOrderType("DIRECT")}
              >
                Bán trực tiếp
              </Button>
              <Button
                type="button"
                variant={orderType === "DELIVERY" ? "default" : "outline"}
                onClick={() => setOrderType("DELIVERY")}
              >
                Giao hàng
              </Button>
            </div>
            <input type="hidden" name="orderType" value={orderType} />
          </div>

          {(itemType === "SEALED" || (maxQuantity ?? 1) > 1) && (
            <div className="space-y-2">
              <Label htmlFor="quantity">Số lượng bán</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                max={maxQuantity}
                defaultValue={1}
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="unitPrice">
              Giá bán {itemType === "SEALED" || (maxQuantity ?? 1) > 1 ? "(đơn giá)" : ""}
            </Label>
            <Input
              id="unitPrice"
              name="unitPrice"
              type="number"
              min={0}
              step="1000"
              defaultValue={defaultUnitPrice}
              onFocus={(e) => e.currentTarget.select()}
              required
            />
          </div>

          {orderType === "DELIVERY" && (
            <div className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-3">
              <div className="space-y-2">
                <Label htmlFor="trackingCode">Mã tracking</Label>
                <Input id="trackingCode" name="trackingCode" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shippingCarrier">Đơn vị vận chuyển</Label>
                <Input
                  id="shippingCarrier"
                  name="shippingCarrier"
                  placeholder="GHN, GHTK, Viettel Post..."
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Khách hàng</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">+ Khách mới / khách lẻ</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {customerId !== "__new__" && (
              <input type="hidden" name="customerId" value={customerId} />
            )}
          </div>

          {customerId !== "__new__" && orderType === "DELIVERY" && (
            <p className="rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Giao tới: <span className="font-medium text-foreground">{selectedCustomer?.name}</span>
              {selectedCustomer?.phone ? ` · ${selectedCustomer.phone}` : ""}
              {selectedCustomer?.address ? ` · ${selectedCustomer.address}` : " · chưa có địa chỉ (thêm ở trang Khách hàng)"}
            </p>
          )}

          {customerId === "__new__" && orderType === "DIRECT" && (
            <div className="space-y-2">
              <Label htmlFor="newCustomerName">Tên khách mới (bỏ trống nếu khách lẻ)</Label>
              <Input id="newCustomerName" name="newCustomerName" />
            </div>
          )}

          {customerId === "__new__" && orderType === "DELIVERY" && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Thông tin người nhận (khách lẻ)</p>
              <div className="space-y-2">
                <Label htmlFor="recipientName">Tên người nhận</Label>
                <Input id="recipientName" name="recipientName" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="recipientPhone">SĐT</Label>
                  <Input id="recipientPhone" name="recipientPhone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recipientAddress">Địa chỉ</Label>
                  <Input id="recipientAddress" name="recipientAddress" />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Input id="notes" name="notes" />
          </div>

          <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
            <input
              type="checkbox"
              id="skipCashLedgerSale"
              name="skipCashLedger"
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            <Label htmlFor="skipCashLedgerSale" className="font-normal leading-snug">
              Hàng nội bộ (Không đồng bộ Doanh thu vào Dòng Tiền)
            </Label>
          </div>

          <SubmitButton />
        </form>
      </DialogContent>
    </Dialog>
  );
}
