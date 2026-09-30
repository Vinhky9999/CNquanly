import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const SORTABLE_FIELDS = ["cardName", "costPrice", "createdAt"] as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "25")));
  const search = searchParams.get("search")?.trim();
  const status = searchParams.get("status");
  const condition = searchParams.get("condition");
  const game = searchParams.get("game")?.trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const sortByParam = searchParams.get("sortBy") ?? "createdAt";
  const sortBy = (SORTABLE_FIELDS as readonly string[]).includes(sortByParam)
    ? (sortByParam as (typeof SORTABLE_FIELDS)[number])
    : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Prisma.SingleCardWhereInput = {
    ...(search
      ? {
          OR: [
            { cardName: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { certNumber: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status ? { status: status as Prisma.EnumInventoryStatusFilter["equals"] } : {}),
    ...(condition
      ? { condition: condition as Prisma.EnumSingleCardConditionFilter["equals"] }
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
    prisma.singleCard.findMany({
      where,
      include: { gradingCompany: true },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.singleCard.count({ where }),
  ]);

  return NextResponse.json({ rows, total, page, pageSize });
}
