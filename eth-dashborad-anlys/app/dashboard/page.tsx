import { AppSidebar } from "@/components/app-sidebar"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { DataTable } from "@/components/data-table"
import { FilterProvider } from "@/components/filter-context"
import { SectionCards } from "@/components/section-cards"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getWalletsFromEtherscan } from "@/lib/etherscan"

export default async function Page() {
  const data = await getWalletsFromEtherscan()
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
        <AppSidebar variant="inset" data={data as Record<string, unknown>[]} />

        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                <SectionCards data={data} />
                {/* <div className="px-4 lg:px-6">
                  <ChartAreaInteractive data={data} />
                </div> */}
                <DataTable data={data} />
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </FilterProvider>
  )
}
