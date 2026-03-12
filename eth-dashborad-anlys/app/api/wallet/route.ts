import { NextResponse } from "next/server"
import wallets from "@/app/dashboard/data.json"
import { analyzeAddresses } from "@/lib/backend"

export async function GET() {
  try {
    const addresses = wallets.map((w) => w.address)
    
    // Call our backend API instead of Etherscan
    const backendResults = await analyzeAddresses(addresses)
    
    // Build lookup map
    const backendMap = new Map()
    for (const r of backendResults) {
      if (r.address) {
        backendMap.set(r.address.toLowerCase(), r)
      }
    }

    const result = wallets.map((w) => {
      const backend = backendMap.get(w.address.toLowerCase())
      return {
        ...w,
        balance: backend?.balance ?? w.balance ?? "0",
        txCount: backend?.tx_count ?? w.txCount ?? 0,
      }
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error("Backend fetch error:", e)
    // Fallback to static data
    return NextResponse.json(wallets)
  }
}
