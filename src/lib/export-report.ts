import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";
import { getInventoryValuation } from "@/lib/portfolio";

export interface ReportRange {
  from: Date | null;
  to: Date | null;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F172A" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };
const CURRENCY_FORMAT = '#,##0" ₫"';
const PROFIT_GREEN = "FF059669";
const PROFIT_RED = "FFDC2626";

const LEDGER_TYPE_LABEL: Record<string, string> = {
  PURCHASE: "Nhập hàng",
  SALE: "Xuất hàng",
  MANUAL_ADJUSTMENT: "Điều chỉnh",
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
}

function autoFitColumns(sheet: ExcelJS.Worksheet, columnCount: number, minWidth = 10, maxWidth = 50) {
  for (let i = 1; i <= columnCount; i++) {
    const column = sheet.getColumn(i);
    let maxLen = minWidth;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const text = cell.value == null ? "" : String(cell.value);
      maxLen = Math.max(maxLen, text.length + 2);
    });
    column.width = Math.min(maxLen, maxWidth);
  }
}

function formatDateLabel(date: Date | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

// SealedProduct.name is enforced as "Game - Set - Loại Box" by the create form.
function parseSealedName(name: string) {
  const parts = name.split(" - ").map((s) => s.trim());
  if (parts.length === 3) {
    return { setName: parts[1], productName: parts[2] };
  }
  return { setName: "—", productName: name };
}

// SingleCard.cardName is a free-form concat ("{game} {set} {name} {số} {độ hiếm}")
// with no separately stored set field, so the split here is a best-effort guess.
function parseSingleCardName(cardName: string, game: string | null) {
  let rest = cardName;
  if (game && rest.startsWith(game)) {
    rest = rest.slice(game.length).trim();
  }
  const tokens = rest.split(" ").filter(Boolean);
  const setName = tokens[0] ?? "—";
  const productName = tokens.slice(1).join(" ") || cardName;
  return { setName, productName };
}

export async function generateFinancialReportBuffer(range: ReportRange): Promise<Buffer> {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (range.from) dateFilter.gte = range.from;
  if (range.to) dateFilter.lte = range.to;
  const hasFilter = Object.keys(dateFilter).length > 0;

  const [ledgerEntries, saleTransactions, sealedProducts, singleCards, inventoryValuation] = await Promise.all([
    prisma.cashLedgerEntry.findMany({
      where: hasFilter ? { createdAt: dateFilter } : undefined,
      orderBy: { createdAt: "asc" },
      include: {
        transaction: {
          include: {
            items: { include: { sealedProduct: true, singleCard: true } },
          },
        },
      },
    }),
    prisma.transaction.findMany({
      where: {
        type: "SALE",
        totalCost: { not: null },
        ...(hasFilter ? { transactionDate: dateFilter } : {}),
      },
      select: { totalAmount: true, totalCost: true },
    }),
    prisma.sealedProduct.findMany({ orderBy: { sku: "asc" } }),
    prisma.singleCard.findMany({
      where: { status: { not: "SOLD" } },
      include: { gradingCompany: true },
      orderBy: { sku: "asc" },
    }),
    getInventoryValuation(),
  ]);

  const totalRevenue = saleTransactions.reduce((sum, t) => sum + Number(t.totalAmount), 0);
  const totalNetProfit = saleTransactions.reduce(
    (sum, t) => sum + Number(t.totalAmount) - Number(t.totalCost ?? 0),
    0
  );
  const totalPurchaseCost = ledgerEntries
    .filter((e) => e.type === "PURCHASE")
    .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CardNest";
  workbook.created = new Date();

  // ---------- Sheet 1: Tổng Quan ----------
  const overviewSheet = workbook.addWorksheet("Tổng Quan");
  overviewSheet.columns = [{ width: 32 }, { width: 26 }];

  const titleRow = overviewSheet.addRow(["BÁO CÁO TÀI CHÍNH & HOẠT ĐỘNG CARDNEST"]);
  overviewSheet.mergeCells(titleRow.number, 1, titleRow.number, 2);
  titleRow.font = { bold: true, size: 16 };
  titleRow.alignment = { horizontal: "center" };

  const fromLabel = formatDateLabel(range.from) ?? "Toàn bộ";
  const toLabel = formatDateLabel(range.to) ?? "hiện tại";
  const subtitleRow = overviewSheet.addRow([`Thời gian trích xuất: ${fromLabel} đến ${toLabel}`]);
  overviewSheet.mergeCells(subtitleRow.number, 1, subtitleRow.number, 2);
  subtitleRow.alignment = { horizontal: "center" };
  subtitleRow.font = { italic: true, color: { argb: "FF64748B" } };

  overviewSheet.addRow([]);

  const summaryHeaderRow = overviewSheet.addRow(["Chỉ số", "Giá trị"]);
  styleHeaderRow(summaryHeaderRow);

  const revenueRow = overviewSheet.addRow(["Tổng Doanh Thu", totalRevenue]);
  revenueRow.getCell(2).numFmt = CURRENCY_FORMAT;
  revenueRow.getCell(1).font = { bold: true };

  const purchaseRow = overviewSheet.addRow(["Tổng Vốn Nhập (Chi)", totalPurchaseCost]);
  purchaseRow.getCell(2).numFmt = CURRENCY_FORMAT;
  purchaseRow.getCell(1).font = { bold: true };

  const profitRow = overviewSheet.addRow(["Tổng Lợi Nhuận Ròng", totalNetProfit]);
  profitRow.getCell(1).font = { bold: true };
  const profitCell = profitRow.getCell(2);
  profitCell.numFmt = CURRENCY_FORMAT;
  profitCell.font = { bold: true, color: { argb: totalNetProfit >= 0 ? PROFIT_GREEN : PROFIT_RED } };

  const inventoryRow = overviewSheet.addRow(["Tổng Giá Trị Tồn Kho hiện tại", inventoryValuation.costValue]);
  inventoryRow.getCell(2).numFmt = CURRENCY_FORMAT;
  inventoryRow.getCell(1).font = { bold: true };

  // ---------- Sheet 2: Dòng Tiền ----------
  const cashSheet = workbook.addWorksheet("Dòng Tiền");
  const cashHeader = cashSheet.addRow([
    "Ngày tháng",
    "Loại Giao Dịch",
    "Mô tả",
    "Số Tiền Thu",
    "Số Tiền Chi",
    "Lợi Nhuận",
  ]);
  styleHeaderRow(cashHeader);
  cashSheet.views = [{ state: "frozen", ySplit: 1 }];

  const cashFirstDataRow = cashHeader.number + 1;

  ledgerEntries.forEach((entry) => {
    const amount = Number(entry.amount);
    const items = entry.transaction?.items ?? [];
    const productNames = items
      .map((item) => item.sealedProduct?.name ?? item.singleCard?.cardName ?? "")
      .filter(Boolean);
    const description = productNames.length ? productNames.join(", ") : entry.description ?? "—";

    let profit: number | null = null;
    if (entry.type === "SALE" && entry.transaction?.totalCost != null) {
      profit = Number(entry.transaction.totalAmount) - Number(entry.transaction.totalCost);
    }

    const row = cashSheet.addRow([
      entry.createdAt,
      LEDGER_TYPE_LABEL[entry.type] ?? entry.type,
      description,
      amount >= 0 ? amount : null,
      amount < 0 ? Math.abs(amount) : null,
      profit,
    ]);

    row.getCell(1).numFmt = "dd/mm/yyyy hh:mm";
    row.getCell(4).numFmt = CURRENCY_FORMAT;
    row.getCell(5).numFmt = CURRENCY_FORMAT;
    if (profit != null) {
      const profitValueCell = row.getCell(6);
      profitValueCell.numFmt = CURRENCY_FORMAT;
      profitValueCell.font = { color: { argb: profit >= 0 ? PROFIT_GREEN : PROFIT_RED } };
    }
  });

  const cashLastDataRow = cashSheet.lastRow?.number ?? cashFirstDataRow - 1;
  if (cashLastDataRow >= cashFirstDataRow) {
    const sumRow = cashSheet.addRow(["TỔNG CỘNG", "", "", null, null, null]);
    cashSheet.mergeCells(sumRow.number, 1, sumRow.number, 3);
    sumRow.font = { bold: true };
    sumRow.getCell(4).value = { formula: `SUM(D${cashFirstDataRow}:D${cashLastDataRow})` };
    sumRow.getCell(5).value = { formula: `SUM(E${cashFirstDataRow}:E${cashLastDataRow})` };
    sumRow.getCell(6).value = { formula: `SUM(F${cashFirstDataRow}:F${cashLastDataRow})` };
    [4, 5, 6].forEach((col) => {
      const cell = sumRow.getCell(col);
      cell.numFmt = CURRENCY_FORMAT;
      cell.font = { bold: true };
    });
  }

  autoFitColumns(cashSheet, cashHeader.cellCount);

  // ---------- Sheet 3: Tồn Kho Hiện Tại ----------
  const inventorySheet = workbook.addWorksheet("Tồn Kho Hiện Tại");
  const inventoryHeader = inventorySheet.addRow([
    "Mã SKU",
    "Dòng Game",
    "Tên Set",
    "Sản Phẩm",
    "Phân Loại",
    "Số Lượng Tồn",
    "Giá Vốn TB",
    "Tổng Giá Trị",
  ]);
  styleHeaderRow(inventoryHeader);
  inventorySheet.views = [{ state: "frozen", ySplit: 1 }];

  const invFirstDataRow = inventoryHeader.number + 1;

  sealedProducts.forEach((product) => {
    const { setName, productName } = parseSealedName(product.name);
    const costPrice = Number(product.costPrice);
    const totalValue = costPrice * product.quantity;
    const row = inventorySheet.addRow([
      product.sku,
      product.game ?? "—",
      setName,
      productName,
      "Sealed",
      product.quantity,
      costPrice,
      totalValue,
    ]);
    row.getCell(7).numFmt = CURRENCY_FORMAT;
    row.getCell(8).numFmt = CURRENCY_FORMAT;
  });

  singleCards.forEach((card) => {
    const { setName, productName } = parseSingleCardName(card.cardName, card.game);
    const costPrice = Number(card.costPrice);
    const classification =
      card.condition === "RAW"
        ? `Raw${card.rawGrade ? ` - ${card.rawGrade}` : ""}`
        : `Slab (Graded)${card.gradingCompany ? ` - ${card.gradingCompany.name}` : ""}${
            card.certNumber ? ` #${card.certNumber}` : ""
          }`;
    const row = inventorySheet.addRow([
      card.sku,
      card.game ?? "—",
      setName,
      productName,
      classification,
      card.quantity,
      costPrice,
      costPrice * card.quantity,
    ]);
    row.getCell(7).numFmt = CURRENCY_FORMAT;
    row.getCell(8).numFmt = CURRENCY_FORMAT;
  });

  const invLastDataRow = inventorySheet.lastRow?.number ?? invFirstDataRow - 1;
  if (invLastDataRow >= invFirstDataRow) {
    const sumRow = inventorySheet.addRow(["TỔNG GIÁ TRỊ KHO", "", "", "", "", "", "", null]);
    inventorySheet.mergeCells(sumRow.number, 1, sumRow.number, 7);
    sumRow.font = { bold: true };
    const totalCell = sumRow.getCell(8);
    totalCell.value = { formula: `SUM(H${invFirstDataRow}:H${invLastDataRow})` };
    totalCell.numFmt = CURRENCY_FORMAT;
    totalCell.font = { bold: true };
  }

  autoFitColumns(inventorySheet, inventoryHeader.cellCount);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as unknown as ArrayBuffer);
}
