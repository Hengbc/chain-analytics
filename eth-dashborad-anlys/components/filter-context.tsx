"use client"

import * as React from "react"

interface FilterContextValue {
  activeFilters: Set<string>
  toggleFilter: (id: string) => void
  resetFilters: () => void
}

const FilterContext = React.createContext<FilterContextValue | null>(null)

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [activeFilters, setActiveFilters] = React.useState<Set<string>>(new Set())

  const toggleFilter = React.useCallback((id: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const resetFilters = React.useCallback(() => {
    setActiveFilters(new Set())
  }, [])

  return (
    <FilterContext.Provider value={{ activeFilters, toggleFilter, resetFilters }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters() {
  const ctx = React.useContext(FilterContext)
  if (!ctx) throw new Error("useFilters must be used within FilterProvider")
  return ctx
}

// ─── Filter logic ─────────────────────────────────────────────────────────────
// Maps section id → the field name on the data row
export const SECTION_FIELD_MAP: Record<string, string> = {
  "data-source": "dataSource",
  "client-type": "clientType",
  "client-tier": "clientTier",
  "review": "review",
  "freq-cycle": "freqCycle",
  "freq-tier": "freqTier",
  "address-purity": "addressPurity",
}

/** Apply active filters to a dataset. AND between sections, OR within a section. */
export function applyFilters<T extends Record<string, unknown>>(
  data: T[],
  activeFilters: Set<string>
): T[] {
  if (activeFilters.size === 0) return data

  // Group by section
  const bySection = new Map<string, Set<string>>()
  for (const filterId of activeFilters) {
    const [sectionId, key] = filterId.split(":")
    if (!bySection.has(sectionId)) bySection.set(sectionId, new Set())
    bySection.get(sectionId)!.add(key)
  }

  return data.filter((row) => {
    for (const [sectionId, keys] of bySection) {
      const field = SECTION_FIELD_MAP[sectionId]
      if (!field) continue
      const value = row[field] as string
      if (!keys.has(value)) return false
    }
    return true
  })
}
