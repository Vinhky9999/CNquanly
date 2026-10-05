"use client";

import { useCallback, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CashFlowTable } from "@/components/cash-flow/cash-flow-table";
import { DebtSummaryCards } from "@/components/debts/debt-summary-cards";
import { DebtTable } from "@/components/debts/debt-table";
import type { DebtSummary } from "@/lib/debt-summary";

interface CashFlowWorkspaceProps {
  initialDebtSummary: DebtSummary;
}

export function CashFlowWorkspace({ initialDebtSummary }: CashFlowWorkspaceProps) {
  const [debtSummary, setDebtSummary] = useState(initialDebtSummary);

  const refreshDebtSummary = useCallback(() => {
    fetch("/api/debts/summary")
      .then((res) => res.json())
      .then((json) => setDebtSummary(json))
      .catch(() => {});
  }, []);

  return (
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
  );
}
