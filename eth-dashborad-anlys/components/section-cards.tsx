"use client"

import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { WalletIcon, ShieldAlertIcon, ZapIcon, CoinsIcon } from "lucide-react"

type Wallet = {
  balance: string
  txCount: number
  addressPurity?: string
  clientType?: string
}

export function SectionCards({ data }: { data: Wallet[] }) {
  const totalWallets   = data.length
  const totalEth       = data.reduce((s, w) => s + parseFloat(w.balance || "0"), 0)
  const toxicCount     = data.filter((w) => w.addressPurity === "P").length
  const activeCount    = data.filter((w) => w.txCount > 0).length
  const toxicPct       = totalWallets ? ((toxicCount / totalWallets) * 100).toFixed(1) : "0"
  const activePct      = totalWallets ? ((activeCount / totalWallets) * 100).toFixed(1) : "0"

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">

      {/* Total Wallets */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Wallets</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalWallets}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <WalletIcon className="size-3" />
              Monitored
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">Addresses under analysis</div>
          <div className="text-muted-foreground">
            {data.filter((w) => w.clientType === "E").length} exchanges ·{" "}
            {data.filter((w) => w.clientType === "S").length} protocols ·{" "}
            {data.filter((w) => w.clientType === "U").length} users
          </div>
        </CardFooter>
      </Card>

      {/* Total ETH Balance */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total ETH Balance</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalEth.toLocaleString("en-US", { maximumFractionDigits: 2 })} ETH
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <CoinsIcon className="size-3" />
              Live
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">Across all monitored wallets</div>
          <div className="text-muted-foreground">
            Avg {totalWallets ? (totalEth / totalWallets).toFixed(2) : "0"} ETH per wallet
          </div>
        </CardFooter>
      </Card>

      {/* Active Wallets */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Active Wallets</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {activeCount}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <ZapIcon className="size-3" />
              {activePct}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">Wallets with outgoing transactions</div>
          <div className="text-muted-foreground">
            {totalWallets - activeCount} wallets with zero activity
          </div>
        </CardFooter>
      </Card>

      {/* Toxic Addresses */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Toxic Addresses</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {toxicCount}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="text-destructive border-destructive/40">
              <ShieldAlertIcon className="size-3" />
              {toxicPct}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">Flagged as toxic purity</div>
          <div className="text-muted-foreground">
            {totalWallets - toxicCount} wallets marked clean
          </div>
        </CardFooter>
      </Card>

    </div>
  )
}
