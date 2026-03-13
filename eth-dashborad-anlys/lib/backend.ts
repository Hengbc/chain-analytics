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

export interface BackendWalletActivityTransaction {
  tx_hash: string
  from_address?: string
  to_address?: string
  value: string
  gas_price?: string
  gas_used?: string
  status?: number
  block_number: number
  timestamp?: string
  method_id?: string
}

export interface BackendWalletActivityTokenTransfer {
  tx_hash: string
  token_address?: string
  token_symbol?: string
  token_decimals?: number
  from_address?: string
  to_address?: string
  value: string
  block_number: number
  timestamp?: string
}

export interface BackendWalletActivity {
  source: string
  chain: string
  address: string
  tx_count: number
  token_transfer_total: number
  last_indexed_block: number
  indexer_status: string
  eth_price?: string
  transactions: BackendWalletActivityTransaction[]
  token_transfers: BackendWalletActivityTokenTransfer[]
  last_seen?: string
  updated_at?: string
}

export interface BackendDashboardWallet {
  id: number
  address: string
  balance: string
  txCount: number
  fundedBy: string | null
  createdAt: string
  dataSource: string
  clientType: string
  clientTier: string
  review: string
  freqCycle: string
  freqTier: string
  addressPurity: string
}

export interface BackendDashboardSeed {
  chain: string
  latest_block: number
  blocks_scanned: number
  addresses_collected: number
  wallets: BackendDashboardWallet[]
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

export async function getWalletActivity(address: string, limit = 25): Promise<BackendWalletActivity | null> {
  try {
    const resp = await fetch(
      `${BACKEND_URL}/api/wallets/${address}/activity?chain=eth&limit=${limit}`,
      { cache: "no-store" }
    )

    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

export async function getRecentDashboardWallets(
  limit = 10000,
  maxBlocks = 500
): Promise<BackendDashboardSeed> {
  const resp = await fetch(
    `${BACKEND_URL}/api/wallets/recent-dashboard?chain=eth&limit=${limit}&max_blocks=${maxBlocks}`,
    { cache: "no-store" }
  )

  if (!resp.ok) {
    let message = `Backend error: ${resp.status}`

    try {
      const errorBody = (await resp.json()) as { detail?: string; error?: string }
      message = errorBody.detail ?? errorBody.error ?? message
    } catch {
      // ignore parse failures and keep the status-based fallback
    }

    throw new Error(message)
  }

  return await resp.json()
}
