import { strip } from "@/lib/chat-payment";
import { getOverviewSnapshot, getPeriodFinance, type OverviewSnapshot, type PeriodFinance } from "@/lib/ai/finance";
import {
  gradingStatus,
  listDebts,
  listRecentEntries,
  lookupCustomers,
  searchInventory,
  type CustomerProfile,
  type DebtReport,
  type InventoryHit,
  type RecentEntry,
} from "@/lib/ai/lookups";
import { resolvePeriod } from "@/lib/ai/period";
import { formatVND } from "@/lib/utils";

// "Chế độ cơ bản": answers common questions from keywords, using the same live lookups as the Claude tools. It keeps
// the assistant useful when no ANTHROPIC_API_KEY is configured (and as a fallback when the API is unreachable).

const when = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatVND(Math.abs(n))}`;
const cell = (s: string | null | undefined) => (s ?? "—").replace(/\|/g, "/").replace(/\n/g, " ");

// ---- formatters -----------------------------------------------------------------------------------------------------
export function formatPeriod(f: PeriodFinance): string {
  return [
    `### Báo cáo — ${f.period}`,
    "",
    "| Chỉ số | Giá trị |",
    "|---|---:|",
    `| Doanh thu (bán hàng + chấm điểm) | **${formatVND(f.revenue.total)}** |`,
    `| • Bán hàng | ${formatVND(f.revenue.sales)} |`,
    `| • Chấm điểm | ${formatVND(f.revenue.grading)} |`,
    `| Chi phí (nhập hàng + chấm điểm) | **${formatVND(f.expense.total)}** |`,
    `| Số đơn bán | ${f.salesOrders.count} đơn · ${formatVND(f.salesOrders.grossAmount)} |`,
    `| **Lợi nhuận ròng** | **${signed(f.profit.net)}** |`,
    `| • Lãi bán hàng (đã trừ đơn lỗ) | ${signed(f.profit.salesProfit)} |`,
    `| • Lãi chấm điểm đã thu | ${signed(f.profit.gradingProfitCollected)} |`,
    `| • Điều chỉnh tính vào lãi | ${signed(f.profit.flaggedAdjustments)} |`,
    ...(f.profit.salesLoss > 0 ? [`| Bán lỗ trong kỳ | −${formatVND(f.profit.salesLoss)} |`] : []),
    ...(f.otherCash.withdrawals > 0 ? [`| Rút tiền từ quỹ | ${formatVND(f.otherCash.withdrawals)} |`] : []),
    ...(f.creditSales.amount > 0 ? [`| Bán nợ (chưa thu tiền) | ${formatVND(f.creditSales.amount)} (${f.creditSales.count} đơn) |`] : []),
    "",
    f.revenue.total === 0 && f.salesOrders.count === 0 ? "_Chưa có giao dịch nào trong khoảng thời gian này._" : "",
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n");
}

export function formatOverview(s: OverviewSnapshot): string {
  return [
    "### Tổng quan cửa hàng",
    "",
    "| Chỉ số | Giá trị |",
    "|---|---:|",
    `| Tiền mặt | **${formatVND(s.portfolio.cash)}** |`,
    `| Giá trị kho (vốn WACC) | ${formatVND(s.portfolio.inventoryCostWacc)} |`,
    `| Công nợ phải thu | +${formatVND(s.portfolio.receivable)} |`,
    `| Công nợ phải trả | −${formatVND(s.portfolio.payable)} |`,
    `| **Tổng giá trị danh mục** | **${formatVND(s.portfolio.totalValue)}** |`,
    `| Giá thị trường US | ${formatVND(s.inventory.marketValueUS)} (${s.inventory.pricedSkuCount}/${s.inventory.skuCount} SKU có giá) |`,
    `| Lãi/lỗ tạm tính | ${signed(s.inventory.unrealizedPnl)} (${s.inventory.unrealizedPnlPct >= 0 ? "+" : ""}${s.inventory.unrealizedPnlPct.toFixed(1)}%) |`,
    "",
    "_Tổng giá trị danh mục = Tiền mặt + Kho + Công nợ phải thu − Công nợ phải trả._",
    "",
    `- **Hôm nay:** doanh thu ${formatVND(s.today.revenue)}, lợi nhuận ${signed(s.today.netProfit)}, ${s.today.salesOrders} đơn bán`,
    `- **Tháng này:** doanh thu ${formatVND(s.thisMonth.revenue)}, chi phí ${formatVND(s.thisMonth.expense)}, lợi nhuận ${signed(s.thisMonth.netProfit)}, ${s.thisMonth.salesOrders} đơn bán`,
    `- **Khách hàng:** ${s.customers} · **Chấm điểm:** ${s.grading.openOrders} đơn đang xử lý (${s.grading.cardsInProgress} thẻ), chưa thu ${formatVND(s.grading.uncollectedAmount)}`,
  ].join("\n");
}

export function formatInventory(query: string, items: InventoryHit[]): string {
  if (items.length === 0) return `Không tìm thấy sản phẩm nào khớp **“${query}”** trong kho. Thử tên ngắn hơn hoặc nhập mã SKU.`;
  const rows = items.map(
    (i) =>
      `| ${cell(i.name)}${i.detail ? ` (${cell(i.detail)})` : ""} | ${cell(i.sku)} | **${i.quantity}** | ${formatVND(i.costWacc)} | ${
        i.marketPrice == null ? "Chưa có giá" : formatVND(i.marketPrice)
      } | ${i.estimatedPnl == null ? "—" : signed(i.estimatedPnl)} |`
  );
  const total = items.reduce((s, i) => s + i.quantity, 0);
  return [
    `### Kho — “${query}” (${items.length} kết quả, tổng tồn ${total})`,
    "",
    "| Sản phẩm | SKU | Tồn | Giá vốn WACC | Giá thị trường US | Lãi/lỗ ước tính |",
    "|---|---|---:|---:|---:|---:|",
    ...rows,
  ].join("\n");
}

export function formatCustomers(query: string, customers: CustomerProfile[]): string {
  if (customers.length === 0) return `Không tìm thấy khách hàng nào khớp **“${query}”**.`;
  return customers
    .map((c) =>
      [
        `### ${c.name}${c.phone ? ` · ${c.phone}` : ""}`,
        "",
        `- **Số đơn mua:** ${c.orderCount} · **Tổng chi tiêu:** ${formatVND(c.totalSpent)}`,
        `- **Công nợ phải thu:** ${c.receivable > 0 ? `**${formatVND(c.receivable)}**` : "không có"}`,
        `- **Chấm điểm:** ${c.grading.orders} đơn (${c.grading.cards} thẻ)${c.grading.uncollected > 0 ? `, chưa thu ${formatVND(c.grading.uncollected)}` : ""}`,
        c.pageConversation ? `- **Fanpage:** có hội thoại${c.pageConversation.label ? ` · nhãn ${c.pageConversation.label}` : ""}, tin gần nhất ${when(c.pageConversation.lastMessageAt)}` : "- **Fanpage:** chưa liên kết hội thoại",
        ...(c.lastOrders.length > 0
          ? [
              "",
              "| Ngày | Mặt hàng | Tổng | Thanh toán |",
              "|---|---|---:|---|",
              ...c.lastOrders.map((o) => `| ${when(o.date)} | ${cell(o.items)} | ${formatVND(o.total)} | ${cell(o.payment)} |`),
            ]
          : ["", "_Khách này chưa có đơn mua._"]),
      ].join("\n")
    )
    .join("\n\n");
}

export function formatDebts(r: DebtReport): string {
  const lines = [
    "### Công nợ",
    "",
    `- **Phải thu (người khác nợ shop):** ${formatVND(r.totals.receivable)}`,
    `- **Phải trả (shop nợ người ứng tiền):** ${formatVND(r.totals.payable)}`,
    `- Số khoản chưa hoàn tất: ${r.totals.openCount}`,
  ];
  if (r.people.length > 0) {
    lines.push("", "| Người | Phải thu | Phải trả | Chênh lệch ròng |", "|---|---:|---:|---:|");
    for (const p of r.people) lines.push(`| ${cell(p.name)} | ${p.receivable > 0 ? formatVND(p.receivable) : "—"} | ${p.payable > 0 ? formatVND(p.payable) : "—"} | ${signed(p.net)} |`);
  } else lines.push("", "_Hiện không có khoản nợ nào còn mở._");
  return lines.join("\n");
}

export function formatRecent(entries: RecentEntry[]): string {
  if (entries.length === 0) return "Chưa có giao dịch nào trong Dòng tiền.";
  return [
    "### Giao dịch gần nhất",
    "",
    "| Thời gian | Loại | Số tiền | Mặt hàng |",
    "|---|---|---:|---|",
    ...entries.map((e) => `| ${when(e.date)} | ${e.type} | ${signed(e.amount)} | ${cell(e.goods.slice(0, 3).join("; ") || e.description)} |`),
  ].join("\n");
}

type Grading = Awaited<ReturnType<typeof gradingStatus>>;
export function formatGrading(g: Grading): string {
  const lines = [
    "### Dịch vụ chấm điểm",
    "",
    `- **Đơn đang xử lý:** ${g.summary.activeOrders} (${g.summary.activeCards} thẻ)`,
    `- **Doanh thu dịch vụ:** ${formatVND(g.summary.totalServiceRevenue)} · giá gốc ${formatVND(g.summary.totalCost)} · phí ship ${formatVND(g.summary.totalShip)}`,
    `- **Lãi dịch vụ:** ${signed(g.summary.totalServiceProfit)} · chưa thu của khách: ${formatVND(g.summary.uncollectedFromCustomers)}`,
  ];
  if (g.openOrders.length > 0) {
    lines.push("", "| Mã | Khách | Thẻ | Trạng thái | Giá dịch vụ | Thu tiền |", "|---|---|---:|---|---:|---|");
    for (const o of g.openOrders) lines.push(`| ${o.code} | ${cell(o.customer)} | ${o.cards} | ${o.status} | ${formatVND(o.serviceTotal)} | ${o.collected ? "Đã thu" : "Chưa thu"} |`);
  }
  return lines.join("\n");
}

export const HELP_TEXT = [
  "Mình là **Trợ lý quản lý CardNest**. Mình tra cứu số liệu thật trong hệ thống, ví dụ:",
  "",
  "- “Tổng kết doanh thu **hôm nay** thế nào?” · “Lợi nhuận **tháng này**?” · “Doanh thu **tháng 10**”",
  "- “Tiền mặt và **tổng giá trị danh mục** hiện tại?”",
  "- “Thẻ **Charizard** còn mấy con trong kho?” · “Giá vốn và giá thị trường của **POKE-M4**”",
  "- “**Công nợ** phải thu / phải trả?” · “Anh **Nam** nợ bao nhiêu?”",
  "- “Lịch sử mua hàng của khách **Nguyễn Văn A**”",
  "- “Các đơn **chấm điểm** đang xử lý” · “Giao dịch **gần đây**”",
].join("\n");

// ---- intent detection -----------------------------------------------------------------------------------------------
function detectPeriod(text: string): string | null {
  if (/hom nay|today/.test(text)) return "today";
  if (/hom qua/.test(text)) return "yesterday";
  if (/tuan nay/.test(text)) return "this_week";
  if (/7 ngay/.test(text)) return "last_7_days";
  if (/thang truoc|thang vua roi/.test(text)) return "last_month";
  const dayMatch = text.match(/ngay (\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?/);
  if (dayMatch) {
    const year = dayMatch[3] ?? String(new Date().getFullYear());
    return `${year}-${dayMatch[2].padStart(2, "0")}-${dayMatch[1].padStart(2, "0")}`;
  }
  const monthMatch = text.match(/thang (\d{1,2})(?:\s*(?:\/|nam)\s*(\d{4}))?/);
  if (monthMatch && Number(monthMatch[1]) >= 1 && Number(monthMatch[1]) <= 12) {
    const year = monthMatch[2] ?? String(new Date().getFullYear());
    return `${year}-${monthMatch[1].padStart(2, "0")}`;
  }
  if (/thang nay/.test(text)) return "this_month";
  return null;
}

const NAME_STOP = new Set(["hang", "nao", "nay", "moi", "da", "mua", "no", "chi", "con", "co", "lich", "bao", "the", "ra", "sao", "la", "thi", "hien", "dang", "voi", "khong", "chua", "tong", "so"]);

/** "khách Nguyễn Văn A đã mua gì" -> "Nguyễn Văn A" (original spelling kept for the search). */
function extractCustomerName(original: string): string | null {
  const patterns = [/kh[aáàảãạ]ch(?:\s+h[aàáảãạ]ng)?\s+([^?!.,]+)/i, /(?:c[uủ]a|cua)\s+([^?!.,]+)/i];
  for (const re of patterns) {
    const m = original.match(re);
    if (!m) continue;
    const words: string[] = [];
    for (const w of m[1].trim().split(/\s+/)) {
      if (NAME_STOP.has(strip(w))) break;
      words.push(w);
      if (words.length >= 4) break;
    }
    const name = words.join(" ").trim();
    if (name.length >= 2) return name;
  }
  return null;
}

const INVENTORY_STOP = new Set([
  "con", "may", "bao", "nhieu", "trong", "kho", "ton", "gia", "von", "thi", "truong", "cua", "the", "bai", "hop", "cai", "la", "cho", "toi",
  "xem", "tra", "kiem", "cuu", "sku", "wacc", "co", "khong", "hang", "san", "pham", "us", "hien", "tai", "dang", "hoi", "giup", "minh", "shop",
  "gi", "nao", "va", "voi", "so", "luong", "bn", "ban", "nhe", "a", "oi",
]);

function extractProductQuery(original: string): string {
  return original
    .replace(/[?!.,;:]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !INVENTORY_STOP.has(strip(w)))
    .join(" ")
    .trim();
}

export async function answerBasic(question: string): Promise<{ reply: string; tools: string[] }> {
  const original = question.trim();
  const text = strip(original);
  if (!text) return { reply: HELP_TEXT, tools: [] };

  if (/^(xin chao|chao|hello|hi|hey|alo|help|giup|huong dan|ban lam duoc gi|lam duoc gi)\b/.test(text)) return { reply: HELP_TEXT, tools: [] };

  const wantsFinance = /doanh thu|loi nhuan|\blai\b|bao cao|tong ket|thu chi|chi phi|doanh so/.test(text);
  const periodKey = detectPeriod(text);
  if (wantsFinance || (periodKey && /(tinh hinh|ket qua|ban duoc|thu duoc)/.test(text))) {
    const period = resolvePeriod(periodKey ?? "today");
    if (!period) return { reply: "Khoảng thời gian không hợp lệ. Thử “hôm nay”, “tháng này”, “tháng 10”…", tools: [] };
    return { reply: formatPeriod(await getPeriodFinance(period)), tools: ["get_period_report"] };
  }

  if (/khach|lich su mua|chi tieu|don hang cua/.test(text)) {
    const name = extractCustomerName(original);
    if (name) {
      const r = await lookupCustomers(name);
      return { reply: formatCustomers(name, r.customers), tools: ["lookup_customer"] };
    }
    if (!/bao nhieu|tong so|may khach/.test(text)) return { reply: "Bạn muốn tra khách nào? Ví dụ: “Lịch sử mua hàng của khách **Nguyễn Văn A**”.", tools: [] };
  }

  if (/cong no|phai thu|phai tra|thu hoi|\bno\b|dang no/.test(text)) {
    const personMatch = original.match(/(?:anh|chi|em|ban|ong|ba|co|chu)\s+([^\s?!.,]+(?:\s+[^\s?!.,]+)?)\s+(?:no|con no|nợ|còn nợ)/i);
    const person = personMatch?.[1]
      ?.split(/\s+/)
      .filter((w) => !NAME_STOP.has(strip(w)))
      .join(" ");
    const direction = /phai thu|thu hoi/.test(text) ? "receivable" : /phai tra/.test(text) ? "payable" : "all";
    return { reply: formatDebts(await listDebts({ direction, person })), tools: ["list_debts"] };
  }

  if (/cham diem|\bpsa\b|\bbgs\b|\bcgc\b|grading/.test(text)) {
    return { reply: formatGrading(await gradingStatus()), tools: ["get_grading_status"] };
  }

  if (/giao dich (gan day|moi nhat)|gan day|vua (ban|mua)|moi nhat/.test(text)) {
    return { reply: formatRecent((await listRecentEntries({ limit: 10 })).entries), tools: ["list_recent_transactions"] };
  }

  if (/danh muc|tong quan|tien mat|so du|tai san|tinh hinh|von kho|bao nhieu khach/.test(text) && !/con may|con bao nhieu|ton kho/.test(text)) {
    return { reply: formatOverview(await getOverviewSnapshot()), tools: ["get_business_overview"] };
  }

  const query = extractProductQuery(original);
  if (query.length >= 2) {
    const r = await searchInventory(query);
    if (r.items.length > 0 || /con may|con bao nhieu|ton kho|gia von|gia thi truong|\bsku\b/.test(text)) {
      return { reply: formatInventory(query, r.items), tools: ["search_inventory"] };
    }
  }
  return { reply: `Mình chưa hiểu câu hỏi này.\n\n${HELP_TEXT}`, tools: [] };
}
