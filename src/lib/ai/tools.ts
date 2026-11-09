import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { analyzeShop, getFinancialTrends, getInventoryHealth, getLiquidityRisk, getSalesAnalytics, runScenario } from "@/lib/ai/analysis";
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
  {
    name: "analyze_shop_health",
    description:
      "Chẩn đoán sức khoẻ tài chính toàn diện của shop trong một lần gọi: thanh khoản (tiền mặt, runway, hệ số bao phủ công nợ), công nợ phải thu / phải trả theo tuổi nợ, sức khoẻ kho (tập trung vốn, tuổi tồn, vòng quay, giá thị trường), bán hàng 90 ngày (biên lãi, khách, kênh, bán nợ), xu hướng 12 tháng, kèm DANH SÁCH PHÁT HIỆN đã xếp theo mức độ và gợi ý. Luôn gọi công cụ này đầu tiên khi được yêu cầu phân tích, đánh giá hoặc lập kế hoạch.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_financial_trends",
    description: "Kết quả theo từng tháng (tối đa 24 tháng): doanh thu, chi phí, lợi nhuận ròng, số đơn, biên lãi bán hàng, lãi chấm điểm, bán nợ; kèm so sánh 3 tháng gần nhất với 3 tháng trước đó. Dùng để xem xu hướng và tính mùa vụ.",
    input_schema: {
      type: "object",
      properties: { months: { type: "integer", description: "Số tháng gần nhất (3-24, mặc định 12). Tháng đang chạy được đánh dấu partial." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_inventory_health",
    description:
      "Sức khoẻ kho: vốn theo dòng game, mức tập trung (top SKU), vốn theo tuổi tồn (0-30 … trên 180 ngày), vòng quay và số ngày tồn, SKU chưa có giá / giá cũ, lãi lỗ tạm tính theo giá US, SKU lãi nhất / lỗ nhất, SKU không bán được trong 90 ngày, tốc độ bán và số ngày bán hết từng SKU.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_liquidity_risk",
    description:
      "Thanh khoản và rủi ro công nợ: tiền mặt, dòng tiền ròng trung bình 3 tháng đủ gần nhất, runway (số tháng tiền mặt đủ dùng), hệ số bao phủ phải trả, tuổi nợ phải thu / phải trả, người nợ nhiều nhất, tiền chấm điểm chưa thu.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_sales_analytics",
    description:
      "Phân tích bán hàng N ngày gần nhất so với kỳ trước đó: doanh thu, lãi, biên lãi, giá trị đơn trung bình, đơn bán lỗ, biên lãi theo dòng game, sản phẩm lãi nhất, mức tập trung khách, tỷ lệ khách quay lại, tỷ trọng kênh Page / trực tiếp, tỷ lệ bán nợ.",
    input_schema: {
      type: "object",
      properties: { days: { type: "integer", description: "Số ngày (7-365, mặc định 90)" } },
      additionalProperties: false,
    },
  },
  {
    name: "run_scenario",
    description:
      "Mô hình kịch bản (what-if) tính bằng số liệu thật: nền là trung bình 3 tháng đủ gần nhất. Cho biết dòng tiền, tiền mặt sau N tháng, runway và tổng giá trị danh mục (theo giá vốn và theo giá thị trường, có cú sốc giá) khi thay đổi giá thị trường tồn kho, số lượng bán, giá bán, giá nhập hoặc chi phí cố định. Gọi nhiều lần để so sánh các kịch bản (cơ sở / tích cực / tiêu cực); không tự tính nhẩm.",
    input_schema: {
      type: "object",
      properties: {
        marketPriceChangePct: {
          type: "number",
          description:
            "% thay đổi giá thị trường (VND) của hàng tồn, ví dụ -20. Giá này là giá US quy ra VND: nếu tỷ giá USD/VND thay đổi x% thì đặt cả marketPriceChangePct và unitCostChangePct bằng x.",
        },
        salesVolumeChangePct: { type: "number", description: "% thay đổi số lượng bán mỗi tháng" },
        salesPriceChangePct: { type: "number", description: "% thay đổi giá bán trung bình" },
        unitCostChangePct: { type: "number", description: "% thay đổi giá nhập / giá vốn của hàng nhập MỚI (do tỷ giá, thuế, cước). Không đổi giá vốn hàng đang tồn." },
        extraMonthlyCost: { type: "number", description: "Chi phí cố định thêm mỗi tháng (VND)" },
        months: { type: "integer", description: "Số tháng dự phóng (1-12, mặc định 3)" },
      },
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
  analyze_shop_health: z.object({}).passthrough(),
  get_financial_trends: z.object({ months: z.number().int().min(3).max(24).optional() }),
  get_inventory_health: z.object({}).passthrough(),
  get_liquidity_risk: z.object({}).passthrough(),
  get_sales_analytics: z.object({ days: z.number().int().min(7).max(365).optional() }),
  run_scenario: z.object({
    marketPriceChangePct: z.number().min(-95).max(500).optional(),
    salesVolumeChangePct: z.number().min(-95).max(500).optional(),
    salesPriceChangePct: z.number().min(-95).max(500).optional(),
    unitCostChangePct: z.number().min(-95).max(500).optional(),
    extraMonthlyCost: z.number().min(0).max(10_000_000_000).optional(),
    months: z.number().int().min(1).max(12).optional(),
  }),
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
    case "analyze_shop_health":
      return analyzeShop();
    case "get_financial_trends":
      return getFinancialTrends(input.months ?? 12);
    case "get_inventory_health":
      return getInventoryHealth();
    case "get_liquidity_risk":
      return getLiquidityRisk();
    case "get_sales_analytics":
      return getSalesAnalytics(input.days ?? 90);
    case "run_scenario":
      return runScenario(input);
  }
}
