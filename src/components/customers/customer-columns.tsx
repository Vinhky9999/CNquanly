"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { Customer, CustomerTag } from "@prisma/client";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TagBadge } from "@/components/customers/tag-badge";
import { formatVND } from "@/lib/utils";
import { deleteCustomerAction } from "@/server/actions/customers";

type CustomerRow = Customer & { tags: CustomerTag[]; orderCount?: number; totalSpent?: number };

export const customerColumns: ColumnDef<CustomerRow, any>[] = [
  {
    accessorKey: "name",
    header: "Tên khách hàng",
    cell: ({ row }) => (
      <Link href={`/customers/${row.original.id}`} className="font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  { accessorKey: "phone", header: "SĐT", cell: ({ row }) => row.original.phone ?? "—" },
  { accessorKey: "zalo", header: "Zalo", cell: ({ row }) => row.original.zalo ?? "—" },
  {
    accessorKey: "address",
    header: "Địa chỉ",
    cell: ({ row }) => (
      <span className="line-clamp-1 max-w-[220px]">{row.original.address ?? "—"}</span>
    ),
  },
  {
    id: "orderCount",
    header: "Số đơn mua",
    cell: ({ row }) => <span className="tabular-nums">{row.original.orderCount ?? 0}</span>,
  },
  {
    id: "totalSpent",
    header: "Tổng chi tiêu",
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-medium tabular-nums">{formatVND(row.original.totalSpent ?? 0)}</span>
    ),
  },
  {
    id: "tags",
    header: "Tag",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.tags.map((tag) => (
          <TagBadge key={tag.id} name={tag.name} color={tag.color} />
        ))}
      </div>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const customer = row.original;
      const onMutated = table.options.meta?.onMutated;
      return (
        <div className="flex items-center justify-end gap-2">
          <Button asChild size="icon" variant="ghost">
            <Link href={`/customers/${customer.id}`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              if (!confirm(`Xoá khách hàng "${customer.name}"?`)) return;
              await deleteCustomerAction(customer.id);
              toast.success("Đã xoá khách hàng");
              onMutated?.();
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      );
    },
  },
];
