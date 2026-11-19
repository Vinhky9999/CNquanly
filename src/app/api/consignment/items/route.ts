import { NextRequest, NextResponse } from "next/server";

import { guarded, readJson } from "@/lib/consignment/api";
import { createItem } from "@/lib/consignment/mutations";
import { getItemDto, listItems, summarize, type ItemFilters } from "@/lib/consignment/service";
import { createItemSchema, LISTING_STATUSES } from "@/lib/consignment/validation";

export const dynamic = "force-dynamic";

function filtersFrom(params: URLSearchParams): ItemFilters {
  const status = params.get("status");
  return {
    q: params.get("search") ?? params.get("q") ?? undefined,
    customer: params.get("customer") ?? undefined,
    orderCode: params.get("orderCode") ?? undefined,
    status: status === "NEEDS_RESULT" || (LISTING_STATUSES as readonly string[]).includes(status ?? "") ? (status as ItemFilters["status"]) : undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
  };
}

/** The cards (paged, same shape as the other tables) or, with ?summary=1, the dashboard totals for the same filters. */
export async function GET(request: NextRequest) {
  return guarded(async () => {
    const params = request.nextUrl.searchParams;
    const filters = filtersFrom(params);
    if (params.get("summary") === "1") return NextResponse.json(await summarize(filters));
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(params.get("pageSize")) || 25));
    const { rows, total } = await listItems(filters, {
      page,
      pageSize,
      sortBy: params.get("sortBy") ?? undefined,
      sortDir: params.get("sortDir") === "asc" ? "asc" : "desc",
    });
    return NextResponse.json({ rows, total, page, pageSize });
  });
}

export async function POST(request: NextRequest) {
  return guarded(async () => {
    const input = createItemSchema.parse(await readJson(request));
    const id = await createItem(input);
    return NextResponse.json({ item: await getItemDto(id) }, { status: 201 });
  });
}
