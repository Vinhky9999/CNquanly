import { NextRequest, NextResponse } from "next/server";

import { feeScheduleInputSchema } from "@/lib/consignment/fees";
import { guarded, readJson } from "@/lib/consignment/api";
import { createSchedule } from "@/lib/consignment/mutations";
import { loadSchedules } from "@/lib/consignment/service";

export const dynamic = "force-dynamic";

/** Every version of the Probstein fee schedule, newest first. */
export async function GET() {
  return guarded(async () => NextResponse.json({ schedules: await loadSchedules() }));
}

/** "Updating" the fees adds a new version, so the history of what applied when is kept. */
export async function POST(request: NextRequest) {
  return guarded(async () => {
    await createSchedule(feeScheduleInputSchema.parse(await readJson(request)));
    return NextResponse.json({ schedules: await loadSchedules() }, { status: 201 });
  });
}
