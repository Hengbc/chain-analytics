import { z } from "zod"
import { getRecentDashboardWallets } from "@/lib/backend"
import { schema } from "@/lib/wallet-schema"

type DashboardWallet = z.infer<typeof schema>

export type DashboardDataSource = "backend" | "unavailable"

export async function loadDashboardWallets(
  limit = 10000,
  maxBlocks = 500
): Promise<{ wallets: DashboardWallet[]; source: DashboardDataSource; error?: string }> {
  try {
    const backendData = await getRecentDashboardWallets(limit, maxBlocks)
    return {
      wallets: backendData.wallets as DashboardWallet[],
      source: "backend",
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load dashboard data from the backend."
    return {
      wallets: [],
      source: "unavailable",
      error: message,
    }
  }
}
