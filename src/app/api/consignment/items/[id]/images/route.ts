import { NextRequest, NextResponse } from "next/server";

import { guarded, readJson } from "@/lib/consignment/api";
import { addUploads } from "@/lib/consignment/mutations";
import { getItemDto } from "@/lib/consignment/service";
import { uploadSchema } from "@/lib/consignment/validation";

export const dynamic = "force-dynamic";

/** Adds photos uploaded by hand (JPEG / PNG / WebP data URLs, already shrunk by the browser). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return guarded(async () => {
    await addUploads(params.id, uploadSchema.parse(await readJson(request)).uploads);
    return NextResponse.json({ item: await getItemDto(params.id) }, { status: 201 });
  });
}
