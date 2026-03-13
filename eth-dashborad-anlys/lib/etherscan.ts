import wallets from "@/app/dashboard/data.json"
import { analyzeAddresses, type BackendWallet } from "./backend"

const ETHERSCAN = "https://api.etherscan.io/v2/api"
const CHAIN_ID = "1"
const CACHE_TTL_MS = 10 * 60 * 1000

type CacheEntry<T> = { value: T; at: number }
type TxCounts = { normal: number; internal: number; token: number }
const txCountCache = new Map<string, CacheEntry<TxCounts>>()
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


async function fetchTxCounts(addresses: string[], apiKey: string) {
  const txMap: Record<string, TxCounts> = {}
  const now = Date.now()

  async function countEndpoint(action: string, addr: string): Promise<number> {
    const url = buildUrl({
      chainid: CHAIN_ID,
      module: "account",
      action,
      address: addr,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: "10000",
      sort: "desc",
      apikey: apiKey,
    })
    try {
      const res = await fetch(url, { cache: "no-store" })
      const json = await res.json()
      return Array.isArray(json?.result) ? json.result.length : 0
    } catch {
      return 0
    }
  }

  for (const addr of addresses) {
    const key = addr.toLowerCase()
    const cached = txCountCache.get(key)
    if (cached && now - cached.at < CACHE_TTL_MS) {
      txMap[key] = cached.value
      continue
    }

    // Fetch all 3 endpoint types in parallel for this address
    const [normal, internal, token] = await Promise.all([
      countEndpoint("txlist", key),
      countEndpoint("txlistinternal", key),
      countEndpoint("tokentx", key),
    ])

    const counts: TxCounts = { normal, internal, token }
    txMap[key] = counts
    txCountCache.set(key, { value: counts, at: Date.now() })

    await new Promise((r) => setTimeout(r, 300))
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

// ── Etherscan path ──────────────────────────────────────────────────────────
async function getWalletsViaEtherscan() {
  const apiKey = process.env.ETHERSCAN_API_KEY || ""
  const addresses = wallets.map((w) => w.address)

  // Step 1: balance + price first — both are single fast Etherscan calls
  const [ethPrice, balanceMap] = await Promise.all([
    fetchEthPrice(apiKey),
    fetchBalances(addresses, apiKey),
  ])

  // Step 2: tx counts (Etherscan) + portfolio (Ethplorer) — different services, safe to parallel
  const [txMap, { usdMap, holdingsMap }] = await Promise.all([
    fetchTxCounts(addresses, apiKey),
    fetchPortfolioUsd(addresses),
  ])

  return wallets.map((w) => {
    const addr = w.address.toLowerCase()
    const balanceEth = parseFloat(balanceMap[addr] ?? w.balance ?? "0")
    const counts = txMap[addr] ?? { normal: 0, internal: 0, token: 0 }
    const txCount = counts.normal + counts.internal + counts.token
    const tokenUsd = usdMap[addr] ?? 0
    const holdingCount = holdingsMap[addr] ?? 0
    const estUsd = balanceEth * ethPrice + tokenUsd

    return {
      ...w,
      balance: balanceEth.toString(),
      txCount,
      normalTxCount: counts.normal,
      internalTxCount: counts.internal,
      tokenTxCount: counts.token,
      ethValueUsd: estUsd,
      tokenValueUsd: tokenUsd,
      tokenHoldings: holdingCount,
      clientTier: tierFromUsd(estUsd),
      freqTier: freqTierFromTx(txCount),
      freqCycle: freqCycleFromTx(txCount),
      review: reviewFromSignals(txCount, balanceEth, w.addressPurity),
    }
  })
}

// ── Backend path ─────────────────────────────────────────────────────────────
async function getWalletsViaBackend() {
  const addresses = wallets.map((w) => w.address)
  const backendResults = await analyzeAddresses(addresses)

  const backendMap = new Map<string, BackendWallet>()
  for (const r of backendResults) {
    if (r.address) backendMap.set(r.address.toLowerCase(), r)
  }

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
    const estUsd = balanceEth * 2500

    return {
      ...w,
      balance: backend.balance ?? "0",
      txCount,
      ethValueUsd: estUsd,
      tokenHoldings: backend.token_count ?? 0,
      clientTier: tierFromUsd(estUsd),
      freqTier: freqTierFromTx(txCount),
      freqCycle: freqCycleFromTx(txCount),
      review: reviewFromSignals(txCount, balanceEth, w.addressPurity),
      wallet_type: backend.wallet_type,
      wallet_tier: backend.wallet_tier,
      risk_score: backend.risk_score,
      tags: backend.tags,
    }
  })
}

// ── Entry point — switch via DATA_SOURCE env var ──────────────────────────────
// DATA_SOURCE=etherscan  → Etherscan + Ethplorer APIs (needs ETHERSCAN_API_KEY)
// DATA_SOURCE=backend    → your own FastAPI at BACKEND_URL (default)
export async function getWalletsFromEtherscan() {
  const source = process.env.DATA_SOURCE ?? "backend"
  return source === "etherscan" ? getWalletsViaEtherscan() : getWalletsViaBackend()
}
