"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boxes, History, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameOverviewCards } from "@/components/inventory/game-overview-cards";
import { SealedTable } from "@/components/inventory/sealed-table";
import { SingleTable } from "@/components/inventory/single-table";
import { InventoryHistoryTable } from "@/components/inventory/inventory-history-table";
import { PortfolioValuationCards } from "@/components/inventory/portfolio-valuation-cards";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
              ? `TCGplayer US: ${parts.join(" · ")}${rate ? ` (1 USD = ${Math.round(rate).toLocaleString("vi-VN")} ₫)` : ""}`
              : "Giá đã mới nhất — không có gì cần cập nhật"
          );
        } else if (total.linked > 0) {
          toast.success(`Đã tự khớp ${total.linked} sản phẩm với giá TCGplayer`);
        }
      } catch {
        if (force) toast.error("Không cập nhật được giá thị trường lúc này, hãy thử lại sau");
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

  const TAB_TRIGGER =
    "shrink-0 flex-1 gap-2 whitespace-nowrap rounded-xl px-2 text-xs font-medium sm:px-4 sm:text-sm text-muted-foreground transition-all duration-150 data-[state=active]:bg-brand-gradient data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-primary/25";

  return (
    <div className="space-y-5">
      {/* Header: title + description, price sync and batch import on the right */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý sản phẩm, tồn kho và giá bán trên toàn bộ kho của bạn.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2.5 sm:w-auto sm:justify-end">
          {progress ? (
            <span className="text-xs font-medium text-accent-foreground">{progress}</span>
          ) : (
            lastPriceUpdate && (
              <span className="hidden text-xs text-muted-foreground lg:inline">
                Giá TCGplayer US cập nhật lúc {lastPriceUpdate.toLocaleTimeString("vi-VN")} · tự làm mới mỗi 5 phút
              </span>
            )
          )}
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl border-border/80 bg-input hover:bg-accent/40"
            disabled={refreshing}
            onClick={() => runPriceRefresh(true)}
            title="Khớp sản phẩm với TCGplayer và cập nhật giá thị trường US ngay"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "Đang cập nhật…" : "Cập nhật giá TCGplayer US"}
          </Button>
          <BatchImportDialog onImported={handleBatchImported} />
        </div>
      </div>

      <PortfolioValuationCards overview={overview} selectedGame={selectedGame} />
      <GameOverviewCards overview={overview} selectedGame={selectedGame} onSelectGame={setSelectedGame} />

      <Tabs defaultValue="sealed" className="space-y-4">
        <TabsList className="thin-scroll flex h-12 w-full justify-start overflow-x-auto rounded-2xl border border-border/70 bg-input p-1 sm:inline-grid sm:w-auto sm:min-w-[520px] sm:grid-cols-3">
          <TabsTrigger value="sealed" className={TAB_TRIGGER}>
            <Boxes className="hidden h-4 w-4 sm:block" />
            <span>Hàng Sealed</span>
          </TabsTrigger>
          <TabsTrigger value="singles" className={TAB_TRIGGER}>
            <Sparkles className="hidden h-4 w-4 sm:block" />
            <span>Bài Singles</span>
          </TabsTrigger>
          <TabsTrigger value="history" className={TAB_TRIGGER}>
            <History className="hidden h-4 w-4 sm:block" />
            <span>Lịch sử Xuất/Nhập</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sealed" className="mt-0">
          <SealedTable key={`sealed-${tableVersion}`} gameFilter={selectedGame} onInventoryChanged={refreshOverview} />
        </TabsContent>
        <TabsContent value="singles" className="mt-0">
          <SingleTable key={`single-${tableVersion}`} gameFilter={selectedGame} onInventoryChanged={refreshOverview} />
        </TabsContent>
        <TabsContent value="history" className="mt-0">
          <InventoryHistoryTable key={`history-${tableVersion}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
