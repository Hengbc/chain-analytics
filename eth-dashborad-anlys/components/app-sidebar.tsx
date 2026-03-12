"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useFilters, applyFilters, SECTION_FIELD_MAP } from "@/components/filter-context"
import { Button } from "@/components/ui/button"
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
import { CommandIcon } from "lucide-react"

const FILTER_SECTIONS = [
  {
    id: "data-source",
    title: "DATA SOURCE",
    items: [
      { key: "R", label: "Real-time" },
      { key: "H", label: "Historical" },
    ],
  },
  {
    id: "client-type",
    title: "CLIENT TYPE",
    items: [
      { key: "U",  label: "Real User" },
      { key: "E",  label: "Exchange" },
      { key: "S",  label: "Script" },
      { key: "AP", label: "Malicious" },
      { key: "B",  label: "Bridge" },
    ],
  },
  {
    id: "client-tier",
    title: "CLIENT TIER",
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
    title: "REVIEW",
    items: [
      { key: "A", label: "Auto" },
      { key: "M", label: "Manual" },
    ],
  },
  {
    id: "freq-cycle",
    title: "FREQ CYCLE",
    items: [
      { key: "D", label: "Day" },
      { key: "W", label: "Week" },
      { key: "M", label: "Month" },
      { key: "Y", label: "Year" },
    ],
  },
  {
    id: "freq-tier",
    title: "FREQ TIER",
    items: [
      { key: "F1", label: "0 TX" },
      { key: "F2", label: "1-3 TX" },
      { key: "F3", label: "4-10 TX" },
      { key: "F4", label: "11-19 TX" },
      { key: "F5", label: "20+ TX" },
    ],
  },
  {
    id: "address-purity",
    title: "ADDRESS PURITY",
    items: [
      { key: "C", label: "Clean" },
      { key: "P", label: "Toxic" },
    ],
  },
]

function FilterGroup({
  sectionId,
  title,
  items,
  data,
}: {
  sectionId: string
  title: string
  items: { key: string; label: string }[]
  data: Record<string, unknown>[]
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
                    "ml-auto text-[11px] tabular-nums transition-colors",
                    isActive ? "text-sidebar-primary font-semibold" : "text-sidebar-foreground/30"
                  )}
                >
                  {count}
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
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  data: Record<string, unknown>[]
}) {
  const { resetFilters, activeFilters } = useFilters()

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <a href="#">
                <CommandIcon className="size-5!" />
                <span className="text-base font-semibold">Acme Inc.</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {FILTER_SECTIONS.map((section) => (
          <FilterGroup
            key={section.id}
            sectionId={section.id}
            title={section.title}
            items={section.items}
            data={data}
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
          Reset All
        </Button>
        <Button size="sm" className="w-full h-9 text-sm">
          Actions
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
