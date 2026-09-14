import { NextRequest, NextResponse } from "next/server";

import { generateFinancialReportBuffer } from "@/lib/export-report";

function formatFilenameDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const all = searchParams.get("all") === "1";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const from = !all && fromParam ? new Date(`${fromParam}T00:00:00`) : null;
  const to = !all && toParam ? new Date(`${toParam}T23:59:59.999`) : null;

  const buffer = await generateFinancialReportBuffer({ from, to });
  const filename = `CardNest_BaoCao_${formatFilenameDate(new Date())}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
