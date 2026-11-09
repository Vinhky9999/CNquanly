import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getOverviewSnapshot, getPeriodFinance } from "@/lib/ai/finance";
import { gradingStatus, listDebts, listRecentEntries, lookupCustomers, searchInventory } from "@/lib/ai/lookups";
import { resolvePeriod } from "@/lib/ai/period";

// Read-only tools the assistant can call. None of them writes anything: orders, payments and debts are still
// created from the app's own screens. Every number is a VND amount or a count taken from the live database.

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_business_overview",
    description:
      "Tổng quan hiện tại của cửa hàng: tiền mặt, giá trị kho (vốn WACC và giá thị trường US), công nợ phải thu / phải trả, tổng giá trị danh mục, doanh thu và lợi nhuận hôm nay / tháng này, số khách, tình hình chấm điểm. Dùng cho câu hỏi chung về tình hình kinh doanh.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_period_report",
    description:
      "Báo cáo tài chính của một khoảng thời gian: doanh thu (bán hàng + chấm điểm), chi phí, rút tiền, số đơn bán, lợi nhuận ròng (đã trừ đơn bán lỗ), bán nợ. Giờ Việt Nam.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "today | yesterday | this_week | last_7_days | this_month | last_month | YYYY-MM (tháng cụ thể) | YYYY-MM-DD (ngày cụ thể)",
        },
      },
      required: ["period"],
      additionalProperties: false,
    },
  },
  {
    name: "search_inventory",
    description:
      "Tra cứu kho theo tên hoặc SKU (sealed và thẻ lẻ/slab): số lượng tồn, giá vốn bình quân WACC của 1 sản phẩm, giá thị trường US (VND), giá trị vốn, lãi/lỗ ước tính. Nhiều từ trong query đều phải khớp.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Tên sản phẩm hoặc SKU, ví dụ 'charizard' hoặc 'POKE-M4'" },
        limit: { type: "integer", description: "Số kết quả tối đa (mặc định 8, tối đa 20)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "lookup_customer",
    description:
      "Tra cứu khách hàng theo tên hoặc số điện thoại: số đơn mua, tổng chi tiêu, công nợ phải thu, 5 đơn gần nhất kèm trạng thái thanh toán, đơn chấm điểm, nhãn trên Fanpage.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Tên hoặc số điện thoại khách" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "list_debts",
    description:
      "Sổ công nợ: tổng phải thu / phải trả, số dư từng người và các khoản nợ còn mở. 'receivable' = người khác nợ cửa hàng (cần thu hồi), 'payable' = cửa hàng nợ người ứng tiền.",
    input_schema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["receivable", "payable", "all"] },
        person: { type: "string", description: "Lọc theo tên người (tuỳ chọn)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_recent_transactions",
    description: "Các giao dịch Dòng tiền gần nhất, kèm mặt hàng đã bán / đã mua của từng giao dịch.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Số giao dịch (mặc định 10, tối đa 30)" },
        kind: { type: "string", enum: ["sale", "purchase", "all"], description: "sale = thu bán hàng / chấm điểm, purchase = chi nhập hàng / chấm điểm" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_grading_status",
    description: "Dịch vụ chấm điểm thẻ: tổng quan (doanh thu, giá gốc, phí ship, lãi, chưa thu) và các đơn đang xử lý, có thể lọc theo tên khách.",
    input_schema: {
      type: "object",
      properties: { customer: { type: "string", description: "Tên khách (tuỳ chọn)" } },
      additionalProperties: false,
    },
  },
];

const schemas = {
  get_business_overview: z.object({}).passthrough(),
  get_period_report: z.object({ period: z.string().min(1).max(40) }),
  search_inventory: z.object({ query: z.string().min(1).max(120), limit: z.number().int().min(1).max(20).optional() }),
  lookup_customer: z.object({ query: z.string().min(1).max(120) }),
  list_debts: z.object({ direction: z.enum(["receivable", "payable", "all"]).optional(), person: z.string().max(120).optional() }),
  list_recent_transactions: z.object({ limit: z.number().int().min(1).max(30).optional(), kind: z.enum(["sale", "purchase", "all"]).optional() }),
  get_grading_status: z.object({ customer: z.string().max(120).optional() }),
} as const;

export type ToolName = keyof typeof schemas;
export const isToolName = (name: string): name is ToolName => name in schemas;

/** Runs one tool. Throws a short Vietnamese message for bad input, which is returned to the model as an error result. */
export async function runTool(name: string, rawInput: unknown): Promise<unknown> {
  if (!isToolName(name)) throw new Error(`Công cụ không tồn tại: ${name}`);
  const parsed = schemas[name].safeParse(rawInput ?? {});
  if (!parsed.success) throw new Error(`Tham số không hợp lệ: ${parsed.error.issues[0]?.message ?? "?"}`);
  const input = parsed.data as Record<string, any>;

  switch (name) {
    case "get_business_overview":
      return getOverviewSnapshot();
    case "get_period_report": {
      const period = resolvePeriod(String(input.period));
      if (!period) throw new Error("Khoảng thời gian không hợp lệ. Dùng today, yesterday, this_week, last_7_days, this_month, last_month, YYYY-MM hoặc YYYY-MM-DD");
      return getPeriodFinance(period);
    }
    case "search_inventory":
      return searchInventory(String(input.query), input.limit);
    case "lookup_customer":
      return lookupCustomers(String(input.query));
    case "list_debts":
      return listDebts({ direction: input.direction, person: input.person });
    case "list_recent_transactions":
      return listRecentEntries({ limit: input.limit, kind: input.kind });
    case "get_grading_status":
      return gradingStatus(input.customer);
  }
}
