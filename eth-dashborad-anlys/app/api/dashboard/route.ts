import { NextResponse } from "next/server"
import { loadDashboardWallets } from "@/lib/dashboard-data"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedLimit = Number(searchParams.get("limit") ?? 10000)
    const requestedMaxBlocks = Number(searchParams.get("maxBlocks") ?? 500)
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 10000) : 10000
    const maxBlocks = Number.isFinite(requestedMaxBlocks)
      ? Math.min(Math.max(requestedMaxBlocks, 1), 5000)
      : 500

    const { wallets } = await loadDashboardWallets(limit, maxBlocks)

    return NextResponse.json(wallets, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard data"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
