"use client";

import { useCallback, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CashFlowTable } from "@/components/cash-flow/cash-flow-table";
import { DebtSummaryCards } from "@/components/debts/debt-summary-cards";
import { DebtPeopleSummary } from "@/components/debts/debt-people-summary";
import { DebtTable } from "@/components/debts/debt-table";
import { CashOverviewCards } from "@/components/cash-flow/cash-overview-cards";
import type { DebtSummary } from "@/lib/debt-summary";
import type { CashOverview } from "@/lib/cash-overview";

interface CashFlowWorkspaceProps {
  initialDebtSummary: DebtSummary;
  initialOverview: CashOverview;
}

export function CashFlowWorkspace({ initialDebtSummary, initialOverview }: CashFlowWorkspaceProps) {
  const [debtSummary, setDebtSummary] = useState(initialDebtSummary);

  const [overview, setOverview] = useState(initialOverview);
  // Reloads the per-person totals whenever a debt / payment / ledger entry changed; person = filter of the debt table.
  const [debtVersion, setDebtVersion] = useState(0);
  const [person, setPerson] = useState<string | null>(null);

  const refreshOverview = useCallback(() => {
    fetch("/api/cash-flow/overview")
      .then((res) => res.json())
      .then((json) => setOverview(json))
      .catch(() => {});
  }, []);

  const refreshDebtSummary = useCallback(() => {
    fetch("/api/debts/summary")
      .then((res) => res.json())
      .then((json) => setDebtSummary(json))
      .catch(() => {});
    setDebtVersion((v) => v + 1);
    refreshOverview();
  }, [refreshOverview]);

  return (
    <div className="space-y-6">
    <CashOverviewCards overview={overview} />
    <Tabs defaultValue="ledger">
      <TabsList className="rounded-xl">
        <TabsTrigger value="ledger" className="rounded-lg">
          Dòng Tiền Tổng Quan
        </TabsTrigger>
        <TabsTrigger value="debts" className="rounded-lg">
          Sổ Ghi Công Nợ
        </TabsTrigger>
      </TabsList>
      <TabsContent value="ledger">
        <CashFlowTable onLedgerChanged={refreshDebtSummary} />
      </TabsContent>
      <TabsContent value="debts" className="space-y-4">
        <DebtSummaryCards summary={debtSummary} />
        <DebtPeopleSummary version={debtVersion} activePerson={person} onSelectPerson={setPerson} />
        <DebtTable onDebtChanged={refreshDebtSummary} personFilter={person} onClearPersonFilter={() => setPerson(null)} />
      </TabsContent>
    </Tabs>
    </div>
  );
}
