import { DashboardShell } from "@/components/dashboard-shell"
import { FilterProvider } from "@/components/filter-context"
import { SidebarProvider } from "@/components/ui/sidebar"
import { loadDashboardWallets } from "@/lib/dashboard-data"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function Page() {
  const { wallets, source, error } = await loadDashboardWallets()

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
        <DashboardShell initialData={wallets} initialDataSource={source} initialError={error} />
      </SidebarProvider>
    </FilterProvider>
  )
}
