import { NextRequest, NextResponse } from "next/server";
import type { GradingStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { GRADING_STATUSES } from "@/lib/grading";
import { getGradingSummary } from "@/lib/grading-summary";

const SORTABLE_FIELDS = ["createdAt", "chargeAmount", "costPrice", "markup", "customerName"] as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // ?summary=1 returns only the overview cards' numbers.
  if (searchParams.get("summary") === "1") {
    return NextResponse.json(await getGradingSummary());
  }

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "25")));
  const search = searchParams.get("search")?.trim();
  const status = searchParams.get("status") as GradingStatus | null;
  const sortByParam = searchParams.get("sortBy") ?? "createdAt";
  const sortBy = (SORTABLE_FIELDS as readonly string[]).includes(sortByParam)
    ? (sortByParam as (typeof SORTABLE_FIELDS)[number])
    : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Prisma.GradingSubmissionWhereInput = {
    ...(status && GRADING_STATUSES.includes(status) ? { status } : {}),
    ...(search
      ? {
          OR: [
            { customerName: { contains: search, mode: "insensitive" } },
            { customerContact: { contains: search, mode: "insensitive" } },
            { cardName: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { certNumber: { contains: search, mode: "insensitive" } },
            { company: { contains: search, mode: "insensitive" } },
            { items: { some: { OR: [
              { cardName: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { certNumber: { contains: search, mode: "insensitive" } },
            ] } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.gradingSubmission.findMany({
      where,
      include: { items: { orderBy: { position: "asc" } } },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.gradingSubmission.count({ where }),
  ]);

  return NextResponse.json({ rows, total, page, pageSize });
}
