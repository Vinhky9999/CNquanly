import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const SORTABLE_FIELDS = ["createdAt", "amount", "personName"] as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "25")));
  const search = searchParams.get("search")?.trim();
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const sortByParam = searchParams.get("sortBy") ?? "createdAt";
  const sortBy = (SORTABLE_FIELDS as readonly string[]).includes(sortByParam)
    ? (sortByParam as (typeof SORTABLE_FIELDS)[number])
    : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Prisma.DebtWhereInput = {
    ...(search
      ? {
          OR: [
            { personName: { contains: search, mode: "insensitive" } },
            { referenceLabel: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(type ? { type: type as Prisma.EnumDebtTypeFilter["equals"] } : {}),
    ...(status ? { status: status as Prisma.EnumDebtStatusFilter["equals"] } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.debt.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.debt.count({ where }),
  ]);

  return NextResponse.json({ rows, total, page, pageSize });
}
