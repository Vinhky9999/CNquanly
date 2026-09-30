import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const SORTABLE_FIELDS = ["name", "quantity", "costPrice", "createdAt"] as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "25")));
  const search = searchParams.get("search")?.trim();
  const game = searchParams.get("game")?.trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
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
