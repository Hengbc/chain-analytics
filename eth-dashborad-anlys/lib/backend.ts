/**
 * Backend API client — replaces Etherscan calls with our own FastAPI backend
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001"

export interface BackendWallet {
  chain: string
  address: string
  balance?: string
  tx_count: number
  tx_in_count?: number
  tx_out_count?: number
  total_value_in?: string
  total_value_out?: string
  token_count?: number
  wallet_type?: string
  wallet_tier?: string
  risk_score?: number
  first_seen?: string
  last_seen?: string
  tags?: string[]
}

export async function analyzeAddresses(addresses: string[]): Promise<BackendWallet[]> {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/wallets/bulk-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: "eth",
        addresses,
      }),
      cache: "no-store",
    })

    if (!resp.ok) {
      console.error(`Backend error: ${resp.status}`)
      return []
    }

    const data = await resp.json()
    return Array.isArray(data.results) ? data.results : []
  } catch (e) {
    console.error("Backend analyze failed:", e)
    return []
  }
}

export async function getWallet(address: string): Promise<BackendWallet | null> {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/wallets/${address}?chain=eth`, {
      cache: "no-store",
    })

    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}
