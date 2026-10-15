import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

// Quick lookup for the chat sidebar (owner-only screen). costPrice is shown to the owner in the panel but is
// never part of the text built for customers (see lib/inbox-quote.ts).
export async function GET(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ rows: [] });

  const [sealed, singles] = await Promise.all([
    prisma.sealedProduct.findMany({
      where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] },
      select: { id: true, sku: true, name: true, game: true, quantity: true, costPrice: true, marketPrice: true, status: true, imageUrl: true },
      take: 10,
    }),
    prisma.singleCard.findMany({
      where: {
        status: { not: "SOLD" },
        OR: [{ cardName: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }],
      },
      select: {
        id: true, sku: true, cardName: true, game: true, quantity: true, costPrice: true, marketPrice: true, status: true, imageUrl: true,
        condition: true, rawGrade: true, grade: true, gradingCompany: { select: { name: true } },
      },
      take: 10,
    }),
  ]);

  const rows = [
    ...sealed.map((p) => ({
      kind: "SEALED" as const,
      id: p.id,
      sku: p.sku,
      name: p.name,
      game: p.game,
      quantity: p.quantity,
      costPrice: Number(p.costPrice),
      marketPrice: p.marketPrice != null ? Number(p.marketPrice) : null,
      status: p.status as string,
      imageUrl: p.imageUrl,
      detail: null as string | null,
    })),
    ...singles.map((c) => ({
      kind: "SINGLE" as const,
      id: c.id,
      sku: c.sku,
      name: c.cardName,
      game: c.game,
      quantity: c.quantity,
      costPrice: Number(c.costPrice),
      marketPrice: c.marketPrice != null ? Number(c.marketPrice) : null,
      status: c.status as string,
      imageUrl: c.imageUrl,
      detail:
        c.condition === "GRADED"
          ? `${c.gradingCompany?.name ?? "Graded"} ${c.grade != null ? Number(c.grade) : ""}`.trim()
          : `Raw${c.rawGrade ? ` hạng ${c.rawGrade}` : ""}`,
    })),
  ];
  return NextResponse.json({ rows });
}
