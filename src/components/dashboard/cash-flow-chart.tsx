"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import type { MonthlyFinancial } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatVND, LUXURY_CARD_CLASS } from "@/lib/utils";

const SERIES = [
  { key: "totalIncome" as const, label: "Thu", color: "#2a78d6" },
  { key: "totalExpense" as const, label: "Chi", color: "#eb6834" },
];

const CHART_HEIGHT = 220;
const BAR_WIDTH = 14;
const BAR_GAP = 2;

function shortLabel(label: string) {
  // "Tháng 9/2026" -> "T9/26"
  const match = label.match(/Tháng (\d+)\/(\d{4})/);
  if (!match) return label;
  return `T${match[1]}/${match[2].slice(2)}`;
}

interface TooltipState {
  x: number;
  y: number;
  month: MonthlyFinancial;
}

export function CashFlowChart({ months }: { months: MonthlyFinancial[] }) {
  const defaultSelection = useMemo(
    () => new Set(months.slice(-6).map((m) => m.month)),
    [months]
  );
  const [selected, setSelected] = useState<Set<string>>(defaultSelection);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const visibleMonths = months.filter((m) => selected.has(m.month));

  const maxPositive = Math.max(
    0,
    ...visibleMonths.flatMap((m) => SERIES.map((s) => m[s.key]))
  );
  const minNegative = Math.min(0, ...visibleMonths.flatMap((m) => SERIES.map((s) => m[s.key])));
  const span = maxPositive - minNegative || 1;
  const zeroY = (maxPositive / span) * CHART_HEIGHT;

  function valueToBar(value: number) {
    const h = (Math.abs(value) / span) * CHART_HEIGHT;
    const y = value >= 0 ? zeroY - h : zeroY;
    return { y, h };
  }

  function toggleMonth(month: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  }

  function selectPreset(count: number) {
    setSelected(new Set(months.slice(-count).map((m) => m.month)));
  }

  const groupWidth = SERIES.length * BAR_WIDTH + (SERIES.length - 1) * BAR_GAP;
  const groupGap = 28;
  const chartWidth = Math.max(
    visibleMonths.length * (groupWidth + groupGap),
    groupWidth + groupGap
  );

  return (
    <Card className={LUXURY_CARD_CLASS}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Báo cáo dòng tiền</CardTitle>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              Chọn tháng ({selected.size})
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[3, 6, 12].map((n) => (
                <Button key={n} type="button" size="sm" variant="secondary" onClick={() => selectPreset(n)}>
                  {n} tháng
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setSelected(new Set(months.map((m) => m.month)))}
              >
                Tất cả
              </Button>
            </div>
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {months
                .slice()
                .reverse()
                .map((m) => {
                  const isChecked = selected.has(m.month);
                  return (
                    <button
                      key={m.month}
                      type="button"
                      onClick={() => toggleMonth(m.month)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          isChecked ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        )}
                      >
                        {isChecked && <Check className="h-3 w-3" />}
                      </span>
                      {m.label}
                    </button>
                  );
                })}
            </div>
          </PopoverContent>
        </Popover>
      </CardHeader>
      <CardContent>
        {visibleMonths.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Chọn ít nhất 1 tháng để xem biểu đồ.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-4 text-sm">
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span className="text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="relative overflow-x-auto">
              <svg
                width={chartWidth}
                height={CHART_HEIGHT + 28}
                className="overflow-visible"
                role="img"
                aria-label="Biểu đồ Thu, Chi theo tháng"
              >
                {/* zero baseline */}
                <line
                  x1={0}
                  x2={chartWidth}
                  y1={zeroY}
                  y2={zeroY}
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                />

                {visibleMonths.map((m, groupIndex) => {
                  const groupX = groupIndex * (groupWidth + groupGap) + groupGap / 2;
                  return (
                    <g key={m.month}>
                      {SERIES.map((s, i) => {
                        const value = m[s.key];
                        const { y, h } = valueToBar(value);
                        const x = groupX + i * (BAR_WIDTH + BAR_GAP);
                        const isHovered =
                          tooltip?.month.month === m.month;
                        return (
                          <rect
                            key={s.key}
                            x={x}
                            y={y}
                            width={BAR_WIDTH}
                            height={Math.max(h, value !== 0 ? 2 : 0)}
                            rx={4}
                            fill={s.color}
                            opacity={isHovered ? 1 : 0.9}
                            onPointerEnter={(e) =>
                              setTooltip({
                                x: e.clientX,
                                y: e.clientY,
                                month: m,
                              })
                            }
                            onPointerLeave={() => setTooltip(null)}
                          />
                        );
                      })}
                      <text
                        x={groupX + groupWidth / 2}
                        y={CHART_HEIGHT + 20}
                        textAnchor="middle"
                        fontSize={11}
                        fill="hsl(var(--muted-foreground))"
                      >
                        {shortLabel(m.label)}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {tooltip && (
                <div
                  className="pointer-events-none fixed z-50 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
                  style={{ left: tooltip.x + 12, top: tooltip.y - 60 }}
                >
                  <p className="mb-1 font-medium">{tooltip.month.label}</p>
                  {SERIES.map((s) => (
                    <p key={s.key} className="flex items-center gap-1.5">
                      <span className="h-1.5 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                      <span className="text-muted-foreground">{s.label}:</span>
                      <span className="font-semibold">{formatVND(tooltip.month[s.key])}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Tháng</th>
                    <th className="pb-2 text-right font-medium">Tổng Thu</th>
                    <th className="pb-2 text-right font-medium">Tổng Chi</th>
                    <th className="pb-2 text-right font-medium">Lợi Nhuận Bán Hàng</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMonths.map((m) => (
                    <tr key={m.month} className="border-b last:border-0">
                      <td className="py-2 font-medium">{m.label}</td>
                      <td className="py-2 text-right text-blue-600 dark:text-blue-400">
                        +{formatVND(m.totalIncome)}
                      </td>
                      <td className="py-2 text-right" style={{ color: "#c8532a" }}>
                        -{formatVND(m.totalExpense)}
                      </td>
                      <td className="py-2 text-right">
                        <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-bold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                          +{formatVND(m.salesProfit)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
