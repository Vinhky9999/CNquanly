"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [progress, setProgress] = useState("");
  const runningRef = useRef(false);

  const refreshOverview = useCallback(() => {
    fetch("/api/inventory/overview")
      .then((res) => res.json())
      .then((json) => setOverview(json.overview ?? []))
      .catch(() => {});
  }, []);

  // Matches products to TCGplayer (a few per call) and re-prices linked ones.
  // Non-forced runs skip prices fresher than 30 minutes and products already tried today.
  const runPriceRefresh = useCallback(
    async (force: boolean) => {
      if (runningRef.current) {
        if (force) toast.info("Đang cập nhật giá, vui lòng đợi...");
        return;
      }
      runningRef.current = true;
      setRefreshing(true);

      const total = { linked: 0, unpriced: 0, unmatched: 0, updated: 0, failed: 0, checked: 0 };
      const unmatchedNames: string[] = [];
      let rate = 0;
      try {
        for (let i = 0; i < 20; i++) {
          // Only the first call re-prices; the follow-ups just keep matching the remaining products.
          const result = await refreshMarketPricesAction(force, i > 0);
          if ("error" in result) {
            if (force) toast.error(result.error);
            break;
          }
          total.linked += result.linked;
          total.unpriced += result.unpriced;
          total.unmatched += result.unmatched;
          unmatchedNames.push(...result.unmatchedNames);
          total.updated += result.updated;
          total.failed += result.failed;
          total.checked += result.checked;
          rate = result.rate;
          setLastPriceUpdate(new Date(result.at));
          setProgress(result.remainingToLink > 0 ? `Đang khớp giá TCGplayer… còn ${result.remainingToLink} sản phẩm` : "");
          if (result.remainingToLink === 0 || result.linked + result.unmatched === 0) break;
        }

        if (total.linked > 0 || total.updated > 0) {
          refreshOverview();
          // Remount the tables so they re-fetch the new prices.
          setTableVersion((v) => v + 1);
        }

        if (force) {
          const parts = [
            total.linked > 0 ? `khớp mới ${total.linked} sản phẩm` : null,
            total.updated > 0 ? `cập nhật giá ${total.updated} sản phẩm` : null,
            total.unpriced > 0 ? `${total.unpriced} sản phẩm đã khớp nhưng TCGplayer chưa có giá` : null,
            total.unmatched > 0
              ? `${total.unmatched} sản phẩm không tìm thấy trên TCGplayer (${unmatchedNames.slice(0, 4).join(", ")}${
                  unmatchedNames.length > 4 ? "…" : ""
                })`
              : null,
            total.failed > 0 ? `${total.failed} lỗi nguồn giá (giữ giá cũ)` : null,
          ].filter(Boolean);
          toast.success(
            parts.length
              ? `TCGplayer: ${parts.join(" · ")}${rate ? ` (1 USD = ${Math.round(rate).toLocaleString("vi-VN")} ₫)` : ""}`
              : "Giá đã mới nhất — không có gì cần cập nhật"
          );
        } else if (total.linked > 0) {
          toast.success(`Đã tự khớp ${total.linked} sản phẩm với giá TCGplayer`);
        }
      } finally {
        setProgress("");
        setRefreshing(false);
        runningRef.current = false;
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
    // Match the new products to TCGplayer right away instead of waiting for the next tick.
    runPriceRefresh(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {progress ? (
          <span className="text-xs font-medium text-indigo-500">{progress}</span>
        ) : (
          lastPriceUpdate && (
            <span className="text-xs text-muted-foreground">
              Giá TCGplayer cập nhật lúc {lastPriceUpdate.toLocaleTimeString("vi-VN")} · tự làm mới mỗi 5 phút
            </span>
          )
        )}
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={refreshing}
          onClick={() => runPriceRefresh(true)}
        >
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Cập nhật giá TCGplayer
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
