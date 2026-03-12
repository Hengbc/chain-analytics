import { NextRequest, NextResponse } from "next/server"

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api"
const CHAIN_ID = "1"

async function ethCall(params: Record<string, string>) {
  try {
    const url = new URL(ETHERSCAN_V2)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const res = await fetch(url.toString(), { cache: "no-store" })
    return await res.json()
  } catch {
    return { status: "0", result: [] }
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function countAllTokenTransfers(address: string, apiKey: string) {
  const offset = 1000
  let page = 1
  let total = 0

  while (true) {
    const json = await ethCall({
      chainid: CHAIN_ID,
      module: "account",
      action: "tokentx",
      address,
      startblock: "0",
      endblock: "99999999",
      page: String(page),
      offset: String(offset),
      sort: "desc",
      apikey: apiKey,
    })

    const rows = Array.isArray(json?.result) ? json.result : []
    if (!rows.length) break

    total += rows.length
    if (rows.length < offset) break

    page += 1
    await delay(220)
  }

  return total
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const apiKey = process.env.ETHERSCAN_API_KEY ?? ""
  const { address } = await params

  if (!apiKey) {
    return NextResponse.json({ error: "Missing ETHERSCAN_API_KEY" }, { status: 500 })
  }

  // 1) ETH price
  const priceJson = await ethCall({
    chainid: CHAIN_ID,
    module: "stats",
    action: "ethprice",
    apikey: apiKey,
  })
  await delay(220)

  // 2) Normal transactions
  const txJson = await ethCall({
    chainid: CHAIN_ID,
    module: "account",
    action: "txlist",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "25",
    sort: "desc",
    apikey: apiKey,
  })
  await delay(220)

  // 3) ERC-20 token transfers
  const tokenJson = await ethCall({
    chainid: CHAIN_ID,
    module: "account",
    action: "tokentx",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "25",
    sort: "desc",
    apikey: apiKey,
  })
  await delay(220)

  // 4) Nonce (outgoing tx count)
  const nonceJson = await ethCall({
    chainid: CHAIN_ID,
    module: "proxy",
    action: "eth_getTransactionCount",
    address,
    tag: "latest",
    apikey: apiKey,
  })

  const ethPrice = Number(priceJson?.result?.ethusd ?? 0)
  const rawNonce = nonceJson?.result ? parseInt(nonceJson.result as string, 16) : 0
  const txCount = Number.isNaN(rawNonce) ? 0 : rawNonce

  const tokenTransfers = Array.isArray(tokenJson?.result) ? tokenJson.result : []
  const tokenTransferTotal = await countAllTokenTransfers(address, apiKey)

  return NextResponse.json({
    ethPrice: ethPrice.toFixed(2),
    txCount,
    tokenTransferTotal,
    transactions: Array.isArray(txJson?.result) ? txJson.result : [],
    tokenTransfers,
  })
}
