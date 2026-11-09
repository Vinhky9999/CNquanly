// Periods the assistant can report on. Days and months are cut in Vietnam time (UTC+7), like the monthly Excel report.

const VN_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export interface Period {
  key: string;
  label: string;
  start: Date; // inclusive
  end: Date; // exclusive
}

/** Start (00:00 Vietnam time) of the day that contains `date`, as a UTC instant. */
function vnDayStart(date: Date): number {
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - VN_OFFSET_MS;
}

const vnMonthStart = (year: number, monthIndex: number) => Date.UTC(year, monthIndex, 1) - VN_OFFSET_MS;

const fmtDay = (ms: number) =>
  new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ms));

export const PERIOD_KEYS = ["today", "yesterday", "this_week", "last_7_days", "this_month", "last_month"] as const;

/**
 * today | yesterday | this_week (from Monday) | last_7_days | this_month | last_month | YYYY-MM | YYYY-MM-DD.
 * Returns null for anything else.
 */
export function resolvePeriod(input: string, now = new Date()): Period | null {
  const value = input.trim().toLowerCase();
  const todayStart = vnDayStart(now);
  const shifted = new Date(now.getTime() + VN_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();

  switch (value) {
    case "today":
      return { key: value, label: `Hôm nay (${fmtDay(todayStart)})`, start: new Date(todayStart), end: new Date(todayStart + DAY_MS) };
    case "yesterday":
      return { key: value, label: `Hôm qua (${fmtDay(todayStart - DAY_MS)})`, start: new Date(todayStart - DAY_MS), end: new Date(todayStart) };
    case "this_week": {
      const monday = todayStart - ((shifted.getUTCDay() + 6) % 7) * DAY_MS;
      return { key: value, label: `Tuần này (từ ${fmtDay(monday)})`, start: new Date(monday), end: new Date(todayStart + DAY_MS) };
    }
    case "last_7_days":
      return { key: value, label: "7 ngày gần nhất", start: new Date(todayStart - 6 * DAY_MS), end: new Date(todayStart + DAY_MS) };
    case "this_month":
      return { key: value, label: `Tháng ${month + 1}/${year}`, start: new Date(vnMonthStart(year, month)), end: new Date(vnMonthStart(year, month + 1)) };
    case "last_month": {
      const lastYear = month === 0 ? year - 1 : year;
      const lastMonth = month === 0 ? 11 : month - 1;
      return { key: value, label: `Tháng ${lastMonth + 1}/${lastYear}`, start: new Date(vnMonthStart(lastYear, lastMonth)), end: new Date(vnMonthStart(lastYear, lastMonth + 1)) };
    }
  }

  const ym = value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (ym) {
    const y = Number(ym[1]);
    const m = Number(ym[2]) - 1;
    return { key: value, label: `Tháng ${m + 1}/${y}`, start: new Date(vnMonthStart(y, m)), end: new Date(vnMonthStart(y, m + 1)) };
  }
  const ymd = value.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (ymd) {
    const start = Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) - VN_OFFSET_MS;
    return { key: value, label: `Ngày ${fmtDay(start)}`, start: new Date(start), end: new Date(start + DAY_MS) };
  }
  return null;
}
