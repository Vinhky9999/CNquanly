import { NextRequest, NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { generateMonthlyReportBuffer, monthlyReportFilename, parseMonthParam } from "@/lib/monthly-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/reports/monthly?month=YYYY-MM -> CardNest_BaoCao_Thang_MM_YYYY.xlsx (login required)
export async function GET(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const range = parseMonthParam(request.nextUrl.searchParams.get("month"));
  if (!range) return NextResponse.json({ error: "Tháng không hợp lệ (dạng YYYY-MM)" }, { status: 400 });

  try {
    const buffer = await generateMonthlyReportBuffer(range);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${monthlyReportFilename(range)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Không thể tạo báo cáo tháng" }, { status: 500 });
  }
}
