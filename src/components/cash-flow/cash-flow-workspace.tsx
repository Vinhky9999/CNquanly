"use client";

import { useCallback, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CashFlowTable } from "@/components/cash-flow/cash-flow-table";
import { DebtSummaryCards } from "@/components/debts/debt-summary-cards";
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
        <DebtTable onDebtChanged={refreshDebtSummary} />
      </TabsContent>
    </Tabs>
    </div>
  );
}
