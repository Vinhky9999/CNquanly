"use client";

import { useCallback, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameOverviewCards } from "@/components/inventory/game-overview-cards";
import { SealedTable } from "@/components/inventory/sealed-table";
import { SingleTable } from "@/components/inventory/single-table";
import { InventoryHistoryTable } from "@/components/inventory/inventory-history-table";
import { BatchImportDialog } from "@/components/inventory/batch-import-dialog";
import type { GameOverviewEntry } from "@/lib/inventory-overview";

interface InventoryWorkspaceProps {
  initialOverview: GameOverviewEntry[];
}

export function InventoryWorkspace({ initialOverview }: InventoryWorkspaceProps) {
  const [overview, setOverview] = useState(initialOverview);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [tableVersion, setTableVersion] = useState(0);

  const refreshOverview = useCallback(() => {
    fetch("/api/inventory/overview")
      .then((res) => res.json())
      .then((json) => setOverview(json.overview ?? []))
      .catch(() => {});
  }, []);

  function handleBatchImported() {
    refreshOverview();
    // Remount the tables so they re-fetch the freshly imported rows.
    setTableVersion((v) => v + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <BatchImportDialog onImported={handleBatchImported} />
      </div>
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
        </TabsList>
        <TabsContent value="sealed">
          <SealedTable key={`sealed-${tableVersion}`} gameFilter={selectedGame} onInventoryChanged={refreshOverview} />
        </TabsContent>
        <TabsContent value="singles">
          <SingleTable key={`single-${tableVersion}`} gameFilter={selectedGame} onInventoryChanged={refreshOverview} />
        </TabsContent>
        <TabsContent value="history">
          <InventoryHistoryTable key={`history-${tableVersion}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
