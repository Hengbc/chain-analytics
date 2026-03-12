import wallets from "@/app/dashboard/data.json"
import { analyzeAddresses, type BackendWallet } from "./backend"

const ETHERSCAN = "https://api.etherscan.io/v2/api"
const CHAIN_ID = "1"
const CACHE_TTL_MS = 10 * 60 * 1000

type CacheEntry<T> = { value: T; at: number }
const txCountCache = new Map<string, CacheEntry<number>>()
const portfolioCache = new Map<string, CacheEntry<{ tokenUsd: number; holdingCount: number }>>()

function buildUrl(params: Record<string, string>) {
  const url = new URL(ETHERSCAN)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return url.toString()
}

async function fetchBalances(addresses: string[], apiKey: string) {
  const balanceMap: Record<string, string> = {}

  for (let i = 0; i < addresses.length; i += 20) {
    const chunk = addresses.slice(i, i + 20)

    try {
      const url = buildUrl({
        chainid: CHAIN_ID,
        module: "account",
        action: "balancemulti",
        address: chunk.join(","),
        tag: "latest",
        apikey: apiKey,
      })
      const res = await fetch(url, { cache: "no-store" })
      const json = await res.json()

      if (json.status === "1" && Array.isArray(json.result)) {
        for (const item of json.result) {
          balanceMap[item.account.toLowerCase()] = (Number(item.balance) / 1e18).toString()
        }
      }
    } catch {
      // ignore chunk errors, fallback to static values
    }

    if (i + 20 < addresses.length) {
      await new Promise((r) => setTimeout(r, 220))
    }
  }

  return balanceMap
}

async function fetchEthPrice(apiKey: string): Promise<number> {
  try {
    const url = buildUrl({
      chainid: CHAIN_ID,
      module: "stats",
      action: "ethprice",
      apikey: apiKey,
    })
    const res = await fetch(url, { cache: "no-store" })
    const json = await res.json()
    const p = Number(json?.result?.ethusd ?? 0)
    return Number.isFinite(p) && p > 0 ? p : 2500
  } catch {
    return 2500
  }
}

async function fetchPortfolioUsd(addresses: string[]) {
  const usdMap: Record<string, number> = {}
  const holdingsMap: Record<string, number> = {}
  const now = Date.now()

  for (const addr of addresses) {
    const key = addr.toLowerCase()
    const cached = portfolioCache.get(key)
    if (cached && now - cached.at < CACHE_TTL_MS) {
      usdMap[key] = cached.value.tokenUsd
      holdingsMap[key] = cached.value.holdingCount
      continue
    }

    try {
      // Ethplorer free endpoint (no paid key required, rate-limited)
      const url = `https://api.ethplorer.io/getAddressInfo/${addr}?apiKey=freekey`
      const res = await fetch(url, { cache: "no-store" })
      const json = await res.json()

      const tokens = Array.isArray(json?.tokens) ? json.tokens : []
      let tokenUsd = 0
      let holdingCount = 0

      for (const t of tokens) {
        const rawBal = Number(t?.rawBalance ?? 0)
        const decimals = Number(t?.tokenInfo?.decimals ?? 18)
        const rate = Number(t?.tokenInfo?.price?.rate ?? 0)
        if (!Number.isFinite(rawBal) || rawBal <= 0) continue

        const amount = rawBal / Math.pow(10, decimals)
        const usd = amount * (Number.isFinite(rate) ? rate : 0)
        if (usd > 0) {
          tokenUsd += usd
          holdingCount += 1
        }
      }

      usdMap[key] = tokenUsd
      holdingsMap[key] = holdingCount
      portfolioCache.set(key, { value: { tokenUsd, holdingCount }, at: Date.now() })
    } catch {
      usdMap[key] = 0
      holdingsMap[key] = 0
    }

    await new Promise((r) => setTimeout(r, 220))
  }

  return { usdMap, holdingsMap }
}

async function fetchEtherscanDisplayedTxCount(address: string): Promise<number | null> {
  try {
    const res = await fetch(`https://etherscan.io/address/${address}`, { cache: "no-store" })
    const html = await res.text()

    const m =
      html.match(/A total of\s*<\/span>\s*<span[^>]*>\s*([\d,]+)\s*<\/span>\s*transactions found/i) ||
      html.match(/A total of\s*([\d,]+)\s*transactions found/i)

    if (!m) return null
    return Number(m[1].replace(/,/g, ""))
  } catch {
    return null
  }
}

async function countAllNormalTransactions(address: string, apiKey: string): Promise<number> {
  const offset = 1000
  let page = 1
  let total = 0

  while (true) {
    const url = buildUrl({
      chainid: CHAIN_ID,
      module: "account",
      action: "txlist",
      address,
      startblock: "0",
      endblock: "99999999",
      page: String(page),
      offset: String(offset),
      sort: "desc",
      apikey: apiKey,
    })

    const res = await fetch(url, { cache: "no-store" })
    const json = await res.json()
    const rows = Array.isArray(json?.result) ? json.result : []

    if (!rows.length) break
    total += rows.length
    if (rows.length < offset) break

    page += 1
    await new Promise((r) => setTimeout(r, 220))
  }

  return total
}

async function fetchTxCounts(addresses: string[], apiKey: string) {
  const txMap: Record<string, number> = {}
  const now = Date.now()

  for (const addr of addresses) {
    const key = addr.toLowerCase()
    const cached = txCountCache.get(key)
    if (cached && now - cached.at < CACHE_TTL_MS) {
      txMap[key] = cached.value
      continue
    }

    try {
      // First try to match Etherscan page displayed total (best UX parity)
      const displayed = await fetchEtherscanDisplayedTxCount(addr)
      if (displayed !== null) {
        txMap[key] = displayed
        txCountCache.set(key, { value: displayed, at: Date.now() })
      } else {
        // fallback: API-based counting
        const count = await countAllNormalTransactions(addr, apiKey)
        txMap[key] = count
        txCountCache.set(key, { value: count, at: Date.now() })
      }
    } catch {
      // fallback to nonce if all else fails
      try {
        const url = buildUrl({
          chainid: CHAIN_ID,
          module: "proxy",
          action: "eth_getTransactionCount",
          address: addr,
          tag: "latest",
          apikey: apiKey,
        })
        const res = await fetch(url, { cache: "no-store" })
        const json = await res.json()
        const raw = json?.result ? parseInt(json.result as string, 16) : 0
        const fallback = Number.isNaN(raw) ? 0 : raw
        txMap[key] = fallback
        txCountCache.set(key, { value: fallback, at: Date.now() })
      } catch {
        txMap[key] = 0
      }
    }

    await new Promise((r) => setTimeout(r, 220))
  }

  return txMap
}

function tierFromUsd(usd: number): "L1" | "L2" | "L3" | "L4" | "L5" {
  if (usd >= 10_000_000) return "L5"
  if (usd >= 1_000_000) return "L4"
  if (usd >= 100_000) return "L3"
  if (usd >= 10_000) return "L2"
  return "L1"
}

function freqTierFromTx(txCount: number): "F1" | "F2" | "F3" | "F4" | "F5" {
  if (txCount === 0) return "F1"
  if (txCount <= 3) return "F2"
  if (txCount <= 10) return "F3"
  if (txCount <= 19) return "F4"
  return "F5"
}

function freqCycleFromTx(txCount: number): "D" | "W" | "M" | "Y" {
  if (txCount >= 1000) return "D"
  if (txCount >= 100) return "W"
  if (txCount >= 10) return "M"
  return "Y"
}

function reviewFromSignals(txCount: number, balanceEth: number, purity?: string): "A" | "M" {
  if (purity === "P") return "A"
  if (txCount >= 20) return "A"
  if (balanceEth >= 10) return "A"
  return "M"
}

export async function getWalletsFromEtherscan() {
  const addresses = wallets.map((w) => w.address)

  // Call our backend instead of Etherscan
  const backendResults = await analyzeAddresses(addresses)
  
  // Build lookup map
  const backendMap = new Map<string, BackendWallet>()
  for (const r of backendResults) {
    if (r.address) {
      backendMap.set(r.address.toLowerCase(), r)
    }
  }

  // Merge backend data with static wallet data
  return wallets.map((w) => {
    const backend = backendMap.get(w.address.toLowerCase())
    
    if (!backend) {
      return {
        ...w,
        balance: w.balance ?? "0",
        txCount: w.txCount ?? 0,
        ethValueUsd: 0,
        tokenHoldings: 0,
      }
    }

    const balanceEth = Number(backend.balance ?? "0")
    const txCount = backend.tx_count ?? 0
    
    // Estimate USD value (simplified, no real-time price)
    const ethUsd = balanceEth * 2500 // rough ETH price
    const tokenUsd = 0 // TODO: add token value later
    const estUsd = ethUsd + tokenUsd

    const clientTier = tierFromUsd(estUsd)
    const freqTier = freqTierFromTx(txCount)
    const freqCycle = freqCycleFromTx(txCount)
    const review = reviewFromSignals(txCount, balanceEth, w.addressPurity)

    return {
      ...w,
      balance: backend.balance ?? "0",
      txCount,
      ethValueUsd: estUsd,
      tokenHoldings: backend.token_count ?? 0,
      clientTier,
      freqTier,
      freqCycle,
      review,
      // Add backend fields
      wallet_type: backend.wallet_type,
      wallet_tier: backend.wallet_tier,
      risk_score: backend.risk_score,
      tags: backend.tags,
    }
  })
}
