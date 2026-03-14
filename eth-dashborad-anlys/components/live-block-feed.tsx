"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RadioIcon } from "lucide-react"

type LiveTx = {
  hash: string
  from: string
  to: string
  value: string
  methodId: string
}

type LiveBlock = {
  blockNumber: number
  blockHash: string
  timestamp: number
  txCount: number
  gasUsed: number
  baseFee: number
  transactions: LiveTx[]
}

function short(addr: string) {
  if (!addr) return "—"
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function fmtEth(wei: string) {
  const val = Number(wei) / 1e18
  if (val === 0) return "0 ETH"
  if (val < 0.0001) return "<0.0001 ETH"
  return `${val.toFixed(4)} ETH`
}

function timeAgo(ts: number) {
  const sec = Math.floor(Date.now() / 1000) - ts
  if (sec < 5) return "just now"
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  return `${Math.floor(sec / 3600)}h ago`
}

export function LiveBlockFeed() {
  const [blocks, setBlocks] = React.useState<LiveBlock[]>([])
  const [status, setStatus] = React.useState<"connecting" | "live" | "error">("connecting")
  const [, forceRender] = React.useState(0)

  // Re-render every 5s to update "X ago" timestamps
  React.useEffect(() => {
    const id = setInterval(() => forceRender((n) => n + 1), 5000)
    return () => clearInterval(id)
  }, [])

  React.useEffect(() => {
    const es = new EventSource("/api/stream/blocks?chain=eth")

    es.onopen = () => setStatus("live")

    es.onmessage = (e) => {
      try {
        const block: LiveBlock = JSON.parse(e.data)
        if (block.blockNumber) {
          setBlocks((prev) => [block, ...prev].slice(0, 20))
        }
      } catch {
        // ignore malformed frames
      }
    }

    es.onerror = () => {
      setStatus("error")
      es.close()
    }

    return () => es.close()
  }, [])

  return (
    <Card className="mx-4 lg:mx-6">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <RadioIcon className={`h-4 w-4 ${status === "live" ? "text-green-500" : "text-muted-foreground"}`} />
        <CardTitle className="text-sm font-medium">Live Block Feed</CardTitle>
        <Badge
          variant="outline"
          className={
            status === "live"
              ? "ml-auto border-green-500/40 text-green-500 text-xs"
              : status === "error"
              ? "ml-auto border-red-500/40 text-red-500 text-xs"
              : "ml-auto text-xs"
          }
        >
          {status === "live" ? "● LIVE" : status === "error" ? "disconnected" : "connecting…"}
        </Badge>
      </CardHeader>

      <CardContent className="p-0">
        {blocks.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {status === "error" ? "Could not connect to backend stream." : "Waiting for new blocks…"}
          </p>
        ) : (
          <div className="flex flex-col divide-y">
            {blocks.map((block) => (
              <div key={block.blockNumber} className="px-4 py-3 flex flex-col gap-1.5">
                {/* Block header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">
                      #{block.blockNumber.toLocaleString()}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {block.txCount} txs
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{timeAgo(block.timestamp)}</span>
                </div>

                {/* Top 5 transactions */}
                {block.transactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.hash}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-muted-foreground shrink-0">{short(tx.from)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono text-muted-foreground shrink-0">{short(tx.to)}</span>
                      {tx.methodId && tx.methodId !== "0x" && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono shrink-0">
                          {tx.methodId.slice(0, 6)}
                        </Badge>
                      )}
                    </div>
                    <span className="font-mono tabular-nums shrink-0 text-foreground">
                      {fmtEth(tx.value)}
                    </span>
                  </div>
                ))}

                {block.txCount > 5 && (
                  <span className="text-xs text-muted-foreground pl-1">
                    +{block.txCount - 5} more transactions
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
