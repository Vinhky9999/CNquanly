"use client";

import type { Customer, CustomerTag } from "@prisma/client";

import { createCustomerAction, updateCustomerAction } from "@/server/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagMultiselect } from "@/components/customers/tag-multiselect";

interface CustomerFormProps {
  customer?: Customer & { tags: CustomerTag[] };
  allTags: CustomerTag[];
}

export function CustomerForm({ customer, allTags }: CustomerFormProps) {
  const action = customer ? updateCustomerAction.bind(null, customer.id) : createCustomerAction;

  return (
    <form action={action} className="max-w-xl space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Tên khách hàng</Label>
        <Input id="name" name="name" defaultValue={customer?.name} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Số điện thoại</Label>
          <Input id="phone" name="phone" defaultValue={customer?.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="zalo">Zalo</Label>
          <Input id="zalo" name="zalo" defaultValue={customer?.zalo ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="facebook">Facebook</Label>
        <Input id="facebook" name="facebook" defaultValue={customer?.facebook ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Địa chỉ</Label>
        <Input id="address" name="address" defaultValue={customer?.address ?? ""} />
      </div>
      <div className="space-y-2">
        <Label>Tag</Label>
        <TagMultiselect
          allTags={allTags}
          defaultSelectedIds={customer?.tags.map((t) => t.id) ?? []}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Ghi chú sở thích ngách</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={customer?.notes ?? ""}
          placeholder="VD: thích săn box One Piece OP-01, ưu tiên báo giá sớm khi có hàng hiếm..."
        />
      </div>
      <Button type="submit">{customer ? "Lưu thay đổi" : "Thêm khách hàng"}</Button>
    </form>
  );
}
