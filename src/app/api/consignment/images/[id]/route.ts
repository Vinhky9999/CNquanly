import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** The saved copy of a card photo (login required; photos belong to the owner's customers). */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const image = await prisma.consignmentImage.findUnique({ where: { id: params.id }, select: { data: true, contentType: true } });
  if (!image?.data || !image.contentType) return NextResponse.json({ error: "Không có ảnh" }, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), {
    headers: { "content-type": image.contentType, "cache-control": "private, max-age=86400, immutable" },
  });
}
