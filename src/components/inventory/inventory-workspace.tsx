"use client";

import { useCallback, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameOverviewCards } from "@/components/inventory/game-overview-cards";
import { SealedTable } from "@/components/inventory/sealed-table";
import { SingleTable } from "@/components/inventory/single-table";
import { InventoryHistoryTable } from "@/components/inventory/inventory-history-table";
import { DebtSummaryCards } from "@/components/debts/debt-summary-cards";
import { DebtTable } from "@/components/debts/debt-table";
import type { GameOverviewEntry } from "@/lib/inventory-overview";
import type { DebtSummary } from "@/lib/debt-summary";

interface InventoryWorkspaceProps {
  initialOverview: GameOverviewEntry[];
  initialDebtSummary: DebtSummary;
}

export function InventoryWorkspace({ initialOverview, initialDebtSummary }: InventoryWorkspaceProps) {
  const [overview, setOverview] = useState(initialOverview);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [debtSummary, setDebtSummary] = useState(initialDebtSummary);

  const refreshOverview = useCallback(() => {
    fetch("/api/inventory/overview")
      .then((res) => res.json())
      .then((json) => setOverview(json.overview ?? []))
      .catch(() => {});
  }, []);

  const refreshDebtSummary = useCallback(() => {
    fetch("/api/debts/summary")
      .then((res) => res.json())
      .then((json) => setDebtSummary(json))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <GameOverviewCards
        overview={overview}
        selectedGame={selectedGame}
        onSelectGame={setSelectedGame}
      />

      <Tabs defaultValue="sealed">
        <TabsList>
          <TabsTrigger value="sealed">Hàng Sealed</TabsTrigger>
          <TabsTrigger value="singles">Bài Singles</TabsTrigger>
          <TabsTrigger value="history">Lịch sử Xuất/Nhập</TabsTrigger>
          <TabsTrigger value="debts">Sổ Ghi Nợ & Ứng Tiền</TabsTrigger>
        </TabsList>
        <TabsContent value="sealed">
          <SealedTable gameFilter={selectedGame} onInventoryChanged={refreshOverview} />
        </TabsContent>
        <TabsContent value="singles">
          <SingleTable gameFilter={selectedGame} onInventoryChanged={refreshOverview} />
        </TabsContent>
        <TabsContent value="history">
          <InventoryHistoryTable />
        </TabsContent>
        <TabsContent value="debts" className="space-y-4">
          <DebtSummaryCards summary={debtSummary} />
          <DebtTable onDebtChanged={refreshDebtSummary} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
