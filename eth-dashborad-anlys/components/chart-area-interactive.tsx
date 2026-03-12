"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

type Wallet = {
  balance: string
  txCount: number
  clientType?: string
  createdAt?: string
}

const TYPE_LABELS: Record<string, string> = {
  E: "Exchange", S: "Protocol", U: "Real User", AP: "Malicious", B: "Bridge",
}

const chartConfig = {
  E:  { label: "Exchange",  color: "var(--chart-1)" },
  S:  { label: "Protocol",  color: "var(--chart-2)" },
  U:  { label: "Real User", color: "var(--chart-3)" },
  AP: { label: "Malicious", color: "var(--destructive)" },
  B:  { label: "Bridge",    color: "var(--chart-5)" },
} satisfies ChartConfig

function buildChartData(data: Wallet[]) {
  // Collect all year-month strings from createdAt, fill in gaps
  const points = new Map<string, Record<string, number>>()

  for (const w of data) {
    const ym = (w.createdAt ?? "").slice(0, 7) // "YYYY-MM"
    if (!ym) continue
    if (!points.has(ym)) points.set(ym, { E: 0, S: 0, U: 0, AP: 0, B: 0 })
    const type = w.clientType ?? "U"
    if (type in (points.get(ym)!)) {
      points.get(ym)![type] += parseFloat(w.balance || "0")
    }
  }

  // Sort by date
  return Array.from(points.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }))
}

export function ChartAreaInteractive({ data }: { data: Wallet[] }) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("all")

  React.useEffect(() => {
    if (isMobile) setTimeRange("3y")
  }, [isMobile])

  const allPoints = buildChartData(data)

  const filteredData = allPoints.filter((item) => {
    if (timeRange === "all") return true
    const date = new Date(item.date + "-01")
    const now   = new Date()
    const years = timeRange === "5y" ? 5 : 3
    const cutoff = new Date(now.getFullYear() - years, now.getMonth(), 1)
    return date >= cutoff
  })

  const typeKeys = ["E", "S", "U", "AP", "B"] as const
  const activeTypes = typeKeys.filter((t) => data.some((w) => w.clientType === t))

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>ETH Balance by Client Type</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Cumulative ETH balance — wallet creation timeline
          </span>
          <span className="@[540px]/card:hidden">ETH by type over time</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(v) => v && setTimeRange(v)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            <ToggleGroupItem value="all">All time</ToggleGroupItem>
            <ToggleGroupItem value="5y">Last 5 years</ToggleGroupItem>
            <ToggleGroupItem value="3y">Last 3 years</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="All time" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="rounded-lg">All time</SelectItem>
              <SelectItem value="5y" className="rounded-lg">Last 5 years</SelectItem>
              <SelectItem value="3y" className="rounded-lg">Last 3 years</SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-62.5 w-full">
          <AreaChart data={filteredData}>
            <defs>
              {activeTypes.map((t) => (
                <linearGradient key={t} id={`fill-${t}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={`var(--color-${t})`} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={`var(--color-${t})`} stopOpacity={0.1} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={40}
              tickFormatter={(v) => {
                const [year, month] = v.split("-")
                return new Date(+year, +month - 1).toLocaleDateString("en-US", {
                  month: "short", year: "numeric",
                })
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={55}
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)
              }
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    const [year, month] = value.split("-")
                    return new Date(+year, +month - 1).toLocaleDateString("en-US", {
                      month: "long", year: "numeric",
                    })
                  }}
                  formatter={(value, name) => [
                    `${Number(value).toFixed(2)} ETH`,
                    TYPE_LABELS[name as string] ?? name,
                  ]}
                  indicator="dot"
                />
              }
            />
            {activeTypes.map((t) => (
              <Area
                key={t}
                dataKey={t}
                type="natural"
                fill={`url(#fill-${t})`}
                stroke={`var(--color-${t})`}
                stackId="a"
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
