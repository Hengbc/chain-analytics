import { z } from "zod"
import fallbackWallets from "@/app/dashboard/data.json"
import { getRecentDashboardWallets } from "@/lib/backend"
import { schema } from "@/lib/wallet-schema"

type DashboardWallet = z.infer<typeof schema>

export type DashboardDataSource = "backend" | "fallback"

export async function loadDashboardWallets(
  limit = 10000,
  maxBlocks = 500
): Promise<{ wallets: DashboardWallet[]; source: DashboardDataSource }> {
  const backendData = await getRecentDashboardWallets(limit, maxBlocks)

  if (backendData?.wallets?.length) {
    return {
      wallets: backendData.wallets as DashboardWallet[],
      source: "backend",
    }
  }

  return {
    wallets: fallbackWallets as DashboardWallet[],
    source: "fallback",
  }
}
