import { NextRequest, NextResponse } from "next/server"
import { getWalletActivity } from "@/lib/backend"

function toUnixSeconds(value?: string) {
  if (!value) return `${Math.floor(Date.now() / 1000)}`
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? `${Math.floor(Date.now() / 1000)}` : `${Math.floor(ms / 1000)}`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params
  const activity = await getWalletActivity(address, 25)

  if (!activity) {
    return NextResponse.json({
      source: "node-indexer",
      chain: "eth",
      ethPrice: "0.00",
      txCount: 0,
      tokenTransferTotal: 0,
      lastIndexedBlock: 0,
      indexerStatus: "unavailable",
      transactions: [],
      tokenTransfers: [],
    })
  }

  return NextResponse.json({
    source: activity.source,
    chain: activity.chain,
    ethPrice: Number(activity.eth_price ?? 0).toFixed(2),
    txCount: activity.tx_count ?? 0,
    tokenTransferTotal: activity.token_transfer_total ?? 0,
    lastIndexedBlock: activity.last_indexed_block ?? 0,
    indexerStatus: activity.indexer_status ?? "unknown",
    transactions: activity.transactions.map((tx) => ({
      hash: tx.tx_hash,
      from: tx.from_address,
      to: tx.to_address,
      value: tx.value,
      gasPrice: tx.gas_price ?? "0",
      gasUsed: tx.gas_used ?? "0",
      status: String(tx.status ?? 0),
      blockNumber: String(tx.block_number ?? 0),
      timeStamp: toUnixSeconds(tx.timestamp),
      methodId: tx.method_id ?? "",
    })),
    tokenTransfers: activity.token_transfers.map((tx) => ({
      hash: tx.tx_hash,
      tokenAddress: tx.token_address,
      tokenSymbol: tx.token_symbol ?? "TOKEN",
      tokenDecimal: String(tx.token_decimals ?? 0),
      from: tx.from_address,
      to: tx.to_address,
      value: tx.value,
      blockNumber: String(tx.block_number ?? 0),
      timeStamp: toUnixSeconds(tx.timestamp),
    })),
  })
}
