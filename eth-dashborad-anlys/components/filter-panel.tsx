"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useFilters, applyFilters, SECTION_FIELD_MAP } from "@/components/filter-context"

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilterItem {
  key: string
  label: string
}

interface FilterSection {
  id: string
  title: string
  items: FilterItem[]
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SECTIONS: FilterSection[] = [
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
      { key: "U", label: "Real User" },
      { key: "E", label: "Exchange" },
      { key: "S", label: "Script" },
      { key: "AP", label: "Malicious" },
      { key: "B", label: "Bridge" },
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

// ─── Collapsible Section ──────────────────────────────────────────────────────

function CollapsibleSection({
  section,
  activeFilters,
  onToggle,
  getCounts,
}: {
  section: FilterSection
  activeFilters: Set<string>
  onToggle: (id: string) => void
  getCounts: (sectionId: string, key: string) => number
}) {
  const [open, setOpen] = React.useState(true)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [height, setHeight] = React.useState<number | "auto">("auto")

  React.useEffect(() => {
    const el = contentRef.current
    if (!el) return
    if (open) {
      const natural = el.scrollHeight
      setHeight(natural)
      const t = setTimeout(() => setHeight("auto"), 250)
      return () => clearTimeout(t)
    } else {
      setHeight(el.scrollHeight)
      const t = setTimeout(() => setHeight(0), 10)
      return () => clearTimeout(t)
    }
  }, [open])

  const activeCount = section.items.filter((item) =>
    activeFilters.has(`${section.id}:${item.key}`)
  ).length

  return (
    <div className="border-b border-border/20 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-accent/30"
      >
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase">
            {section.title}
          </span>
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary leading-none">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 text-muted-foreground/40 shrink-0 transition-transform duration-200",
            !open && "-rotate-90"
          )}
        />
      </button>

      <div
        ref={contentRef}
        style={{
          height: height === "auto" ? "auto" : `${height}px`,
          overflow: "hidden",
          transition: "height 220ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="pb-1.5">
          {section.items.map((item) => {
            const itemId = `${section.id}:${item.key}`
            const isActive = activeFilters.has(itemId)
            const count = getCounts(section.id, item.key)

            return (
              <button
                key={item.key}
                onClick={() => onToggle(itemId)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-1.75 text-left transition-all duration-150 hover:bg-accent/40",
                  isActive && "bg-accent/50"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-5 min-w-[1.6rem] items-center justify-center rounded px-1.5 text-[10px] font-bold leading-none tracking-tight shrink-0 transition-all duration-150",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {item.key}
                </span>

                <span
                  className={cn(
                    "flex-1 text-[13px] transition-colors duration-150",
                    isActive ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>

                <span
                  className={cn(
                    "text-[12px] tabular-nums shrink-0 transition-colors duration-150",
                    isActive ? "text-primary font-semibold" : "text-muted-foreground/40"
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────

export function FilterPanel({
  className,
  data,
}: {
  className?: string
  data: Record<string, unknown>[]
}) {
  const { activeFilters, toggleFilter, resetFilters } = useFilters()

  // Compute counts: how many rows in the *currently filtered* dataset match each key
  // (exclude the current section's own filter so selections within a section update live)
  function getCounts(sectionId: string, key: string): number {
    const field = SECTION_FIELD_MAP[sectionId]
    if (!field) return 0

    // Apply all filters EXCEPT from this section, then count matches
    const filtersWithoutSection = new Set(
      [...activeFilters].filter((f) => !f.startsWith(`${sectionId}:`))
    )
    const baseData = applyFilters(data, filtersWithoutSection)
    return baseData.filter((row) => row[field] === key).length
  }

  return (
    <div className={cn("flex h-full flex-col bg-sidebar text-sidebar-foreground", className)}>
      <div className="flex-1 overflow-y-auto">
        {SECTIONS.map((section) => (
          <CollapsibleSection
            key={section.id}
            section={section}
            activeFilters={activeFilters}
            onToggle={toggleFilter}
            getCounts={getCounts}
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-border/20 p-4 space-y-2.5">
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
      </div>
    </div>
  )
}
