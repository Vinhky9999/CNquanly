import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";
import { SLOW_MOVING_DAYS } from "@/lib/dashboard";
import { getInventoryGameOverview } from "@/lib/inventory-overview";
import { gradingStatusLabel } from "@/lib/grading";
import { paymentMethodLabel } from "@/lib/validations/chat-order";

// ---------------------------------------------------------------------------------------------------------------------
// Monthly Excel report: 4 sheets (Tổng quan, Dòng tiền & công nợ, Kho hàng, Dịch vụ chấm điểm).
// Everything comes from real records. Months are cut in Vietnam time (UTC+7) so the file matches what the owner sees,
// whatever timezone the server runs in.
// ---------------------------------------------------------------------------------------------------------------------

const VN_OFFSET_HOURS = 7;
const DAY_MS = 24 * 3600 * 1000;

export interface MonthRange {
  year: number;
  month: number; // 1-12
  start: Date; // inclusive
  end: Date; // exclusive (start of the next month)
  label: string; // "Tháng 10/2026"
}

/** Parses "YYYY-MM"; returns null for anything else. */
export function parseMonthParam(value: string | null): MonthRange | null {
  const m = value?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100) return null;
  return {
    year,
    month,
    start: new Date(Date.UTC(year, month - 1, 1, -VN_OFFSET_HOURS)),
    end: new Date(Date.UTC(year, month, 1, -VN_OFFSET_HOURS)),
    label: `Tháng ${month}/${year}`,
  };
}

export const monthlyReportFilename = (r: MonthRange) =>
  `CardNest_BaoCao_Thang_${String(r.month).padStart(2, "0")}_${r.year}.xlsx`;

// ---- styling ------------------------------------------------------------------------------------------------------
const VND = '#,##0" ₫";[Red]-#,##0" ₫"';
const INT = "#,##0";
const DATE_TIME = "dd/mm/yyyy hh:mm";
const DATE = "dd/mm/yyyy";
const NAVY = "FF0F172A";
const INDIGO = "FF4338CA";
const SLATE_TEXT = "FF64748B";
const GREEN = "FF059669";
const RED = "FFDC2626";
const AMBER = "FFD97706";
const ZEBRA = "FFF1F5F9";

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

function titleBlock(sheet: ExcelJS.Worksheet, title: string, subtitle: string, cols: number) {
  const t = sheet.addRow([title]);
  sheet.mergeCells(t.number, 1, t.number, cols);
  t.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.height = 30;
  for (let c = 1; c <= cols; c++) t.getCell(c).fill = solid(NAVY);
  const s = sheet.addRow([subtitle]);
  sheet.mergeCells(s.number, 1, s.number, cols);
  s.font = { italic: true, color: { argb: SLATE_TEXT } };
  s.alignment = { horizontal: "center" };
  sheet.addRow([]);
}

function sectionTitle(sheet: ExcelJS.Worksheet, text: string, cols: number) {
  const r = sheet.addRow([text]);
  sheet.mergeCells(r.number, 1, r.number, cols);
  r.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  r.alignment = { vertical: "middle" };
  r.height = 22;
  for (let c = 1; c <= cols; c++) r.getCell(c).fill = solid(INDIGO);
  return r;
}

function headerRow(sheet: ExcelJS.Worksheet, labels: string[]) {
  const r = sheet.addRow(labels);
  r.height = 22;
  r.eachCell((cell) => {
    cell.fill = solid(NAVY);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = THIN;
  });
  return r;
}

/** Adds a data row with borders; `formats` maps 1-based column -> number format. */
function dataRow(sheet: ExcelJS.Worksheet, values: ExcelJS.CellValue[], formats: Record<number, string> = {}, zebra = false) {
  const r = sheet.addRow(values);
  r.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.border = THIN;
    if (formats[col]) cell.numFmt = formats[col];
    if (zebra) cell.fill = solid(ZEBRA);
    cell.alignment = { vertical: "middle", wrapText: typeof cell.value === "string" && cell.value.length > 40 };
  });
  return r;
}

function totalRow(sheet: ExcelJS.Worksheet, values: ExcelJS.CellValue[], formats: Record<number, string>) {
  const r = dataRow(sheet, values, formats);
  r.font = { bold: true };
  r.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = solid("FFE2E8F0");
  });
  return r;
}

const signColor = (cell: ExcelJS.Cell, value: number) => {
  cell.font = { ...(cell.font ?? {}), bold: true, color: { argb: value < 0 ? RED : GREEN } };
};

function widths(sheet: ExcelJS.Worksheet, list: number[]) {
  list.forEach((w, i) => (sheet.getColumn(i + 1).width = w));
}

const num = (v: unknown) => Number(v ?? 0);
/** Excel stores dates as plain serials (read as UTC), so shift by the Vietnam offset to show local wall-clock time. */
const vn = (d: Date) => new Date(d.getTime() + VN_OFFSET_HOURS * 3600 * 1000);
const formula = (f: string, result: number): ExcelJS.CellFormulaValue => ({ formula: f, result });

// ---- data ----------------------------------------------------------------------------------------------------------
export async function generateMonthlyReportBuffer(range: MonthRange): Promise<Buffer> {
  const { start, end } = range;
  const inMonth = { gte: start, lt: end };
  const now = new Date();

  const [ledger, sales, newCustomers, gradingRows, completedGrading, debts, sealed, singles, movementItems, games] =
    await Promise.all([
      prisma.cashLedgerEntry.findMany({
        where: { createdAt: inMonth },
        orderBy: { createdAt: "asc" },
        include: {
          transaction: { select: { source: true, paymentMethod: true, totalAmount: true, totalCost: true } },
          gradingIncome: { select: { markup: true } },
        },
      }),
      prisma.transaction.findMany({
        where: { type: "SALE", transactionDate: inMonth },
        select: { totalAmount: true, totalCost: true },
      }),
      prisma.customer.count({ where: { createdAt: inMonth } }),
      // Grading orders that started in the month or were handed back to the customer during it.
      prisma.gradingSubmission.findMany({
        where: { OR: [{ createdAt: inMonth }, { status: "COMPLETED", updatedAt: inMonth }] },
        orderBy: { createdAt: "asc" },
        include: { items: { orderBy: { position: "asc" } } },
      }),
      prisma.gradingSubmission.count({ where: { status: "COMPLETED", updatedAt: inMonth } }),
      prisma.debt.findMany({
        where: { createdAt: { lt: end } },
        orderBy: { createdAt: "asc" },
        include: { payments: { select: { amount: true, createdAt: true } } },
      }),
      prisma.sealedProduct.findMany({ orderBy: [{ game: "asc" }, { name: "asc" }] }),
      prisma.singleCard.findMany({ orderBy: [{ game: "asc" }, { cardName: "asc" }] }),
      // Every stock movement from the start of the month to now (used to rebuild opening / closing stock).
      prisma.transactionItem.findMany({
        where: { transaction: { transactionDate: { gte: start } } },
        select: {
          quantity: true,
          sealedProductId: true,
          singleCardId: true,
          transaction: { select: { type: true, transactionDate: true } },
        },
      }),
      getInventoryGameOverview(),
    ]);

  // ---- finance figures ----
  const sumLedger = (types: string[], sign: "pos" | "neg" | "any" = "any") =>
    ledger
      .filter((e) => types.includes(e.type) && (sign === "any" || (sign === "pos" ? num(e.amount) > 0 : num(e.amount) < 0)))
      .reduce((s, e) => s + Math.abs(num(e.amount)), 0);

  const salesRevenue = sumLedger(["SALE"]);
  const gradingRevenue = sumLedger(["GRADING_INCOME"]);
  const totalRevenue = salesRevenue + gradingRevenue;

  const purchaseCost = sumLedger(["PURCHASE"]);
  const gradingCost = sumLedger(["GRADING_COST"]);
  const totalExpense = purchaseCost + gradingCost;
  const withdrawals = sumLedger(["WITHDRAWAL"]);
  const debtRepaid = sumLedger(["DEBT_REPAYMENT"]);
  const debtCollected = sumLedger(["DEBT_COLLECTION"]);
  const adjustmentsIn = sumLedger(["MANUAL_ADJUSTMENT"], "pos");
  const adjustmentsOut = sumLedger(["MANUAL_ADJUSTMENT"], "neg");

  // Profit uses the same rules as the dashboard's monthly report.
  let salesProfit = 0;
  let salesLoss = 0;
  for (const t of sales) {
    if (t.totalCost == null) continue;
    const p = num(t.totalAmount) - num(t.totalCost);
    salesProfit += p;
    if (p < 0) salesLoss += -p;
  }
  const gradingProfit = ledger
    .filter((e) => e.type === "GRADING_INCOME" && e.gradingIncome)
    .reduce((s, e) => s + num(e.gradingIncome!.markup), 0);
  const flaggedAdjustments = ledger
    .filter((e) => e.countsAsProfit && num(e.amount) > 0)
    .reduce((s, e) => s + num(e.amount), 0);
  const netProfit = salesProfit + gradingProfit + flaggedAdjustments;

  const valuation = games.reduce(
    (a, g) => ({
      capital: a.capital + g.totalValue,
      market: a.market + g.marketValue,
      pricedCost: a.pricedCost + g.pricedCost,
      priced: a.priced + g.pricedSkuCount,
      skus: a.skus + g.skuCount,
    }),
    { capital: 0, market: 0, pricedCost: 0, priced: 0, skus: 0 }
  );
  const unrealized = valuation.market - valuation.pricedCost;

  const gradingCardsSent = gradingRows.filter((g) => g.createdAt >= start && g.createdAt < end).reduce((s, g) => s + g.quantity, 0);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CardNest";
  workbook.created = now;
  const exportedAt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(now);

  // =================================================================================================================
  // SHEET 1 — TỔNG QUAN
  // =================================================================================================================
  const s1 = workbook.addWorksheet("Tổng Quan", { views: [{ showGridLines: false }] });
  widths(s1, [44, 24, 62]);
  titleBlock(s1, `BÁO CÁO TỔNG QUAN ${range.label.toUpperCase()} — CARDNEST`, `Xuất lúc ${exportedAt} · số liệu từ ngày ${formatDay(start)} đến ${formatDay(new Date(end.getTime() - 1))} (giờ Việt Nam)`, 3);

  sectionTitle(s1, "1. CHỈ SỐ TÀI CHÍNH TRONG THÁNG", 3);
  headerRow(s1, ["Chỉ số", "Giá trị", "Cách tính / ghi chú"]);
  const kpi = (label: string, value: number, note: string, opts: { bold?: boolean; sign?: boolean; fmt?: string } = {}) => {
    const r = dataRow(s1, [label, value, note], { 2: opts.fmt ?? VND });
    r.getCell(1).font = { bold: opts.bold ?? false };
    r.getCell(3).font = { color: { argb: SLATE_TEXT }, size: 10 };
    r.getCell(3).alignment = { wrapText: true, vertical: "middle" };
    if (opts.sign) signColor(r.getCell(2), value);
    else if (opts.bold) r.getCell(2).font = { bold: true };
    return r;
  };
  kpi("Tổng doanh thu", totalRevenue, "Thu từ bán hàng + thu tiền khách của dịch vụ chấm điểm (theo ngày ghi vào Dòng tiền)", { bold: true });
  kpi("   • Doanh thu bán hàng", salesRevenue, "Các khoản Thu loại Xuất hàng / Bán hàng trong tháng");
  kpi("   • Doanh thu dịch vụ chấm điểm", gradingRevenue, "Các khoản Thu chấm điểm đã ghi nhận trong tháng");
  kpi("Tổng chi phí", totalExpense, "Nhập hàng + chi phí chấm điểm (không gồm rút tiền, trả nợ)", { bold: true });
  kpi("   • Nhập hàng", purchaseCost, "Các khoản Chi loại Nhập hàng / Mua hàng");
  kpi("   • Chi phí chấm điểm", gradingCost, "Phí gốc trả hãng + phí ship của đơn chấm điểm");
  kpi("Lợi nhuận ròng", netProfit, "= Lãi bán hàng + Lãi dịch vụ chấm điểm đã thu + Điều chỉnh tính vào lãi (khớp báo cáo tháng ở Tổng quan)", { bold: true, sign: true });
  kpi("   • Lãi bán hàng (đã trừ đơn bán lỗ)", salesProfit, "Tổng (giá bán − giá vốn) của các đơn bán trong tháng", { sign: true });
  kpi("   • Trong đó tổng bán lỗ", -salesLoss, "Các đơn bán dưới giá vốn, đã được trừ vào lợi nhuận", { sign: true });
  kpi("   • Lãi dịch vụ chấm điểm (đã thu tiền)", gradingProfit, "Giá dịch vụ − giá gốc − phí ship của các đơn đã thu tiền khách trong tháng", { sign: true });
  kpi("   • Điều chỉnh tiền mặt tính vào lãi", flaggedAdjustments, "Các khoản điều chỉnh dương được tick “Tính vào lãi”");
  s1.addRow([]);

  sectionTitle(s1, "2. DÒNG TIỀN KHÁC TRONG THÁNG", 3);
  headerRow(s1, ["Khoản", "Giá trị", "Ghi chú"]);
  kpi("Rút tiền từ quỹ", withdrawals, "Chủ shop rút quỹ — không tính là chi phí kinh doanh");
  kpi("Trả nợ ứng tiền", debtRepaid, "Hoàn trả tiền cá nhân đã ứng ra mua hàng");
  kpi("Thu hồi tiền ứng", debtCollected, "Thu lại tiền quỹ đã ứng cho người khác");
  kpi("Điều chỉnh tiền mặt (+)", adjustmentsIn, "Điều chỉnh dương, kể cả khoản không tính vào lãi");
  kpi("Điều chỉnh tiền mặt (−)", -adjustmentsOut, "Điều chỉnh âm", { sign: true });
  s1.addRow([]);

  sectionTitle(s1, "3. GIÁ TRỊ KHO HIỆN TẠI (tại thời điểm xuất file)", 3);
  headerRow(s1, ["Chỉ số", "Giá trị", "Ghi chú"]);
  kpi("Tổng giá trị kho (WACC)", valuation.capital, `${valuation.skus} SKU · số lượng × giá vốn bình quân`, { bold: true });
  kpi("Tổng định giá thị trường (US Market)", valuation.market, `${valuation.priced}/${valuation.skus} SKU đã có giá TCGplayer US`, { bold: true });
  kpi("Lãi / lỗ tạm tính (Unrealized P/L)", unrealized, "Chỉ so với vốn của đúng các SKU đã có giá thị trường", { bold: true, sign: true });
  s1.addRow([]);

  sectionTitle(s1, "4. THỐNG KÊ KHÁCH HÀNG & DỊCH VỤ", 3);
  headerRow(s1, ["Chỉ số", "Giá trị", "Ghi chú"]);
  kpi("Tổng số đơn bán hoàn tất", sales.length, "Số đơn bán hàng ghi nhận trong tháng (gồm đơn chốt qua Page)", { fmt: INT, bold: true });
  kpi("Số khách hàng mới", newCustomers, "Hồ sơ khách tạo trong tháng", { fmt: INT, bold: true });
  kpi("Tổng số thẻ gửi chấm điểm", gradingCardsSent, "Số thẻ của các đơn chấm điểm tạo trong tháng", { fmt: INT, bold: true });
  kpi("Đơn chấm điểm đã trả khách", completedGrading, "Đơn chuyển sang “Đã trả khách” trong tháng", { fmt: INT });

  // =================================================================================================================
  // SHEET 2 — DÒNG TIỀN & CÔNG NỢ
  // =================================================================================================================
  const s2 = workbook.addWorksheet("Dòng Tiền & Công Nợ", { views: [{ showGridLines: false }] });
  widths(s2, [18, 20, 18, 18, 62, 16, 14, 28]);
  titleBlock(s2, `DÒNG TIỀN CHI TIẾT ${range.label.toUpperCase()}`, "Toàn bộ khoản Thu / Chi ghi vào Dòng tiền trong tháng", 8);
  sectionTitle(s2, "1. GIAO DỊCH THU / CHI", 8);
  const cashHead = headerRow(s2, ["Ngày", "Loại giao dịch", "Số tiền", "Số dư sau GD", "Nội dung", "Phương thức", "Trạng thái", "Ghi chú"]);
  const ledgerLabel: Record<string, string> = {
    PURCHASE: "Nhập hàng",
    SALE: "Doanh thu bán hàng",
    MANUAL_ADJUSTMENT: "Điều chỉnh",
    WITHDRAWAL: "Rút tiền",
    DEBT_REPAYMENT: "Trả nợ ứng tiền",
    DEBT_COLLECTION: "Thu hồi tiền ứng",
    GRADING_INCOME: "Thu chấm điểm",
    GRADING_COST: "Chi phí chấm điểm",
  };
  const cashFirst = cashHead.number + 1;
  if (ledger.length === 0) {
    const r = dataRow(s2, ["Không có giao dịch nào trong tháng này.", "", "", "", "", "", "", ""]);
    s2.mergeCells(r.number, 1, r.number, 8);
  }
  ledger.forEach((e, i) => {
    const amount = num(e.amount);
    const notes: string[] = [];
    if (e.countsAsProfit) notes.push("Tính vào lãi");
    if (e.transaction?.source === "MESSENGER_AUTO") notes.push("Tự động từ Messenger");
    else if (e.transaction?.source === "MESSENGER") notes.push("Chốt qua Page");
    if (e.transaction?.totalCost != null && num(e.transaction.totalCost) > num(e.transaction.totalAmount)) {
      notes.push(`Bán lỗ ${fmtNumber(num(e.transaction.totalCost) - num(e.transaction.totalAmount))}₫`);
    }
    if (e.gradingIncome) notes.push(`Lãi dịch vụ ${fmtNumber(num(e.gradingIncome.markup))}₫`);
    const r = dataRow(
      s2,
      [
        vn(e.createdAt),
        ledgerLabel[e.type] ?? e.type,
        amount,
        num(e.balanceAfter),
        e.description ?? "—",
        paymentMethodLabel(e.transaction?.paymentMethod) ?? "—",
        "Đã ghi sổ",
        notes.join(" · "),
      ],
      { 1: DATE_TIME, 3: VND, 4: VND },
      i % 2 === 1
    );
    signColor(r.getCell(3), amount);
  });
  const cashLast = s2.lastRow!.number;
  const totalIn = ledger.filter((e) => num(e.amount) > 0).reduce((s, e) => s + num(e.amount), 0);
  const totalOut = ledger.filter((e) => num(e.amount) < 0).reduce((s, e) => s + Math.abs(num(e.amount)), 0);
  if (ledger.length > 0) {
    const rng = `C${cashFirst}:C${cashLast}`;
    totalRow(s2, ["TỔNG THU", "", formula(`SUMIF(${rng},">0")`, totalIn), "", "", "", "", ""], { 3: VND });
    totalRow(s2, ["TỔNG CHI", "", formula(`-SUMIF(${rng},"<0")`, totalOut), "", "", "", "", ""], { 3: VND });
    totalRow(s2, ["CHÊNH LỆCH THU − CHI", "", formula(`SUM(${rng})`, totalIn - totalOut), "", "", "", "", ""], { 3: VND });
  }
  s2.views = [{ showGridLines: false, state: "frozen", ySplit: cashHead.number }];
  s2.addRow([]);

  // Debts still open at the end of the month: paid-at-end = current paid minus payments made after the month.
  sectionTitle(s2, `2. SỔ CÔNG NỢ / ỨNG TIỀN CHƯA THANH TOÁN (tính đến cuối ${range.label.toLowerCase()})`, 8);
  headerRow(s2, ["Người ứng", "Loại", "Tổng tiền", "Đã trả đến cuối tháng", "Tham chiếu / ghi chú", "Còn lại", "Ngày tạo", "Trạng thái hiện tại"]);
  const openDebts = debts
    .map((d) => {
      const paidAfter = d.payments.filter((p) => p.createdAt >= end).reduce((s, p) => s + num(p.amount), 0);
      const paidAtEnd = Math.max(0, num(d.paidAmount) - paidAfter);
      return { d, paidAtEnd, remaining: num(d.amount) - paidAtEnd };
    })
    .filter((x) => x.remaining > 0)
    .sort((a, b) => a.d.personName.localeCompare(b.d.personName, "vi") || a.d.createdAt.getTime() - b.d.createdAt.getTime());
  const debtFirst = s2.lastRow!.number + 1;
  if (openDebts.length === 0) {
    const r = dataRow(s2, ["Không có khoản nợ nào còn chưa thanh toán.", "", "", "", "", "", "", ""]);
    s2.mergeCells(r.number, 1, r.number, 8);
  }
  openDebts.forEach(({ d, paidAtEnd, remaining }, i) => {
    const r = dataRow(
      s2,
      [
        d.personName,
        d.type === "ADVANCED_BY_PERSON" ? "CardNest nợ" : "Cần thu hồi",
        num(d.amount),
        paidAtEnd,
        [d.referenceLabel, d.notes].filter(Boolean).join(" — ") || "—",
        formula(`C${debtFirst + i}-D${debtFirst + i}`, remaining),
        vn(d.createdAt),
        d.status === "PAID" ? "Đã hoàn tất (sau tháng)" : d.status === "PARTIAL" ? "Trả một phần" : "Chưa thanh toán",
      ],
      { 3: VND, 4: VND, 6: VND, 7: DATE },
      i % 2 === 1
    );
    r.getCell(2).font = { color: { argb: d.type === "ADVANCED_BY_PERSON" ? RED : GREEN }, bold: true };
  });
  if (openDebts.length > 0) {
    const debtLast = s2.lastRow!.number;
    const owed = openDebts.filter((x) => x.d.type === "ADVANCED_BY_PERSON").reduce((s, x) => s + x.remaining, 0);
    const toCollect = openDebts.filter((x) => x.d.type === "ADVANCED_TO_PERSON").reduce((s, x) => s + x.remaining, 0);
    totalRow(s2, ["CARDNEST ĐANG NỢ", "", "", "", "", formula(`SUMIF(B${debtFirst}:B${debtLast},"CardNest nợ",F${debtFirst}:F${debtLast})`, owed), "", ""], { 6: VND });
    totalRow(s2, ["CẦN THU HỒI", "", "", "", "", formula(`SUMIF(B${debtFirst}:B${debtLast},"Cần thu hồi",F${debtFirst}:F${debtLast})`, toCollect), "", ""], { 6: VND });

    // Per-person balance.
    s2.addRow([]);
    headerRow(s2, ["Người ứng", "CardNest nợ", "Cần thu hồi", "Chênh lệch ròng", "", "", "", ""]);
    const byPerson = new Map<string, { name: string; owed: number; collect: number }>();
    for (const x of openDebts) {
      const key = x.d.personName.trim().toLowerCase();
      const row = byPerson.get(key) ?? { name: x.d.personName.trim(), owed: 0, collect: 0 };
      if (x.d.type === "ADVANCED_BY_PERSON") row.owed += x.remaining;
      else row.collect += x.remaining;
      byPerson.set(key, row);
    }
    [...byPerson.values()].forEach((p, i) => {
      const r = dataRow(s2, [p.name, p.owed, p.collect, p.collect - p.owed, "", "", "", ""], { 2: VND, 3: VND, 4: VND }, i % 2 === 1);
      signColor(r.getCell(4), p.collect - p.owed);
    });
  }

  // =================================================================================================================
  // SHEET 3 — KHO HÀNG
  // =================================================================================================================
  const s3 = workbook.addWorksheet("Kho Hàng", { views: [{ showGridLines: false }] });
  widths(s3, [18, 12, 46, 16, 14, 14, 16, 18, 20, 20]);
  titleBlock(s3, `BÁO CÁO KHO HÀNG ${range.label.toUpperCase()}`, "Biến động tồn kho trong tháng, chi tiết SKU hiện tại và cảnh báo hàng tồn lâu", 10);

  // Opening / closing stock rebuilt from the purchase and sale lines (stock edited by hand is not a transaction).
  type Move = { inMonthIn: number; inMonthOut: number; afterIn: number; afterOut: number };
  const moves = new Map<string, Move>();
  for (const it of movementItems) {
    const id = it.sealedProductId ?? it.singleCardId;
    if (!id) continue;
    const m = moves.get(id) ?? { inMonthIn: 0, inMonthOut: 0, afterIn: 0, afterOut: 0 };
    const at = it.transaction.transactionDate;
    const purchase = it.transaction.type === "PURCHASE";
    if (at < end) {
      if (purchase) m.inMonthIn += it.quantity;
      else m.inMonthOut += it.quantity;
    } else if (purchase) m.afterIn += it.quantity;
    else m.afterOut += it.quantity;
    moves.set(id, m);
  }

  interface StockRow {
    id: string;
    sku: string;
    kind: "Sealed" | "Single";
    name: string;
    game: string | null;
    qty: number;
    cost: number;
    market: number | null;
    createdAt: Date;
    active: boolean; // counts as current stock (single cards that are SOLD do not)
  }
  const byGameThenName = (a: StockRow, b: StockRow) =>
    (a.game ?? "~").localeCompare(b.game ?? "~", "vi") || a.name.localeCompare(b.name, "vi");
  const stock: StockRow[] = [
    ...sealed.map((p) => ({ id: p.id, sku: p.sku, kind: "Sealed" as const, name: p.name, game: p.game, qty: p.quantity, cost: num(p.costPrice), market: p.marketPrice == null ? null : num(p.marketPrice), createdAt: p.createdAt, active: true })),
    ...singles.map((c) => ({ id: c.id, sku: c.sku, kind: "Single" as const, name: c.cardName, game: c.game, qty: c.quantity, cost: num(c.costPrice), market: c.marketPrice == null ? null : num(c.marketPrice), createdAt: c.createdAt, active: c.status !== "SOLD" })),
  ].sort(byGameThenName);

  sectionTitle(s3, "1. BIẾN ĐỘNG KHO TRONG THÁNG", 10);
  const moveHead = headerRow(s3, ["Mã SKU", "Loại", "Tên sản phẩm", "Tồn đầu kỳ", "Nhập mới", "Xuất bán", "Tồn cuối kỳ", "", "", ""]);
  const moveFirst = moveHead.number + 1;
  let openTotal = 0, inTotal = 0, outTotal = 0, closeTotal = 0;
  const movementRows = stock
    .map((s) => {
      const m = moves.get(s.id) ?? { inMonthIn: 0, inMonthOut: 0, afterIn: 0, afterOut: 0 };
      const closing = s.qty - m.afterIn + m.afterOut;
      const opening = closing - m.inMonthIn + m.inMonthOut;
      return { s, opening, inQty: m.inMonthIn, outQty: m.inMonthOut, closing };
    })
    .filter((r) => r.opening !== 0 || r.inQty !== 0 || r.outQty !== 0 || r.closing !== 0);
  if (movementRows.length === 0) {
    const r = dataRow(s3, ["Không có biến động hoặc tồn kho trong tháng này.", "", "", "", "", "", "", "", "", ""]);
    s3.mergeCells(r.number, 1, r.number, 7);
  }
  movementRows.forEach((r, i) => {
    openTotal += r.opening; inTotal += r.inQty; outTotal += r.outQty; closeTotal += r.closing;
    const row = dataRow(
      s3,
      [r.s.sku, r.s.kind, r.s.name, r.opening, r.inQty, r.outQty, formula(`D${moveFirst + i}+E${moveFirst + i}-F${moveFirst + i}`, r.opening + r.inQty - r.outQty), "", "", ""],
      { 4: INT, 5: INT, 6: INT, 7: INT },
      i % 2 === 1
    );
    if (r.opening + r.inQty - r.outQty !== r.closing) {
      // Stock was changed by hand somewhere (edit form): the formula and the rebuilt closing stock disagree.
      row.getCell(7).value = r.closing;
      row.getCell(7).font = { color: { argb: AMBER }, bold: true };
    }
  });
  if (movementRows.length > 0) {
    const last = s3.lastRow!.number;
    totalRow(s3, ["TỔNG", "", "", formula(`SUM(D${moveFirst}:D${last})`, openTotal), formula(`SUM(E${moveFirst}:E${last})`, inTotal), formula(`SUM(F${moveFirst}:F${last})`, outTotal), formula(`SUM(G${moveFirst}:G${last})`, closeTotal), "", "", ""], { 4: INT, 5: INT, 6: INT, 7: INT });
  }
  const note = s3.addRow(["Tồn đầu/cuối kỳ được dựng lại từ các phiếu nhập / xuất; số lượng sửa tay trong form sản phẩm không có phiếu nên có thể lệch (ô màu cam)."]);
  s3.mergeCells(note.number, 1, note.number, 10);
  note.font = { italic: true, size: 10, color: { argb: SLATE_TEXT } };
  s3.addRow([]);

  sectionTitle(s3, "2. CHI TIẾT TỒN KHO HIỆN TẠI (tại thời điểm xuất file)", 10);
  const detailHead = headerRow(s3, ["Mã SKU", "Loại", "Tên sản phẩm", "Dòng game", "Số lượng tồn", "Giá vốn TB (WACC)", "Giá trị kho (Capital)", "Giá thị trường US", "Giá trị thị trường", "Lãi / lỗ ước tính"]);
  const detailFirst = detailHead.number + 1;
  const current = stock.filter((s) => s.active && s.qty > 0);
  let capitalTotal = 0, marketTotal = 0, plTotal = 0;
  if (current.length === 0) {
    const r = dataRow(s3, ["Hiện không có hàng tồn kho.", "", "", "", "", "", "", "", "", ""]);
    s3.mergeCells(r.number, 1, r.number, 10);
  }
  current.forEach((s, i) => {
    const row = detailFirst + i;
    const capital = s.cost * s.qty;
    capitalTotal += capital;
    const hasMarket = s.market != null;
    const marketValue = hasMarket ? s.market! * s.qty : null;
    if (marketValue != null) {
      marketTotal += marketValue;
      plTotal += marketValue - capital;
    }
    const r = dataRow(
      s3,
      [
        s.sku, s.kind, s.name, s.game ?? "—", s.qty, s.cost,
        formula(`E${row}*F${row}`, capital),
        hasMarket ? s.market : "Chưa có giá",
        hasMarket ? formula(`E${row}*H${row}`, marketValue!) : "—",
        hasMarket ? formula(`I${row}-G${row}`, marketValue! - capital) : "—",
      ],
      { 5: INT, 6: VND, 7: VND, 8: VND, 9: VND, 10: VND },
      i % 2 === 1
    );
    if (hasMarket) signColor(r.getCell(10), marketValue! - capital);
    else r.getCell(8).font = { italic: true, color: { argb: SLATE_TEXT } };
  });
  if (current.length > 0) {
    const last = s3.lastRow!.number;
    totalRow(s3, ["TỔNG", "", "", "", formula(`SUM(E${detailFirst}:E${last})`, current.reduce((s, x) => s + x.qty, 0)), "", formula(`SUM(G${detailFirst}:G${last})`, capitalTotal), "", formula(`SUM(I${detailFirst}:I${last})`, marketTotal), formula(`SUM(J${detailFirst}:J${last})`, plTotal)], { 5: INT, 7: VND, 9: VND, 10: VND });
    const n = s3.addRow(["Lãi / lỗ chỉ tính cho các SKU đã có giá thị trường, so với vốn của đúng các SKU đó (giá thị trường tính theo VND)."]);
    s3.mergeCells(n.number, 1, n.number, 10);
    n.font = { italic: true, size: 10, color: { argb: SLATE_TEXT } };
  }
  s3.addRow([]);

  // Aging: days since the last sale (or since the product was added when it never sold), same rule as the dashboard.
  sectionTitle(s3, `3. CẢNH BÁO HÀNG TỒN LÂU / CHẬM LUÂN CHUYỂN (từ ${SLOW_MOVING_DAYS} ngày không bán)`, 10);
  headerRow(s3, ["Mã SKU", "Loại", "Tên sản phẩm", "Số lượng", "Vốn tồn", "Lần bán gần nhất", "Số ngày không bán", "Mức cảnh báo", "", ""]);
  const lastSaleRows = await prisma.transactionItem.findMany({
    where: { transaction: { type: "SALE" } },
    select: { sealedProductId: true, singleCardId: true, transaction: { select: { transactionDate: true } } },
  });
  const lastSale = new Map<string, Date>();
  for (const it of lastSaleRows) {
    const id = it.sealedProductId ?? it.singleCardId;
    const at = it.transaction.transactionDate;
    if (id && (!lastSale.get(id) || at > lastSale.get(id)!)) lastSale.set(id, at);
  }
  const aging = current
    .map((s) => {
      const sold = lastSale.get(s.id);
      const days = Math.floor((now.getTime() - (sold ?? s.createdAt).getTime()) / DAY_MS);
      return { s, sold, days };
    })
    .filter((x) => x.days >= SLOW_MOVING_DAYS)
    .sort((a, b) => b.days - a.days);
  if (aging.length === 0) {
    const r = dataRow(s3, ["Không có hàng tồn lâu — mọi SKU đều luân chuyển trong ngưỡng.", "", "", "", "", "", "", "", "", ""]);
    s3.mergeCells(r.number, 1, r.number, 8);
  }
  aging.forEach(({ s, sold, days }, i) => {
    const level = days >= 180 ? "Tồn rất lâu (≥180 ngày)" : days >= 90 ? "Tồn lâu (90–179 ngày)" : "Chậm luân chuyển (60–89 ngày)";
    const r = dataRow(s3, [s.sku, s.kind, s.name, s.qty, s.cost * s.qty, sold ? vn(sold) : "Chưa bán lần nào", days, level, "", ""], { 4: INT, 5: VND, 6: DATE, 7: INT }, i % 2 === 1);
    r.getCell(8).font = { bold: true, color: { argb: days >= 180 ? RED : days >= 90 ? AMBER : "FFB45309" } };
  });

  // =================================================================================================================
  // SHEET 4 — DỊCH VỤ CHẤM ĐIỂM
  // =================================================================================================================
  const s4 = workbook.addWorksheet("Dịch Vụ Chấm Điểm", { views: [{ showGridLines: false }] });
  widths(s4, [14, 22, 17, 17, 34, 14, 16, 8, 18, 18, 16, 18, 26]);
  titleBlock(s4, `BÁO CÁO DỊCH VỤ CHẤM ĐIỂM ${range.label.toUpperCase()}`, "Đơn tạo hoặc đã trả khách trong tháng · Lãi dịch vụ = Giá dịch vụ − Giá gốc − Phí ship", 13);
  sectionTitle(s4, "1. CHI TIẾT TỪNG THẺ", 13);
  const gHead = headerRow(s4, ["Mã đơn", "Khách hàng", "Ngày tạo", "Trạng thái", "Tên thẻ", "Hãng chấm", "Gói chấm", "SL", "Giá dịch vụ (thu khách)", "Giá gốc (hãng thu)", "Phí ship", "Lãi dịch vụ", "Thu tiền / ghi chú"]);
  const gFirst = gHead.number + 1;
  if (gradingRows.length === 0) {
    const r = dataRow(s4, ["Không có đơn chấm điểm nào phát sinh hoặc hoàn thành trong tháng này.", "", "", "", "", "", "", "", "", "", "", "", ""]);
    s4.mergeCells(r.number, 1, r.number, 13);
  }
  let svc = 0, base = 0, ship = 0, profit = 0, cards = 0, collectedSvc = 0, uncollectedSvc = 0;
  let line = 0;
  for (const g of gradingRows) {
    const code = `CĐ-${g.id.slice(-5).toUpperCase()}`;
    const paid = Boolean(g.incomeEntryId);
    g.items.forEach((it, idx) => {
      const rowNo = gFirst + line;
      const auto = num(it.listedFee) - num(it.costPrice) - num(it.shipFee);
      const manual = Math.round(num(it.markup)) !== Math.round(auto);
      svc += num(it.listedFee); base += num(it.costPrice); ship += num(it.shipFee); profit += num(it.markup); cards += it.quantity;
      if (paid) collectedSvc += num(it.listedFee);
      else uncollectedSvc += num(it.listedFee);
      const r = dataRow(
        s4,
        [
          idx === 0 ? code : "", idx === 0 ? g.customerName : "", idx === 0 ? vn(g.createdAt) : "", idx === 0 ? gradingStatusLabel[g.status] : "",
          it.cardName, it.company, it.tier, it.quantity,
          num(it.listedFee), num(it.costPrice), num(it.shipFee),
          manual ? num(it.markup) : formula(`I${rowNo}-J${rowNo}-K${rowNo}`, num(it.markup)),
          [paid ? "Đã thu tiền" : "Chưa thu tiền", manual ? `Lãi nhập tay (công thức: ${fmtNumber(auto)}₫)` : ""].filter(Boolean).join(" · "),
        ],
        { 3: DATE, 8: INT, 9: VND, 10: VND, 11: VND, 12: VND },
        line % 2 === 1
      );
      signColor(r.getCell(12), num(it.markup));
      r.getCell(13).font = { color: { argb: paid ? GREEN : AMBER }, size: 10 };
      line += 1;
    });
  }
  if (line > 0) {
    const last = s4.lastRow!.number;
    const col = (c: string) => `SUM(${c}${gFirst}:${c}${last})`;
    totalRow(s4, ["TỔNG", "", "", "", "", "", "", formula(col("H"), cards), formula(col("I"), svc), formula(col("J"), base), formula(col("K"), ship), formula(col("L"), profit), ""], { 8: INT, 9: VND, 10: VND, 11: VND, 12: VND });
  }
  s4.views = [{ showGridLines: false, state: "frozen", ySplit: gHead.number }];
  s4.addRow([]);

  sectionTitle(s4, "2. TỔNG KẾT DỊCH VỤ CHẤM ĐIỂM", 13);
  headerRow(s4, ["Chỉ số", "", "", "", "Giá trị", "", "", "", "", "", "", "", "Ghi chú"]);
  const gk = (label: string, value: number, note: string, signed = false, fmt = VND) => {
    const r = dataRow(s4, [label, "", "", "", value, "", "", "", "", "", "", "", note], { 5: fmt });
    s4.mergeCells(r.number, 1, r.number, 4);
    s4.mergeCells(r.number, 5, r.number, 7);
    r.getCell(1).font = { bold: true };
    r.getCell(13).font = { color: { argb: SLATE_TEXT }, size: 10 };
    if (signed) signColor(r.getCell(5), value);
  };
  gk("Số đơn / số thẻ trong báo cáo", gradingRows.length, `${cards} thẻ`, false, INT);
  gk("Doanh thu dịch vụ (tổng giá dịch vụ)", svc, "Số tiền thu của khách theo giá dịch vụ");
  gk("   • Đã thu tiền", collectedSvc, "Đơn đã ghi khoản Thu vào Dòng tiền");
  gk("   • Chưa thu tiền", uncollectedSvc, "Đơn chưa ghi nhận thu");
  gk("Chi phí dịch vụ (giá gốc + phí ship)", base + ship, `Giá gốc ${fmtNumber(base)}₫ + phí ship ${fmtNumber(ship)}₫`);
  gk("Lãi dịch vụ của các đơn trong báo cáo", profit, "Tổng lãi dịch vụ của mọi thẻ ở bảng trên", true);
  gk("Lãi dịch vụ đã thu tiền trong tháng (tính vào lợi nhuận tháng)", gradingProfit, "Lãi của đơn có khoản Thu ghi trong tháng — khớp Sheet Tổng Quan", true);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as unknown as ArrayBuffer);
}

function formatDay(d: Date) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}
function fmtNumber(n: number) {
  return Math.round(n).toLocaleString("vi-VN");
}
