import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const SORTABLE_FIELDS = ["name", "createdAt"] as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "25")));
  const search = searchParams.get("search")?.trim();
  const tagId = searchParams.get("tagId");
  const sortByParam = searchParams.get("sortBy") ?? "createdAt";
  const sortBy = (SORTABLE_FIELDS as readonly string[]).includes(sortByParam)
    ? (sortByParam as (typeof SORTABLE_FIELDS)[number])
    : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Prisma.CustomerWhereInput = {
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { zalo: { contains: search, mode: "insensitive" } },
            { facebook: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(tagId ? { tags: { some: { id: tagId } } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { tags: true },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  // Real totals from the SALE orders of the customers on this page (what the chat payment confirmation feeds).
  const sales = rows.length
    ? await prisma.transaction.groupBy({
        by: ["customerId"],
        where: { type: "SALE", customerId: { in: rows.map((r) => r.id) } },
        _sum: { totalAmount: true },
        _count: { _all: true },
      })
    : [];
  const byCustomer = new Map(sales.map((s) => [s.customerId, s]));
  const withTotals = rows.map((r) => ({
    ...r,
    orderCount: byCustomer.get(r.id)?._count._all ?? 0,
    totalSpent: Number(byCustomer.get(r.id)?._sum.totalAmount ?? 0),
  }));

  return NextResponse.json({ rows: withTotals, total, page, pageSize });
}
