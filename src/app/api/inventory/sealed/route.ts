import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const SORTABLE_FIELDS = ["name", "quantity", "costPrice", "createdAt"] as const;
const STOCK_STATUSES = ["IN_STOCK", "IN_TRANSIT", "PRE_ORDER", "ON_HOLD"] as const;

// Optional numeric range filters (VND). Blank / invalid values are ignored.
function numberParam(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function rangeFilter(min: string | null, max: string | null) {
  const gte = numberParam(min);
  const lte = numberParam(max);
  return gte === undefined && lte === undefined ? undefined : { ...(gte !== undefined ? { gte } : {}), ...(lte !== undefined ? { lte } : {}) };
}


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "25")));
  const search = searchParams.get("search")?.trim();
  const game = searchParams.get("game")?.trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const status = searchParams.get("status");
  const stock = searchParams.get("stock"); // "in" = quantity > 0, "out" = sold out
  const priced = searchParams.get("priced"); // "yes" | "no": has a market price
  const costRange = rangeFilter(searchParams.get("costMin"), searchParams.get("costMax"));
  const marketRange = rangeFilter(searchParams.get("marketMin"), searchParams.get("marketMax"));
  const sortByParam = searchParams.get("sortBy") ?? "createdAt";
  const sortBy = (SORTABLE_FIELDS as readonly string[]).includes(sortByParam)
    ? (sortByParam as (typeof SORTABLE_FIELDS)[number])
    : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Prisma.SealedProductWhereInput = {
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { game: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(game
      ? game === "Khác"
        ? { game: null }
        : { game: { equals: game, mode: "insensitive" } }
      : {}),
    ...(status && (STOCK_STATUSES as readonly string[]).includes(status)
      ? { status: status as (typeof STOCK_STATUSES)[number] }
      : {}),
    ...(stock === "in" ? { quantity: { gt: 0 } } : stock === "out" ? { quantity: { lte: 0 } } : {}),
    ...(costRange ? { costPrice: costRange } : {}),
    ...(marketRange ? { marketPrice: marketRange } : priced === "yes" ? { marketPrice: { not: null } } : priced === "no" ? { marketPrice: null } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
            ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.sealedProduct.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sealedProduct.count({ where }),
  ]);

  return NextResponse.json({ rows, total, page, pageSize });
}
