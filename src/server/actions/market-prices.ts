"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/session";
import { refreshMarketPrices, type RefreshResult } from "@/lib/market-prices";

export async function refreshMarketPricesAction(force = false): Promise<RefreshResult | { error: string }> {
  const session = await getSession();
  if (!session.isLoggedIn) return { error: "Chưa đăng nhập" };

  const result = await refreshMarketPrices({ force });
  if (result.updated > 0) {
    revalidatePath("/inventory");
  }
  return result;
}
