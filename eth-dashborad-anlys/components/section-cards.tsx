"use client"

import type { ReactNode } from "react"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CoinsIcon, ShieldAlertIcon, WalletIcon, ZapIcon, type LucideIcon } from "lucide-react"
import { useLang } from "@/components/lang-context"
import { cn } from "@/lib/utils"

type Wallet = {
  balance: string
  txCount: number
  addressPurity?: string
  clientType?: string
}

type SummaryCardProps = {
  title: string
  value: ReactNode
  footerTitle: string
  footerValue: ReactNode
  badgeLabel: ReactNode
  badgeIcon: LucideIcon
  badgeClassName?: string
  isLoading?: boolean
  valueSkeletonClassName?: string
  valueClassName?: string
}

function MetricValueSkeleton({ className = "h-14 w-28" }: { className?: string }) {
  return <Skeleton className={cn("rounded-lg", className)} />
}

function MetricFooterSkeleton() {
  return (
    <div className="w-full space-y-2">
      <Skeleton className="h-4 w-40 rounded-md" />
      <Skeleton className="h-4 w-52 rounded-md" />
    </div>
  )
}

function SummaryCard({
  title,
  value,
  footerTitle,
  footerValue,
  badgeLabel,
  badgeIcon: BadgeIcon,
  badgeClassName,
  isLoading = false,
  valueSkeletonClassName,
  valueClassName,
}: SummaryCardProps) {
  return (
    <Card className="@container/card h-full min-h-[206px] justify-between gap-0 overflow-hidden rounded-2xl border border-border/60 bg-card/95 py-0 shadow-sm">
      <CardHeader className="gap-4 border-b border-border/60 px-5 py-5 [grid-template-columns:minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-3">
          <CardDescription className="text-sm font-medium tracking-tight text-muted-foreground">
            {title}
          </CardDescription>
          <div className="min-h-[78px]">
            {isLoading ? (
              <MetricValueSkeleton className={valueSkeletonClassName} />
            ) : (
              <CardTitle
                className={cn(
                  "text-[clamp(2rem,2vw+1.1rem,3rem)] font-semibold leading-[0.94] tracking-[-0.04em] text-foreground",
                  valueClassName
                )}
              >
                {value}
              </CardTitle>
            )}
          </div>
        </div>

        <CardAction className="self-start">
          <Badge
            variant="outline"
            className={cn(
              "h-7 rounded-full border-border/70 bg-background/60 px-2.5 text-xs font-semibold text-foreground shadow-none",
              badgeClassName
            )}
          >
            <BadgeIcon className="size-3" />
            {isLoading ? <Skeleton className="h-3 w-10 rounded-sm" /> : badgeLabel}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardFooter className="min-h-[88px] flex-col items-start justify-center gap-1.5 bg-muted/20 px-5 py-4 text-sm">
        {isLoading ? (
          <MetricFooterSkeleton />
        ) : (
          <>
            <div className="font-medium text-foreground">{footerTitle}</div>
            <div className="text-sm leading-relaxed text-muted-foreground">{footerValue}</div>
          </>
        )}
      </CardFooter>
    </Card>
  )
}

export function SectionCards({
  data,
  isLoading = false,
}: {
  data: Wallet[]
  isLoading?: boolean
}) {
  const { t } = useLang()

  const totalWallets = data.length
  const totalEth = data.reduce((sum, wallet) => sum + parseFloat(wallet.balance || "0"), 0)
  const toxicCount = data.filter((wallet) => wallet.addressPurity === "P").length
  const activeCount = data.filter((wallet) => wallet.txCount > 0).length
  const toxicPct = totalWallets ? ((toxicCount / totalWallets) * 100).toFixed(1) : "0"
  const activePct = totalWallets ? ((activeCount / totalWallets) * 100).toFixed(1) : "0"
  const exchangeCount = data.filter((wallet) => wallet.clientType === "E").length
  const protocolCount = data.filter((wallet) => wallet.clientType === "S").length
  const userCount = data.filter((wallet) => wallet.clientType === "U").length
  const formattedTotalEth = totalEth.toLocaleString("en-US", { maximumFractionDigits: 2 })
  const averageEth = totalWallets
    ? (totalEth / totalWallets).toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "0"

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <SummaryCard
        title={t.totalWallets}
        value={totalWallets}
        footerTitle={t.addressesUnderAnalysis}
        footerValue={`${exchangeCount} ${t.exchanges} / ${protocolCount} ${t.protocols} / ${userCount} ${t.users}`}
        badgeLabel={t.monitored}
        badgeIcon={WalletIcon}
        isLoading={isLoading}
        valueSkeletonClassName="h-14 w-20"
      />

      <SummaryCard
        title={t.totalEthBalance}
        value={
          <div className="flex min-h-[78px] flex-col justify-end">
            <span className="whitespace-nowrap">{formattedTotalEth}</span>
            <span className="mt-2 text-lg font-medium tracking-[0.16em] text-foreground/90">ETH</span>
          </div>
        }
        footerTitle={t.acrossAllWallets}
        footerValue={`${t.avg} ${averageEth} ${t.avgEthPerWallet}`}
        badgeLabel={t.live}
        badgeIcon={CoinsIcon}
        isLoading={isLoading}
        valueSkeletonClassName="h-16 w-40"
        valueClassName="text-[clamp(1.7rem,1vw+1rem,2.45rem)] leading-[0.92] tracking-[-0.06em]"
      />

      <SummaryCard
        title={t.activeWallets}
        value={activeCount}
        footerTitle={t.walletsWithOutgoing}
        footerValue={`${totalWallets - activeCount} ${t.walletsZeroActivity}`}
        badgeLabel={`${activePct}%`}
        badgeIcon={ZapIcon}
        isLoading={isLoading}
        valueSkeletonClassName="h-14 w-20"
      />

      <SummaryCard
        title={t.toxicAddresses}
        value={toxicCount}
        footerTitle={t.flaggedToxic}
        footerValue={`${totalWallets - toxicCount} ${t.walletsClean}`}
        badgeLabel={`${toxicPct}%`}
        badgeIcon={ShieldAlertIcon}
        badgeClassName="border-destructive/45 text-destructive"
        isLoading={isLoading}
        valueSkeletonClassName="h-14 w-20"
      />
    </div>
  )
}
