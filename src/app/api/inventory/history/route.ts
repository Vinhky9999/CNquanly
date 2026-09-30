import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const SORTABLE_FIELDS = ["date", "quantity", "subtotal"] as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "25")));
  const search = searchParams.get("search")?.trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const sortByParam = searchParams.get("sortBy") ?? "date";
  const sortBy = (SORTABLE_FIELDS as readonly string[]).includes(sortByParam)
    ? (sortByParam as (typeof SORTABLE_FIELDS)[number])
    : "date";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const transactionWhere: Prisma.TransactionWhereInput = {
    ...(dateFrom || dateTo
      ? {
          transactionDate: {
            ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
            ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  };

  const where: Prisma.TransactionItemWhereInput = {
    transaction: transactionWhere,
    ...(search
      ? {
          OR: [
            {
              sealedProduct: {
                OR: [
                  { sku: { contains: search, mode: "insensitive" } },
                  { name: { contains: search, mode: "insensitive" } },
                ],
              },
            },
            {
              singleCard: {
                OR: [
                  { sku: { contains: search, mode: "insensitive" } },
                  { cardName: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.TransactionItemOrderByWithRelationInput =
    sortBy === "date" ? { transaction: { transactionDate: sortDir } } : { [sortBy]: sortDir };

  const [rows, total] = await Promise.all([
    prisma.transactionItem.findMany({
      where,
      include: {
        transaction: { select: { type: true, transactionDate: true } },
        sealedProduct: { select: { sku: true, name: true } },
        singleCard: { select: { sku: true, cardName: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transactionItem.count({ where }),
  ]);

  const mapped = rows.map((item) => ({
    id: item.id,
    date: item.transaction.transactionDate,
    type: item.transaction.type,
    itemType: item.itemType,
    sku: item.sealedProduct?.sku ?? item.singleCard?.sku ?? "—",
    productName: item.sealedProduct?.name ?? item.singleCard?.cardName ?? "—",
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    subtotal: Number(item.subtotal),
  }));

  return NextResponse.json({ rows: mapped, total, page, pageSize });
}
