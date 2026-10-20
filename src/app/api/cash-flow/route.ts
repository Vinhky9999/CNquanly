import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const SORTABLE_FIELDS = ["createdAt", "amount", "description", "type"] as const;

// Entry types in the alphabetical order of the Vietnamese labels shown in the table (the DB enum order is not alphabetical).
const TYPES_BY_LABEL = [
  "GRADING_COST", // Chi phí chấm điểm
  "SALE", // Doanh thu
  "MANUAL_ADJUSTMENT", // Điều chỉnh
  "PURCHASE", // Mua hàng
  "WITHDRAWAL", // Rút tiền
  "GRADING_INCOME", // Thu chấm điểm
  "DEBT_COLLECTION", // Thu hồi tiền ứng
  "DEBT_REPAYMENT", // Trả nợ ứng tiền
] as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "25")));
  const search = searchParams.get("search")?.trim();
  const sortByParam = searchParams.get("sortBy") ?? "createdAt";
  const sortBy = (SORTABLE_FIELDS as readonly string[]).includes(sortByParam)
    ? (sortByParam as (typeof SORTABLE_FIELDS)[number])
    : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Prisma.CashLedgerEntryWhereInput = search
    ? { description: { contains: search, mode: "insensitive" } }
    : {};

  // Entries without a description always sort last; ties fall back to newest first so paging stays stable.
  const orderBy: Prisma.CashLedgerEntryOrderByWithRelationInput[] = [
    sortBy === "description" ? { description: { sort: sortDir, nulls: "last" } } : { [sortBy]: sortDir },
    ...(sortBy === "createdAt"
      ? [{ id: sortDir } as Prisma.CashLedgerEntryOrderByWithRelationInput]
      : [{ createdAt: "desc" }, { id: "desc" }] as Prisma.CashLedgerEntryOrderByWithRelationInput[]),
  ];

  const include = { transaction: { select: { source: true } } } as const;

  async function findRows() {
    if (sortBy !== "type") {
      return prisma.cashLedgerEntry.findMany({ where, include, orderBy, skip: (page - 1) * pageSize, take: pageSize });
    }
    // Sorting by type label: rank each entry type in SQL, page the ids, then load them in that order.
    const rank = Prisma.join(TYPES_BY_LABEL.map((t, i) => Prisma.sql`WHEN ${t} THEN ${i}`), " ");
    const like = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : null;
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "CashLedgerEntry"
      WHERE (${like}::text IS NULL OR description ILIKE ${like})
      ORDER BY CASE "type"::text ${rank} ELSE 99 END ${Prisma.raw(sortDir === "asc" ? "ASC" : "DESC")}, "createdAt" DESC, id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    const found = await prisma.cashLedgerEntry.findMany({ where: { id: { in: ids.map((r) => r.id) } }, include });
    const byId = new Map(found.map((r) => [r.id, r]));
    return ids.map((r) => byId.get(r.id)!).filter(Boolean);
  }

  const [rows, total] = await Promise.all([findRows(), prisma.cashLedgerEntry.count({ where })]);

  return NextResponse.json({ rows, total, page, pageSize });
}
