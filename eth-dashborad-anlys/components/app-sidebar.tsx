"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useFilters, applyFilters, SECTION_FIELD_MAP } from "@/components/filter-context"
import { useLang } from "@/components/lang-context"
import type { Translations } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar"

function EthereumIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 2 6.5 11.2 12 8.4l5.5 2.8L12 2Z" fill="currentColor" />
      <path d="M12 9.6 6.5 12.4 12 15.6l5.5-3.2L12 9.6Z" fill="currentColor" opacity="0.8" />
      <path d="M12 22 6.5 13.6 12 16.8l5.5-3.2L12 22Z" fill="currentColor" opacity="0.65" />
    </svg>
  )
}

function getFilterSections(t: Translations) {
  return [
    {
      id: "data-source",
      title: t.filterDataSource,
      items: [
        { key: "R", label: t.realtime },
        { key: "H", label: t.historical },
      ],
    },
    {
      id: "client-type",
      title: t.filterClientType,
      items: [
        { key: "U",  label: t.realUser },
        { key: "E",  label: t.exchange },
        { key: "S",  label: t.script },
        { key: "AP", label: t.malicious },
        { key: "B",  label: t.bridge },
      ],
    },
    {
      id: "client-tier",
      title: t.filterClientTier,
      items: [
        { key: "L1", label: "<10k" },
        { key: "L2", label: "10k-99.9k" },
        { key: "L3", label: "100k-999.9k" },
        { key: "L4", label: "1M-9.99M" },
        { key: "L5", label: "10M+" },
      ],
    },
    {
      id: "review",
      title: t.filterReview,
      items: [
        { key: "A", label: t.auto },
        { key: "M", label: t.manual },
      ],
    },
    {
      id: "freq-cycle",
      title: t.filterFreqCycle,
      items: [
        { key: "D", label: t.day },
        { key: "W", label: t.week },
        { key: "M", label: t.month },
        { key: "Y", label: t.year },
      ],
    },
    {
      id: "freq-tier",
      title: t.filterFreqTier,
      items: [
        { key: "F1", label: t.tx0 },
        { key: "F2", label: t.tx13 },
        { key: "F3", label: t.tx410 },
        { key: "F4", label: t.tx1119 },
        { key: "F5", label: t.tx20plus },
      ],
    },
    {
      id: "address-purity",
      title: t.filterAddressPurity,
      items: [
        { key: "C", label: t.clean },
        { key: "P", label: t.toxic },
      ],
    },
  ]
}

function FilterGroup({
  sectionId,
  title,
  items,
  data,
  isLoading,
}: {
  sectionId: string
  title: string
  items: { key: string; label: string }[]
  data: Record<string, unknown>[]
  isLoading?: boolean
}) {
  const { activeFilters, toggleFilter } = useFilters()

  function getCount(key: string) {
    const field = SECTION_FIELD_MAP[sectionId]
    if (!field) return 0
    const filtersWithoutSection = new Set(
      [...activeFilters].filter((f) => !f.startsWith(`${sectionId}:`))
    )
    const base = applyFilters(data, filtersWithoutSection)
    return base.filter((row) => row[field] === key).length
  }

  const activeInSection = items.filter((item) =>
    activeFilters.has(`${sectionId}:${item.key}`)
  ).length

  return (
    <SidebarGroup className="py-0">
      <SidebarGroupLabel className="flex items-center gap-1.5 text-[10px] tracking-widest">
        {title}
        {activeInSection > 0 && (
          <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary leading-none">
            {activeInSection}
          </span>
        )}
      </SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const filterId = `${sectionId}:${item.key}`
          const isActive = activeFilters.has(filterId)
          const count = getCount(item.key)

          return (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton
                onClick={() => toggleFilter(filterId)}
                isActive={isActive}
                className="h-7 gap-2.5"
              >
                <span
                  className={cn(
                    "inline-flex h-4 min-w-[1.4rem] items-center justify-center rounded px-1 text-[9px] font-bold leading-none shrink-0 transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "bg-sidebar-accent text-sidebar-foreground/60"
                  )}
                >
                  {item.key}
                </span>
                <span className="flex-1 text-[12px]">{item.label}</span>
                <span
                  className={cn(
                    "ml-auto inline-flex min-w-6 justify-end text-[11px] tabular-nums transition-colors",
                    isActive ? "text-sidebar-primary font-semibold" : "text-sidebar-foreground/30"
                  )}
                >
                  {isLoading ? <Skeleton className="h-3 w-5 rounded-sm" /> : count}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

export function AppSidebar({
  data,
  isLoading,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  data: Record<string, unknown>[]
  isLoading?: boolean
}) {
  const { resetFilters, activeFilters } = useFilters()
  const { t } = useLang()
  const filterSections = getFilterSections(t)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <a href="#">
                <EthereumIcon className="size-5! text-[#627EEA]" />
                <span className="truncate text-base font-semibold">{t.sidebarCompany}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {filterSections.map((section) => (
          <FilterGroup
            key={section.id}
            sectionId={section.id}
            title={section.title}
            items={section.items}
            data={data}
            isLoading={isLoading}
          />
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full h-9 text-sm"
          onClick={resetFilters}
          disabled={activeFilters.size === 0}
        >
          {t.resetAll}
        </Button>
        <Button size="sm" className="w-full h-9 text-sm">
          {t.actions}
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
