"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameOverviewCards } from "@/components/inventory/game-overview-cards";
import { SealedTable } from "@/components/inventory/sealed-table";
import { SingleTable } from "@/components/inventory/single-table";
import { InventoryHistoryTable } from "@/components/inventory/inventory-history-table";
import { PortfolioValuationCards } from "@/components/inventory/portfolio-valuation-cards";
import { Button } from "@/components/ui/button";
import { refreshMarketPricesAction } from "@/server/actions/market-prices";
import { BatchImportDialog } from "@/components/inventory/batch-import-dialog";
import type { GameOverviewEntry } from "@/lib/inventory-overview";

interface InventoryWorkspaceProps {
  initialOverview: GameOverviewEntry[];
}

export function InventoryWorkspace({ initialOverview }: InventoryWorkspaceProps) {
  const [overview, setOverview] = useState(initialOverview);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [tableVersion, setTableVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);

  const refreshOverview = useCallback(() => {
    fetch("/api/inventory/overview")
      .then((res) => res.json())
      .then((json) => setOverview(json.overview ?? []))
      .catch(() => {});
  }, []);

  // Re-prices auto-linked cards. Non-forced runs skip prices fresher than 10 minutes.
  const runPriceRefresh = useCallback(
    async (force: boolean) => {
      setRefreshing(true);
      try {
        const result = await refreshMarketPricesAction(force);
        if ("error" in result) {
          if (force) toast.error(result.error);
          return;
        }
        setLastPriceUpdate(new Date(result.at));
        if (result.updated > 0) {
          refreshOverview();
          setTableVersion((v) => v + 1);
        }
        if (force) {
          toast.success(
            result.checked === 0
              ? "Chưa có thẻ nào liên kết giá tự động"
              : `Đã cập nhật ${result.updated}/${result.checked} thẻ (tỷ giá 1 USD = ${Math.round(result.rate).toLocaleString("vi-VN")} ₫)${result.failed ? ` · ${result.failed} thẻ lỗi nguồn giá, giữ giá cũ` : ""}`
          );
        }
      } finally {
        setRefreshing(false);
      }
    },
    [refreshOverview]
  );

  useEffect(() => {
    runPriceRefresh(false);
    const timer = setInterval(() => runPriceRefresh(false), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [runPriceRefresh]);

  function handleBatchImported() {
    refreshOverview();
    // Remount the tables so they re-fetch the freshly imported rows.
    setTableVersion((v) => v + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {lastPriceUpdate && (
          <span className="text-xs text-muted-foreground">
            Giá cập nhật lúc {lastPriceUpdate.toLocaleTimeString("vi-VN")} · tự làm mới mỗi 5 phút
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={refreshing}
          onClick={() => runPriceRefresh(true)}
        >
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Cập nhật giá thị trường
        </Button>
        <BatchImportDialog onImported={handleBatchImported} />
      </div>
      <PortfolioValuationCards overview={overview} selectedGame={selectedGame} />
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
