import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireApiSession } from "@/lib/api-auth";
import { ConsignmentError } from "@/lib/consignment/mutations";

/** Runs an API handler behind the login check and turns the known errors into readable JSON responses. */
export async function guarded(run: () => Promise<NextResponse>): Promise<NextResponse> {
  const denied = await requireApiSession();
  if (denied) return denied;
  return handle(run);
}

export async function handle(run: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ConsignmentError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    console.error("[consignment]", err);
    return NextResponse.json({ error: "Có lỗi xảy ra khi xử lý. Thử lại sau." }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ConsignmentError("Dữ liệu gửi lên không hợp lệ.");
  }
}
