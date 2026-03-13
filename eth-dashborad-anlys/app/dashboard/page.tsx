import { DashboardShell } from "@/components/dashboard-shell"
import { FilterProvider } from "@/components/filter-context"
import { SidebarProvider } from "@/components/ui/sidebar"
import fallbackWallets from "@/app/dashboard/data.json"

export default function Page() {
  return (
    <FilterProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "17rem",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <DashboardShell initialData={fallbackWallets} />
      </SidebarProvider>
    </FilterProvider>
  )
}
