"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { SealedProduct } from "@prisma/client";

import {
  createSealedProductAction,
  updateSealedProductAction,
  type InventoryActionState,
} from "@/server/actions/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkuAutocomplete } from "@/components/inventory/sku-autocomplete";
import { SealedNameBuilder } from "@/components/inventory/sealed-name-builder";

const STOCK_STATUS_OPTIONS = [
  { value: "IN_STOCK", label: "Sẵn hàng" },
  { value: "IN_TRANSIT", label: "Đang ship về" },
  { value: "PRE_ORDER", label: "Pre-order" },
  { value: "ON_HOLD", label: "Đang Hold" },
];

const initialState: InventoryActionState = {};

function SubmitButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Đang lưu..." : label}
    </Button>
  );
}

export function SealedProductForm({ product }: { product?: SealedProduct }) {
  const action = product
    ? updateSealedProductAction.bind(null, product.id)
    : createSealedProductAction;
  const [state, formAction] = useFormState(action, initialState);
  const [nameBuilder, setNameBuilder] = useState({ name: "", game: "", isValid: false });

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {product ? (
        <div className="space-y-2">
          <Label>Mã SKU</Label>
          <Input value={product.sku} disabled />
        </div>
      ) : (
        <SkuAutocomplete />
      )}

      {product ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="name">Tên Box/Case</Label>
            <Input id="name" name="name" defaultValue={product.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="game">Dòng game (tuỳ chọn)</Label>
            <Input id="game" name="game" defaultValue={product.game ?? ""} placeholder="Pokemon, One Piece, ..." />
          </div>
        </>
      ) : (
        <>
          <SealedNameBuilder onChange={setNameBuilder} />
          <input type="hidden" name="name" value={nameBuilder.name} />
          <input type="hidden" name="game" value={nameBuilder.game} />
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">{product ? "Số lượng" : "Số lượng nhập thêm"}</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min={product ? 0 : 1}
            defaultValue={product?.quantity ?? 1}
            onFocus={(e) => e.currentTarget.select()}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="costPrice">{product ? "Giá nhập gốc" : "Giá nhập (lần này)"}</Label>
          <Input
            id="costPrice"
            name="costPrice"
            type="number"
            min={0}
            step="1000"
            defaultValue={product ? Number(product.costPrice) : undefined}
            onFocus={(e) => e.currentTarget.select()}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="status">Trạng thái</Label>
        <Select name="status" defaultValue={product?.status ?? "IN_STOCK"}>
          <SelectTrigger id="status">
            <SelectValue placeholder="Chọn trạng thái" />
          </SelectTrigger>
          <SelectContent>
            {STOCK_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Ghi chú</Label>
        <Textarea id="notes" name="notes" defaultValue={product?.notes ?? ""} />
      </div>
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
        <input
          type="checkbox"
          id="skipCashLedger"
          name="skipCashLedger"
          className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
        />
        <div>
          <Label htmlFor="skipCashLedger" className="font-normal leading-snug">
            Hàng có sẵn (Không đồng bộ trừ tiền vào Dòng Tiền)
          </Label>
          {product && (
            <p className="text-xs text-muted-foreground">
              Chỉ áp dụng khi tăng số lượng tồn kho — nếu không tích, phần tăng thêm sẽ tự trừ vào Dòng Tiền.
            </p>
          )}
        </div>
      </div>
      {state.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
      <SubmitButton
        label={product ? "Lưu thay đổi" : "Thêm hàng"}
        disabled={!product && !nameBuilder.isValid}
      />
    </form>
  );
}
