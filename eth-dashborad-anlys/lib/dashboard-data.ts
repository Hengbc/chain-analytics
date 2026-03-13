import { z } from "zod"
import { getRecentDashboardWallets } from "@/lib/backend"
import { schema } from "@/lib/wallet-schema"

type DashboardWallet = z.infer<typeof schema>

export type DashboardDataSource = "backend" | "unavailable"

export async function loadDashboardWallets(
  limit = 10000,
  maxBlocks = 500
): Promise<{ wallets: DashboardWallet[]; source: DashboardDataSource; error?: string }> {
  const backendData = await getRecentDashboardWallets(limit, maxBlocks)

  if (backendData) {
    return {
      wallets: backendData.wallets as DashboardWallet[],
      source: "backend",
    }
  }

  return {
    wallets: [],
    source: "unavailable",
    error: "Could not load dashboard data from the backend.",
  }
}
