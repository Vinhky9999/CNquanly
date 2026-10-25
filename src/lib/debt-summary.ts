import { prisma } from "@/lib/prisma";

export interface DebtSummary {
  totalOwedByShop: number; // CardNest còn phải trả (ADVANCED_BY_PERSON, chưa xong)
  totalOwedToShop: number; // CardNest còn phải thu hồi (ADVANCED_TO_PERSON, chưa xong)
  unpaidCount: number; // số khoản chưa hoàn tất (UNPAID hoặc PARTIAL), cả 2 loại
}

export async function getDebtSummary(): Promise<DebtSummary> {
  const debts = await prisma.debt.findMany({
    where: { status: { not: "PAID" } },
    select: { type: true, amount: true, paidAmount: true },
  });

  let totalOwedByShop = 0;
  let totalOwedToShop = 0;

  for (const d of debts) {
    const remaining = Number(d.amount) - Number(d.paidAmount);
    if (d.type === "ADVANCED_BY_PERSON") {
      totalOwedByShop += remaining;
    } else {
      totalOwedToShop += remaining;
    }
  }

  return {
    totalOwedByShop,
    totalOwedToShop,
    unpaidCount: debts.length,
  };
}

export interface PersonDebtSummary {
  personName: string;
  owedByShop: number; // CardNest còn phải trả người này
  owedToShop: number; // người này còn phải trả lại CardNest
  net: number; // owedToShop - owedByShop: dương = người này nợ CardNest, âm = CardNest nợ người này
  openCount: number; // số khoản chưa hoàn tất
  totalDebts: number; // tổng số khoản từ trước đến nay
  totalAdvanced: number; // tổng số tiền các khoản (kể cả đã tất toán)
  totalPaid: number; // tổng đã trả / đã thu
}

/** Debts grouped by person (name compared ignoring case and surrounding spaces), largest outstanding balance first. */
export async function getDebtsByPerson(includeSettled = false): Promise<PersonDebtSummary[]> {
  const debts = await prisma.debt.findMany({
    select: { personName: true, type: true, amount: true, paidAmount: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const people = new Map<string, PersonDebtSummary>();
  for (const d of debts) {
    const key = d.personName.trim().toLowerCase();
    // Newest spelling wins (the list is newest first, so the first one seen is kept).
    const entry =
      people.get(key) ??
      ({
        personName: d.personName.trim(),
        owedByShop: 0,
        owedToShop: 0,
        net: 0,
        openCount: 0,
        totalDebts: 0,
        totalAdvanced: 0,
        totalPaid: 0,
      } satisfies PersonDebtSummary);

    const amount = Number(d.amount);
    const paid = Number(d.paidAmount);
    entry.totalDebts += 1;
    entry.totalAdvanced += amount;
    entry.totalPaid += paid;
    if (d.status !== "PAID") {
      entry.openCount += 1;
      const remaining = amount - paid;
      if (d.type === "ADVANCED_BY_PERSON") entry.owedByShop += remaining;
      else entry.owedToShop += remaining;
    }
    people.set(key, entry);
  }

  return [...people.values()]
    .map((p) => ({ ...p, net: p.owedToShop - p.owedByShop }))
    .filter((p) => includeSettled || p.openCount > 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.owedByShop + b.owedToShop - (a.owedByShop + a.owedToShop) || a.personName.localeCompare(b.personName, "vi"));
}
