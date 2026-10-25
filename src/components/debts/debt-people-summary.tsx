"use client";

import { useEffect, useState } from "react";
import { ListFilter, Loader2, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonDebtSummary } from "@/lib/debt-summary";
import { cn, formatVND } from "@/lib/utils";

interface DebtPeopleSummaryProps {
  /** Bumped by the parent whenever a debt or payment changed, to reload the totals. */
  version: number;
  /** Name currently used to filter the debt table below (null = no filter). */
  activePerson: string | null;
  onSelectPerson: (name: string | null) => void;
}

// Total owed to / by each person who advanced money, so the owner sees "who do I owe, who owes me" at a glance.
export function DebtPeopleSummary({ version, activePerson, onSelectPerson }: DebtPeopleSummaryProps) {
  const [rows, setRows] = useState<PersonDebtSummary[] | null>(null);
  const [includeSettled, setIncludeSettled] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    fetch(`/api/debts/people${includeSettled ? "?includeSettled=1" : ""}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((json) => !cancelled && setRows(json.rows))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [version, includeSettled]);

  const totals = (rows ?? []).reduce(
    (acc, r) => ({ owedByShop: acc.owedByShop + r.owedByShop, owedToShop: acc.owedToShop + r.owedToShop }),
    { owedByShop: 0, owedToShop: 0 }
  );

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersRound className="h-4 w-4 text-accent-foreground" />
          Công nợ theo từng người
        </CardTitle>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includeSettled}
            onChange={(e) => setIncludeSettled(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Hiện cả người đã tất toán
        </label>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="py-4 text-center text-sm text-danger">Không tải được công nợ theo người. Thử tải lại trang.</p>
        ) : rows === null ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {includeSettled ? "Chưa có khoản nợ nào." : "Hiện không ai còn nợ hoặc cần thu hồi."}
          </p>
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Người ứng</th>
                  <th className="pb-2 text-right font-medium">CardNest nợ</th>
                  <th className="pb-2 text-right font-medium">Cần thu hồi</th>
                  <th className="pb-2 text-right font-medium">Chênh lệch</th>
                  <th className="pb-2 text-right font-medium">Khoản chưa xong</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const selected = activePerson?.trim().toLowerCase() === r.personName.toLowerCase();
                  return (
                    <tr key={r.personName.toLowerCase()} className={cn("border-b last:border-0", selected && "bg-primary/10")}>
                      <td className="py-2.5 pr-3 font-medium">{r.personName}</td>
                      <td className="py-2.5 text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {r.owedByShop > 0 ? formatVND(r.owedByShop) : "—"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {r.owedToShop > 0 ? formatVND(r.owedToShop) : "—"}
                      </td>
                      <td className="py-2.5 text-right">
                        {r.net === 0 ? (
                          <Badge variant="slate">{r.openCount > 0 ? "Cấn trừ hết" : "Đã tất toán"}</Badge>
                        ) : r.net < 0 ? (
                          <Badge variant="rose" className="whitespace-nowrap">CardNest nợ {formatVND(-r.net)}</Badge>
                        ) : (
                          <Badge variant="success" className="whitespace-nowrap">Thu hồi {formatVND(r.net)}</Badge>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {r.openCount}
                        <span className="text-xs text-muted-foreground"> / {r.totalDebts}</span>
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant={selected ? "default" : "ghost"}
                          className="h-8 gap-1 rounded-lg text-xs"
                          onClick={() => onSelectPerson(selected ? null : r.personName)}
                          aria-pressed={selected}
                        >
                          <ListFilter className="h-3.5 w-3.5" />
                          {selected ? "Bỏ lọc" : "Xem khoản nợ"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="pt-2.5">Tổng cộng ({rows.length} người)</td>
                  <td className="pt-2.5 text-right tabular-nums text-rose-600 dark:text-rose-400">{formatVND(totals.owedByShop)}</td>
                  <td className="pt-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatVND(totals.owedToShop)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
