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
import { analyzeShop, formatDays, runScenario, type ScenarioInput, type ScenarioResult, type ShopAnalysis } from "@/lib/ai/analysis";
import { LESSON_MAX_COUNT, LessonError, addLesson, deleteLessonByNumber, listLessons } from "@/lib/ai/lessons";
import { resolvePeriod } from "@/lib/ai/period";
import { rankProducts, type ProductRanking, type RankInput } from "@/lib/ai/ranking";
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

const SEVERITY_LABEL = { high: "🔴 Cao", medium: "🟠 Vừa", low: "🟡 Thấp", positive: "🟢 Tốt" } as const;

export function formatAnalysis(a: ShopAnalysis): string {
  const { liquidity: l, inventory: inv, sales: s, trends: t } = a;
  const oldShare = inv.aging.filter((b) => b.bucket === "91-180 ngày" || b.bucket === "trên 180 ngày").reduce((sum, b) => sum + (b.sharePct ?? 0), 0);
  const counts = { high: 0, medium: 0, low: 0, positive: 0 };
  for (const f of a.findings) counts[f.severity] += 1;

  const lines = [
    "### Phân tích sức khoẻ tài chính của shop",
    "",
    `Phát hiện: **${counts.high}** nghiêm trọng · **${counts.medium}** cần lưu ý · ${counts.low} nhẹ · ${counts.positive} điểm tốt.`,
    "",
    "| Chỉ số | Giá trị |",
    "|---|---:|",
    `| Tiền mặt | **${formatVND(l.cash)}** |`,
    `| Công nợ phải thu / phải trả | +${formatVND(l.receivable)} / −${formatVND(l.payable)} |`,
    `| Hệ số bao phủ phải trả (tiền + phải thu) | ${l.coverageRatio ?? "không có nợ phải trả"} |`,
    `| Dòng tiền ròng TB/tháng (3 tháng đủ gần nhất) | ${signed(l.avgMonthlyNetCashFlow)} |`,
    `| Quỹ tiền mặt đủ dùng | ${l.runwayMonths === null ? "dòng tiền không âm" : `${l.runwayMonths} tháng`} |`,
    `| Vốn kho (WACC) | ${formatVND(inv.totalCapital)} · ${inv.skuCount} SKU |`,
    `| Vốn kho không bán được quá 90 ngày | ${oldShare.toFixed(1)}% |`,
    `| Số ngày tồn kho / vòng quay | ${inv.turnover.daysOfInventory !== null ? formatDays(inv.turnover.daysOfInventory) : "chưa đủ dữ liệu"}${inv.turnover.annualizedTurnover !== null ? ` · ${inv.turnover.annualizedTurnover} lần/năm` : ""} |`,
    `| Lãi/lỗ tạm tính của kho | ${signed(inv.marketVsCost.unrealizedPnl)}${inv.marketVsCost.unrealizedPnlPct !== null ? ` (${inv.marketVsCost.unrealizedPnlPct}%)` : ""} |`,
    `| Bán hàng ${s.days} ngày | ${s.orders} đơn · ${formatVND(s.revenue)} · biên lãi ${s.marginPct ?? "—"}% |`,
    `| So với ${s.days} ngày trước đó | doanh số ${s.vsPreviousPeriod.revenueChangePct === null ? "—" : `${s.vsPreviousPeriod.revenueChangePct >= 0 ? "+" : ""}${s.vsPreviousPeriod.revenueChangePct}%`} |`,
    "",
  ];

  const recent = t.months.filter((m) => m.revenue > 0 || m.salesOrders > 0 || m.expense > 0).slice(-6);
  if (recent.length > 0) {
    lines.push("**Xu hướng các tháng gần đây**", "", "| Tháng | Doanh thu | Chi phí | Lợi nhuận ròng | Số đơn |", "|---|---:|---:|---:|---:|");
    for (const m of recent) lines.push(`| ${m.month}${m.partial ? " (đang chạy)" : ""} | ${formatVND(m.revenue)} | ${formatVND(m.expense)} | ${signed(m.netProfit)} | ${m.salesOrders} |`);
    lines.push("", `_${t.summary.note}_`, "");
  }

  if (a.findings.length > 0) {
    lines.push("**Phát hiện chính**", "", "| Mức | Lĩnh vực | Vấn đề | Bằng chứng |", "|---|---|---|---|");
    for (const f of a.findings) lines.push(`| ${SEVERITY_LABEL[f.severity]} | ${f.area} | ${cell(f.title)} | ${cell(f.evidence)} |`);
    const actions = a.findings.filter((f) => f.severity === "high" || f.severity === "medium").slice(0, 5);
    if (actions.length > 0) {
      lines.push("", "**Nên làm trước**", "");
      actions.forEach((f, i) => lines.push(`${i + 1}. **${f.title}** — ${f.suggestion}`));
    }
  } else {
    lines.push("_Chưa phát hiện vấn đề đáng chú ý từ dữ liệu hiện có._");
  }

  lines.push(
    "",
    "> Đây là chẩn đoán từ **số liệu nội bộ** của shop. Phần bối cảnh kinh tế – chính trị – thị trường (tỷ giá, chính sách, giá TCG, lịch ra bộ mới) cần Claude với tìm kiếm web hoặc ghi chú của bạn ở ô “Bối cảnh & mục tiêu”. Bấm “Kịch bản” để thử các tình huống giá giảm / bán chậm."
  );
  return lines.join("\n");
}

const pctText = (v: number | undefined) => (v === undefined || v === 0 ? "giữ nguyên" : `${v > 0 ? "+" : ""}${v}%`);

export function formatScenarios(cases: { name: string; input: ScenarioInput; result: ScenarioResult }[]): string {
  const base = cases[0].result;
  const months = base.projection.length;
  const lines = [
    `### So sánh kịch bản (${months} tháng tới)`,
    "",
    "| Kịch bản | Giá thị trường | Số lượng bán | Giá bán | Giá nhập | Dòng tiền ròng/tháng | Tiền mặt sau kỳ | Danh mục theo giá thị trường |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...cases.map(
      (c) =>
        `| **${c.name}** | ${pctText(c.input.marketPriceChangePct)} | ${pctText(c.input.salesVolumeChangePct)} | ${pctText(c.input.salesPriceChangePct)} | ${pctText(c.input.unitCostChangePct)} | ${signed(c.result.scenarioMonthly.netCashFlow)} | ${formatVND(c.result.end.cash)} | ${formatVND(c.result.end.portfolioAtMarketAfterShock)} |`
    ),
    "",
  ];
  const worst = [...cases].sort((a, b) => a.result.end.cash - b.result.end.cash)[0];
  if (worst.result.runwayMonths !== null) lines.push(`- Kịch bản **${worst.name}**: quỹ tiền mặt chỉ đủ khoảng **${worst.result.runwayMonths} tháng**.`);
  lines.push(`- Nền so sánh: trung bình 3 tháng đủ gần nhất (dòng tiền ròng ${signed(base.baselineMonthly.netCashFlow)}/tháng).`);
  if (base.warning) lines.push(`- ⚠️ ${base.warning}`);
  // The first two lines only repeat the percentages already in the table; the rest (and any case-specific caveat) are kept.
  const assumptions = [...new Set(cases.flatMap((c) => c.result.assumptions.slice(2)))];
  lines.push("", "_Giả định: " + assumptions.join(" ") + "_");
  return lines.join("\n");
}

// "Tỷ giá" moves two things at once: the VND price of new stock bought in USD, and the VND value of the US-priced stock.
const SCENARIO_KEYS: { key: keyof ScenarioInput; words: string; also?: (keyof ScenarioInput)[] }[] = [
  { key: "marketPriceChangePct", words: "gia thi truong" },
  { key: "salesVolumeChangePct", words: "doanh so|luong ban|san luong|so luong ban" },
  { key: "salesPriceChangePct", words: "gia ban" },
  { key: "unitCostChangePct", words: "gia von|gia nhap" },
  { key: "unitCostChangePct", words: "ty gia", also: ["marketPriceChangePct"] },
];

/** "nếu giá thị trường giảm 20% và doanh số giảm 30%" -> { marketPriceChangePct: -20, salesVolumeChangePct: -30 }. */
export function parseScenario(text: string): ScenarioInput | null {
  const input: ScenarioInput = {};
  const down = /giam|tut|ha/;
  const values = input as Record<string, number>;
  for (const { key, words, also } of SCENARIO_KEYS) {
    const forward = text.match(new RegExp(`(?:${words})[^0-9.]{0,25}?(giam|tut|ha|tang|them)[^0-9]{0,12}(\\d{1,3})\\s*%`));
    const reverse = text.match(new RegExp(`(giam|tut|ha|tang|them)\\s*(\\d{1,3})\\s*%\\s*(?:cua\\s*)?(?:${words})`));
    const m = forward ?? reverse;
    if (!m) continue;
    const value = (down.test(m[1]) ? -1 : 1) * Number(m[2]);
    values[key] = value;
    for (const other of also ?? []) if (values[other] === undefined) values[other] = value;
  }
  if (Object.keys(input).length === 0) return null;
  const months = text.match(/(\d{1,2})\s*thang\s*(?:toi|nua|sau)/);
  if (months) input.months = Math.min(12, Math.max(1, Number(months[1])));
  return input;
}

// ---- expected profit / loss ranking ---------------------------------------------------------------------------------
const GAME_WORDS: { re: RegExp; game: string }[] = [
  { re: /pokemon/, game: "Pokémon" },
  { re: /one ?piece/, game: "One Piece" },
  { re: /yu ?-?gi ?-?oh|yugioh/, game: "Yu-Gi-Oh" },
  { re: /\bmagic\b|\bmtg\b/, game: "Magic" },
  { re: /lorcana/, game: "Lorcana" },
  { re: /dragon ?ball/, game: "Dragon Ball" },
];

/**
 * "sản phẩm nào lãi dự kiến cao nhất" / "top 3 hàng lỗ nhiều nhất" / "Pokémon nào lãi % cao nhất" -> ranking options.
 * Returns null for everything else, including realised profit questions ("lãi tháng này"), which go to the period report.
 * `text` is the question without accents (strip()).
 */
export function parseRanking(text: string): RankInput | null {
  if (!/\blai\b|\blo\b|loi nhuan/.test(text)) return null;
  if (/khach|nguoi mua|don hang/.test(text)) return null;
  const expected = /(lai|lo|loi nhuan)\s*(du kien|tam tinh|uoc tinh|tren giay)|du kien.*\b(lai|lo)\b|gia thi truong.*\b(lai|lo)\b|\b(lai|lo)\b.*(gia thi truong|gia nhap|gia von)/.test(text);
  const game = GAME_WORDS.find((g) => g.re.test(text));
  // A game name ("Pokémon nào lãi nhất") counts as naming the products.
  const noun = Boolean(game) || /san pham|mat hang|\bhang\b|\bsku\b|\bthe\b|\bhop\b|\bbox\b|\bslab\b|\bsealed\b/.test(text);
  const pick = /nhat|\bcao\b|\bthap\b|nhieu|\bit\b|\btop\b|xep hang|\bnao\b|dang (bi )?(lo|lai)|nen ban/.test(text);
  const realised = /thang|tuan|hom nay|hom qua|da ban|ban duoc|doanh thu|quy\b|nam nay/.test(text);
  if (!(expected || (noun && pick && !realised))) return null;

  const input: RankInput = {};
  const loss = /\blo\b/.test(text) && !/\blai\b/.test(text);
  if (loss || /thap nhat|\bit lai|lai thap|lai it|te nhat|kem nhat|lo nhat|lo nhieu|dang (bi )?lo|lo nang/.test(text)) input.order = "lowest";
  if (/phan tram|%|ty le|ti le/.test(text)) input.metric = "percent";
  else if (/(moi|mot|1|tren|tung) (san pham|the|hop|cai|con|box|bo)\b|don vi|tren moi/.test(text)) input.metric = "unit";
  const limit = text.match(/\btop\s*(\d{1,2})\b/) ?? text.match(/\b(\d{1,2})\s*(?:san pham|mat hang|the|hop)\b/);
  if (limit) input.limit = Math.min(20, Math.max(1, Number(limit[1])));
  const fee = text.match(/phi\s*(?:san|ban|ship)?\s*(\d{1,2}(?:[.,]\d)?)\s*%/);
  if (fee) input.sellingCostPct = Math.min(50, Number(fee[1].replace(",", ".")));
  if (game) input.game = game.game;
  return input;
}

const dash = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

export function formatRanking(r: ProductRanking): string {
  const scope = r.metric === "unit" ? "trên mỗi sản phẩm" : r.metric === "percent" ? "theo % trên giá vốn" : "tính cả lô đang tồn";
  const title =
    r.order === "highest"
      ? `Sản phẩm có lãi dự kiến cao nhất (${scope})`
      : r.losing > 0
        ? `Sản phẩm lỗ dự kiến nhiều nhất (${scope})`
        : `Sản phẩm lãi dự kiến thấp nhất (${scope})`;
  const lines = [`### ${title}`, ""];
  if (r.filters.game || r.filters.query) lines.push(`_Phạm vi: ${[r.filters.game, r.filters.query].filter(Boolean).join(" · ")}_`, "");

  if (r.ranked.length === 0) {
    lines.push(...r.notes.map((n) => `- ${n}`));
    return lines.join("\n");
  }

  const top = r.ranked[0];
  const topValue = r.metric === "unit" ? `${signed(top.unitProfit)}/sản phẩm` : r.metric === "percent" ? dash(top.profitPct) : signed(top.totalProfit);
  lines.push(`**Đứng đầu: ${cell(top.name)}** (${cell(top.sku)}) — ${topValue}${r.metric === "total" ? ` (${top.quantity} × ${signed(top.unitProfit)}, ${dash(top.profitPct)})` : ""}${top.caveats.length > 0 ? " ⚠️" : ""}`, "");
  if (r.topReliable) {
    const t = r.topReliable;
    const v = r.metric === "unit" ? `${signed(t.unitProfit)}/sản phẩm` : r.metric === "percent" ? dash(t.profitPct) : signed(t.totalProfit);
    lines.push(`Giá của sản phẩm đứng đầu chưa chắc chắn (xem cảnh báo bên dưới). **Đứng đầu trong nhóm giá không có cảnh báo: ${cell(t.name)}** (${cell(t.sku)}, hạng ${t.rank}) — ${v}.`, "");
  }
  lines.push(
    "| # | Sản phẩm | SKU | Tồn | Giá vốn | Giá thị trường | Lãi/lỗ 1 sp | Lãi/lỗ dự kiến | % |",
    "|--:|---|---|--:|--:|--:|--:|--:|--:|",
    ...r.ranked.map(
      (p) =>
        `| ${p.rank} | **${cell(p.name)}** | ${cell(p.sku)} | ${p.quantity} | ${formatVND(p.unitCost)} | ${formatVND(p.unitMarket)} | ${signed(p.unitProfit)} | **${signed(p.totalProfit)}** | ${dash(p.profitPct)} |`
    ),
    ""
  );
  const warned = r.ranked.filter((p) => p.caveats.length > 0);
  if (warned.length > 0) lines.push(...warned.map((p) => `- ⚠️ **${cell(p.name)}**: ${p.caveats.join("; ")}.`), "");
  lines.push(
    `- Trong ${r.considered} sản phẩm có giá thị trường: **${r.profitable}** lãi, **${r.losing}** lỗ; tổng lãi / lỗ dự kiến **${signed(r.totalExpectedProfit)}**.`,
    ...r.notes.filter((n) => !n.startsWith("Một số dòng có cảnh báo")).map((n) => `- ${n}`),
    "",
    `_${r.basis}_`
  );
  return lines.join("\n");
}

// ---- what the owner teaches the assistant ---------------------------------------------------------------------------
const TEACH_LEAD = /^(hay )?(ghi nho|nho rang|nho la|nho giup|nho gium|nho ?:|luu lai|ghi lai)\s*[:,\-–]?\s*/;
const TEACH_SENTENCE = /^(tu gio|tu nay ve sau|tu nay tro di|lan sau|ve sau)\b/;
const LESSON_LIST = /da hoc (duoc )?(gi|nhung gi)|\bnho (nhung )?gi\b|danh sach (bai hoc|dieu da hoc|dieu da nho)|bo nho cua ban|xem bai hoc/;
const LESSON_FORGET = /^(?:hay )?(?:quen|xoa) (?:di )?(?:bai hoc|dieu|quy tac|so)\b\D*(\d{1,3})?/;

export function formatLessons(lessons: { content: string }[]): string {
  if (lessons.length === 0) {
    return "Mình chưa học điều gì từ bạn. Hãy dạy mình bằng câu như: “**Hãy nhớ:** khi tôi hỏi hàng nên bán thì xếp theo % lãi dự kiến”.";
  }
  return [
    `### Điều mình đã học (${lessons.length}/${LESSON_MAX_COUNT})`,
    "",
    ...lessons.map((l, i) => `${i + 1}. ${l.content}`),
    "",
    "_Nói “quên bài học số 2” để xoá một điều, hoặc quản lý trong hộp thoại bộ nhớ (biểu tượng sổ tay)._",
  ].join("\n");
}

async function lessonReply(original: string, text: string): Promise<{ reply: string; tools: string[] } | null> {
  const isQuestion = original.trim().endsWith("?");
  const forget = text.match(LESSON_FORGET);
  if (forget && !isQuestion) {
    const num = forget[1];
    if (!num) return { reply: `Bạn muốn mình quên điều nào? Nói số thứ tự, ví dụ “quên bài học số 2”.\n\n${formatLessons(await listLessons())}`, tools: [] };
    const removed = await deleteLessonByNumber(Number(num));
    return { reply: removed === null ? `Không có bài học số ${num}.` : `Đã quên bài học số ${num}: “${removed}”`, tools: ["forget_lesson"] };
  }
  if (LESSON_LIST.test(text)) return { reply: formatLessons(await listLessons()), tools: [] };

  const nfc = original.normalize("NFC").trim();
  const lead = text.match(TEACH_LEAD);
  if ((lead || TEACH_SENTENCE.test(text)) && !isQuestion) {
    // strip() keeps one character per character of an NFC string, so the match length also cuts the original.
    const lesson = lead ? nfc.slice(lead[0].length) : nfc;
    try {
      const { lesson: saved, duplicate } = await addLesson(lesson);
      const total = (await listLessons()).length;
      return {
        reply: duplicate
          ? `Mình đã nhớ điều này rồi: “${saved.content}”`
          : `Đã ghi nhớ (${total}/${LESSON_MAX_COUNT}): “${saved.content}”\n\n_Mình đang ở chế độ cơ bản nên chỉ lưu lại; trợ lý Claude sẽ áp dụng điều này khi trả lời. Xem hoặc xoá trong hộp thoại bộ nhớ (biểu tượng sổ tay)._`,
        tools: ["remember_lesson"],
      };
    } catch (err) {
      if (err instanceof LessonError) return { reply: err.message, tools: [] };
      throw err;
    }
  }
  return null;
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
  "",
  "**Phân tích chuyên sâu** (bật nút “Phân tích chuyên sâu”):",
  "",
  "- “**Phân tích** sức khoẻ tài chính của shop” · “Shop đang có **rủi ro** gì?”",
  "- “Lập **kế hoạch** kinh doanh quý tới” · “**Chiến lược** tồn kho”",
  "- “**Kịch bản**: nếu giá thị trường giảm 20% và doanh số giảm 30%”",
  "",
  "**Lãi / lỗ dự kiến theo sản phẩm** (giá thị trường so với giá vốn):",
  "",
  "- “Sản phẩm nào **lãi dự kiến cao nhất**?” · “Top 5 hàng **lỗ dự kiến** nhiều nhất”",
  "- “**Pokémon** nào lãi **%** cao nhất?” · “Lãi dự kiến **thấp nhất** trên mỗi sản phẩm”",
  "",
  "**Dạy mình**: “**Hãy nhớ:** …” · “**Từ giờ** khi tôi hỏi … thì …” · “Bạn đã học được gì?” · “Quên bài học số 2”",
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

const ANALYSIS_WORDS = /phan tich|suc khoe|ke hoach|chien luoc|danh gia|rui ro|xu huong|tu van|nen lam gi|dinh huong|toi uu|chan doan|nhin nhan/;
const SCENARIO_WORDS = /kich ban|gia su|stress|neu .*(giam|tang|tut)/;

async function scenarioReply(input: ScenarioInput | null) {
  const bear: ScenarioInput = { marketPriceChangePct: -20, salesVolumeChangePct: -30 };
  const bull: ScenarioInput = { marketPriceChangePct: 10, salesVolumeChangePct: 20 };
  const cases = input
    ? [
        { name: "Cơ sở (giữ nguyên)", input: { months: input.months } as ScenarioInput },
        { name: "Theo yêu cầu", input },
      ]
    : [
        { name: "Cơ sở (giữ nguyên)", input: {} as ScenarioInput },
        { name: "Xấu: thị trường −20%, bán chậm −30%", input: bear },
        { name: "Tốt: thị trường +10%, bán nhanh +20%", input: bull },
      ];
  const results = await Promise.all(cases.map((c) => runScenario(c.input)));
  return { reply: formatScenarios(cases.map((c, i) => ({ ...c, result: results[i] }))), tools: ["run_scenario"] };
}

export async function answerBasic(question: string, options: { deep?: boolean } = {}): Promise<{ reply: string; tools: string[] }> {
  const original = question.trim();
  const text = strip(original);
  if (!text) return { reply: HELP_TEXT, tools: [] };

  const lesson = await lessonReply(original, text);
  if (lesson) return lesson;
  const ranking = parseRanking(text);
  if (ranking) return { reply: formatRanking(await rankProducts(ranking)), tools: ["rank_products_by_expected_profit"] };

  if (SCENARIO_WORDS.test(text)) return scenarioReply(parseScenario(text));
  if (ANALYSIS_WORDS.test(text)) return { reply: formatAnalysis(await analyzeShop()), tools: ["analyze_shop_health"] };

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
  if (options.deep) return { reply: formatAnalysis(await analyzeShop()), tools: ["analyze_shop_health"] };
  return { reply: `Mình chưa hiểu câu hỏi này.\n\n${HELP_TEXT}`, tools: [] };
}
