"use client"

import * as React from "react"
import { z } from "zod"
import { AppSidebar } from "@/components/app-sidebar"
import { DataTable } from "@/components/data-table"
import { SectionCards } from "@/components/section-cards"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset } from "@/components/ui/sidebar"
import { schema } from "@/lib/wallet-schema"
import type { DashboardDataSource } from "@/lib/dashboard-data"

type WalletRow = z.infer<typeof schema>
type WalletUpdate = React.SetStateAction<WalletRow[]>
type WalletOverrideKey = "clientType" | "clientTier" | "review" | "freqCycle" | "freqTier" | "updatedAt"

const OVERRIDE_FIELDS: WalletOverrideKey[] = [
  "clientType",
  "clientTier",
  "review",
  "freqCycle",
  "freqTier",
  "updatedAt",
]

function mergeIncomingWallets(
  currentWallets: WalletRow[],
  incomingWallets: WalletRow[],
  overrides: Record<number, Partial<WalletRow>>
) {
  const incomingById = new Map(incomingWallets.map((wallet) => [wallet.id, wallet]))

  const merged = currentWallets.map((wallet) => {
    const nextWallet = incomingById.get(wallet.id)
    if (!nextWallet) return wallet

    const localOverride = overrides[wallet.id]
    return localOverride ? { ...nextWallet, ...localOverride } : nextWallet
  })

  for (const wallet of incomingWallets) {
    if (!currentWallets.some((current) => current.id === wallet.id)) {
      merged.push(wallet)
    }
  }

  return merged
}

export function DashboardShell({
  initialData,
  initialDataSource = "unavailable",
  initialError,
}: {
  initialData: WalletRow[]
  initialDataSource?: DashboardDataSource
  initialError?: string
}) {
  const [wallets, setWallets] = React.useState(initialData)
  const [isSummaryLoading, setIsSummaryLoading] = React.useState(initialDataSource !== "backend")
  const [errorMessage, setErrorMessage] = React.useState<string | null>(initialError ?? null)
  const overridesRef = React.useRef<Record<number, Partial<WalletRow>>>({})

  const handleDataChange = React.useCallback((value: WalletUpdate) => {
    setWallets((prev) => {
      const next = typeof value === "function" ? value(prev) : value
      const prevById = new Map(prev.map((wallet) => [wallet.id, wallet]))
      const nextOverrides = { ...overridesRef.current }

      for (const wallet of next) {
        const previousWallet = prevById.get(wallet.id)
        if (!previousWallet) continue

        const patch: Partial<WalletRow> = {}
        for (const field of OVERRIDE_FIELDS) {
          if (wallet[field] !== previousWallet[field]) {
            patch[field] = wallet[field]
          }
        }

        if (Object.keys(patch).length > 0) {
          nextOverrides[wallet.id] = {
            ...nextOverrides[wallet.id],
            ...patch,
          }
        }
      }

      overridesRef.current = nextOverrides
      return next
    })
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()

    async function syncWallets() {
      try {
        const response = await fetch("/api/dashboard", {
          cache: "no-store",
          signal: controller.signal,
        })

        if (!response.ok) {
          let message = "Could not load dashboard data from the backend."
          try {
            const errorBody = (await response.json()) as { error?: string }
            if (errorBody?.error) {
              message = errorBody.error
            }
          } catch {
            // ignore parse failures
          }
          setErrorMessage(message)
          return
        }

        const incomingWallets = (await response.json()) as WalletRow[]
        setErrorMessage(null)

        React.startTransition(() => {
          setWallets((currentWallets) =>
            mergeIncomingWallets(currentWallets, incomingWallets, overridesRef.current)
          )
        })
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Dashboard refresh failed:", error)
          setErrorMessage("Could not load dashboard data from the backend.")
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSummaryLoading(false)
        }
      }
    }

    syncWallets()

    return () => controller.abort()
  }, [])

  return (
    <>
      <AppSidebar
        variant="inset"
        data={wallets as unknown as Record<string, unknown>[]}
        isLoading={isSummaryLoading}
      />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              {errorMessage ? (
                <div className="mx-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive lg:mx-6">
                  {errorMessage}
                </div>
              ) : null}
              <SectionCards data={wallets} isLoading={isSummaryLoading} />
              <DataTable data={wallets} onDataChange={handleDataChange} isLoading={isSummaryLoading} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </>
  )
}
