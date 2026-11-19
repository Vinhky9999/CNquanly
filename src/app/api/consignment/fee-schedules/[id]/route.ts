import { NextRequest, NextResponse } from "next/server";

import { guarded } from "@/lib/consignment/api";
import { deleteSchedule } from "@/lib/consignment/mutations";
import { loadSchedules } from "@/lib/consignment/service";

export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  return guarded(async () => {
    await deleteSchedule(params.id);
    return NextResponse.json({ schedules: await loadSchedules() });
  });
}
