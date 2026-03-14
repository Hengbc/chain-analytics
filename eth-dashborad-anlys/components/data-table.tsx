"use client"

import * as React from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import { z } from "zod"
import { schema } from "@/lib/wallet-schema"

import { useIsMobile } from "@/hooks/use-mobile"
import { useFilters, applyFilters } from "@/components/filter-context"
import { useLang } from "@/components/lang-context"
import type { Translations } from "@/lib/i18n"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { GripVerticalIcon, EllipsisVerticalIcon, Columns3Icon, ChevronDownIcon, DownloadIcon, ChevronsLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsRightIcon, ExternalLinkIcon, SearchIcon } from "lucide-react"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"


function truncateAddr(addr: string | null) {
  if (!addr) return "—"
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function downloadCSV(rows: z.infer<typeof schema>[]) {
  const headers: (keyof z.infer<typeof schema>)[] = [
    "id","address","balance","txCount","fundedBy","createdAt",
    "dataSource","clientType","clientTier","review","freqCycle","freqTier","addressPurity",
  ]
  const esc = (v: unknown) => {
    const s = String(v ?? "")
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `wallets-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function DragHandle({ id, label }: { id: number; label: string }) {
  const { attributes, listeners } = useSortable({ id })
  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:bg-transparent"
    >
      <GripVerticalIcon className="size-3 text-muted-foreground" />
      <span className="sr-only">{label}</span>
    </Button>
  )
}

function getColumns(t: Translations): ColumnDef<z.infer<typeof schema>>[] {
  return [
    {
      id: "drag",
      header: () => null,
      cell: ({ row }) => <DragHandle id={row.original.id} label={t.dragToReorder} />,
    },
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label={t.selectAll}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={t.selectRow}
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "address",
      header: t.colAddress,
      cell: ({ row }) => <TableCellViewer item={row.original} t={t} />,
      enableHiding: false,
    },
    {
      accessorKey: "clientType",
      header: t.colType,
      cell: ({ row, table }) => {
        const current = row.original.clientType ?? "U"
        return (
          <Select
            value={current}
            onValueChange={(value) => {
              ;(table.options.meta as { updateClientType?: (id: number, value: string) => void } | undefined)
                ?.updateClientType?.(row.original.id, value)
            }}
          >
            <SelectTrigger size="sm" className="h-7 min-w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="U">{t.realUser}</SelectItem>
              <SelectItem value="E">{t.exchange}</SelectItem>
              <SelectItem value="S">{t.script}</SelectItem>
              <SelectItem value="AP">{t.malicious}</SelectItem>
              <SelectItem value="B">{t.bridge}</SelectItem>
            </SelectContent>
          </Select>
        )
      },
    },
    {
      accessorKey: "clientTier",
      header: t.colTier,
      cell: ({ row, table }) => {
        const current = row.original.clientTier ?? "L1"
        return (
          <Select
            value={current}
            onValueChange={(value) => {
              ;(table.options.meta as { updateClientTier?: (id: number, value: string) => void } | undefined)
                ?.updateClientTier?.(row.original.id, value)
            }}
          >
            <SelectTrigger size="sm" className="h-7 min-w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="L1">L1 · &lt;10k</SelectItem>
              <SelectItem value="L2">L2 · 10k-99.9k</SelectItem>
              <SelectItem value="L3">L3 · 100k-999.9k</SelectItem>
              <SelectItem value="L4">L4 · 1M-9.99M</SelectItem>
              <SelectItem value="L5">L5 · 10M+</SelectItem>
            </SelectContent>
          </Select>
        )
      },
    },
    {
      accessorKey: "review",
      header: t.colReview,
      cell: ({ row, table }) => {
        const current = row.original.review ?? "A"
        return (
          <Select
            value={current}
            onValueChange={(value) => {
              ;(table.options.meta as { updateReview?: (id: number, value: string) => void } | undefined)
                ?.updateReview?.(row.original.id, value)
            }}
          >
            <SelectTrigger size="sm" className="h-7 min-w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">{t.auto}</SelectItem>
              <SelectItem value="M">{t.manual}</SelectItem>
            </SelectContent>
          </Select>
        )
      },
    },
    {
      accessorKey: "freqCycle",
      header: t.colFreqCycle,
      cell: ({ row, table }) => {
        const current = row.original.freqCycle ?? "D"
        return (
          <Select
            value={current}
            onValueChange={(value) => {
              ;(table.options.meta as { updateFreqCycle?: (id: number, value: string) => void } | undefined)
                ?.updateFreqCycle?.(row.original.id, value)
            }}
          >
            <SelectTrigger size="sm" className="h-7 min-w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="D">{t.day}</SelectItem>
              <SelectItem value="W">{t.week}</SelectItem>
              <SelectItem value="M">{t.month}</SelectItem>
              <SelectItem value="Y">{t.year}</SelectItem>
            </SelectContent>
          </Select>
        )
      },
    },
    {
      accessorKey: "freqTier",
      header: t.colFreqTier,
      cell: ({ row, table }) => {
        const current = row.original.freqTier ?? "F1"
        return (
          <Select
            value={current}
            onValueChange={(value) => {
              ;(table.options.meta as { updateFreqTier?: (id: number, value: string) => void } | undefined)
                ?.updateFreqTier?.(row.original.id, value)
            }}
          >
            <SelectTrigger size="sm" className="h-7 min-w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="F1">{t.tx0}</SelectItem>
              <SelectItem value="F2">{t.tx13}</SelectItem>
              <SelectItem value="F3">{t.tx410}</SelectItem>
              <SelectItem value="F4">{t.tx1119}</SelectItem>
              <SelectItem value="F5">{t.tx20plus}</SelectItem>
            </SelectContent>
          </Select>
        )
      },
    },
    {
      accessorKey: "balance",
      header: () => <div className="w-full text-right">{t.colEthValue}</div>,
      cell: ({ row }) => {
        const hasEthValue = typeof row.original.ethValueUsd === "number"
        const hasTokenValue = typeof row.original.tokenValueUsd === "number"

        if (!hasEthValue && !hasTokenValue) {
          return (
            <div className="text-right leading-tight space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
                USD
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                {t.pending}
              </div>
            </div>
          )
        }

        const totalUsd = row.original.ethValueUsd ?? 0
        const tokenUsd = row.original.tokenValueUsd ?? 0
        const ethUsd = totalUsd - tokenUsd
        const fmt = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        return (
          <div className="text-right leading-tight space-y-0.5">
            <div className="text-[10px] font-mono tabular-nums text-muted-foreground">
              {fmt(ethUsd)} + {fmt(tokenUsd)} =
            </div>
            <div className="text-sm font-mono tabular-nums font-semibold">
              {fmt(totalUsd)}
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "txCount",
      header: () => <div className="w-full text-right">{t.colTxCount}</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm tabular-nums">
          {row.original.txCount}
        </div>
      ),
    },
    {
      accessorKey: "fundedBy",
      header: t.colFundedBy,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {truncateAddr(row.original.fundedBy)}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: t.colCreated,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.createdAt}</span>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: t.colUpdated,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.updatedAt ?? "—"}</span>
      ),
    },
    {
      accessorKey: "addressPurity",
      header: t.colPurity,
      cell: ({ row }) => {
        const clean = row.original.addressPurity === "C"
        return (
          <Badge
            variant="outline"
            className={clean
              ? "border-green-500/40 text-green-500 px-1.5"
              : "border-red-500/40 text-red-500 px-1.5"}
          >
            {clean ? t.clean : t.toxic}
          </Badge>
        )
      },
    },
    {
      id: "actions",
      cell: ({ row }) => <RowActions row={row} t={t} />,
    },
  ]
}

function RowActions({ row, t }: { row: Row<z.infer<typeof schema>>; t: Translations }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
          size="icon"
        >
          <EllipsisVerticalIcon />
          <span className="sr-only">{t.openMenu}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onSelect={() => {
            const el = document.getElementById(`details-trigger-${row.original.id}`)
            el?.click()
          }}
        >
          {t.details}
        </DropdownMenuItem>
        <DropdownMenuItem>{t.analyze}</DropdownMenuItem>
        <DropdownMenuItem>{t.copyAddress}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">{t.remove}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TableToolbarSkeleton() {
  return (
    <div className="mb-4 flex items-center justify-between px-4 lg:px-6">
      <Skeleton className="h-5 w-16" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
      </div>
    </div>
  )
}

function TableFooterSkeleton() {
  return (
    <div className="flex items-center justify-between px-4">
      <div className="hidden flex-1 lg:flex">
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="flex w-full items-center gap-8 lg:w-fit">
        <div className="hidden items-center gap-2 lg:flex">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
        <Skeleton className="h-4 w-24" />
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Skeleton className="hidden h-8 w-8 lg:block" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="hidden h-8 w-8 lg:block" />
        </div>
      </div>
    </div>
  )
}

function TableLoadingCell({ columnId }: { columnId: string }) {
  switch (columnId) {
    case "drag":
      return <Skeleton className="h-7 w-7 rounded-md" />
    case "select":
      return <Skeleton className="mx-auto h-4 w-4 rounded-sm" />
    case "address":
      return <Skeleton className="h-4 w-32" />
    case "clientType":
      return <Skeleton className="h-7 w-[120px] rounded-md" />
    case "clientTier":
      return <Skeleton className="h-7 w-[130px] rounded-md" />
    case "review":
      return <Skeleton className="h-7 w-[120px] rounded-md" />
    case "freqCycle":
      return <Skeleton className="h-7 w-[110px] rounded-md" />
    case "freqTier":
      return <Skeleton className="h-7 w-[110px] rounded-md" />
    case "balance":
      return (
        <div className="ml-auto flex w-full max-w-[170px] flex-col items-end gap-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-24" />
        </div>
      )
    case "txCount":
      return <Skeleton className="ml-auto h-4 w-14" />
    case "fundedBy":
      return <Skeleton className="h-4 w-24" />
    case "createdAt":
    case "updatedAt":
      return <Skeleton className="h-4 w-20" />
    case "addressPurity":
      return <Skeleton className="h-6 w-14 rounded-full" />
    case "actions":
      return <Skeleton className="h-8 w-8 rounded-md" />
    default:
      return <Skeleton className="h-4 w-24" />
  }
}

function DraggableRow({ row }: { row: Row<z.infer<typeof schema>> }) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.id,
  })

  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition,
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  )
}

export function DataTable({
  data,
  onDataChange,
  isLoading = false,
}: {
  data: z.infer<typeof schema>[]
  onDataChange: React.Dispatch<React.SetStateAction<z.infer<typeof schema>[]>>
  isLoading?: boolean
}) {
  const { t } = useLang()
  const columns = React.useMemo(() => getColumns(t), [t])
  const { activeFilters } = useFilters()
  const filteredData = React.useMemo(
    () => applyFilters(data as Record<string, unknown>[], activeFilters) as z.infer<typeof schema>[],
    [data, activeFilters]
  )

  const [searchQuery, setSearchQuery] = React.useState("")
  const searchData = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return q ? filteredData.filter((w) => w.address.toLowerCase().includes(q)) : filteredData
  }, [filteredData, searchQuery])

  function saveWallet(address: string) {
    fetch("/api/save-wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: [address] }),
    }).catch(() => { /* ignore */ })
  }

  const today = new Date().toISOString().slice(0, 10)

  const updateRow = React.useCallback(
    (id: number, patch: Partial<z.infer<typeof schema>>) => {
      const addr = data.find((row) => row.id === id)?.address
      onDataChange((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...patch, updatedAt: today } : row))
      )
      if (addr) saveWallet(addr)
    },
    [data, onDataChange, today]
  )

  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 })

  React.useEffect(() => {
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }))
  }, [activeFilters])

  const sortableId = React.useId()
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  )

  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => searchData?.map(({ id }) => id) || [],
    [searchData]
  )

  const table = useReactTable({
    data: searchData,
    columns,
    meta: {
      updateClientType: (id: number, value: string) => updateRow(id, { clientType: value }),
      updateClientTier: (id: number, value: string) => updateRow(id, { clientTier: value }),
      updateReview: (id: number, value: string) => updateRow(id, { review: value }),
      updateFreqCycle: (id: number, value: string) => updateRow(id, { freqCycle: value }),
      updateFreqTier: (id: number, value: string) => updateRow(id, { freqTier: value }),
    },
    state: { sorting, columnVisibility, rowSelection, columnFilters, pagination },
    getRowId: (row) => row.id.toString(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (active && over && active.id !== over.id) {
      onDataChange((prev) => {
        const oldIndex = prev.findIndex((row) => row.id.toString() === String(active.id))
        const newIndex = prev.findIndex((row) => row.id.toString() === String(over.id))
        if (oldIndex < 0 || newIndex < 0) return prev
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  const skeletonRowCount = Math.min(table.getState().pagination.pageSize, 10)
  const visibleColumns = table.getVisibleLeafColumns()

  return (
    <div className="w-full flex-col justify-start gap-6">
      {isLoading ? (
        <TableToolbarSkeleton />
      ) : (
      <div className="mb-4 flex items-center justify-between px-4 lg:px-6">
        <span className="text-sm font-medium">{t.outline}</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search address…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })) }}
              className="h-8 w-52 pl-8 font-mono text-xs"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3Icon data-icon="inline-start" />
                {t.columns}
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {table
                .getAllColumns()
                .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCSV(table.getFilteredRowModel().rows.map((r) => r.original))}
          >
            <DownloadIcon />
            <span className="hidden lg:inline">{t.exportCsv}</span>
          </Button>
        </div>
      </div>
      )}

      <div className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
            id={sortableId}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="**:data-[slot=table-cell]:first:w-8">
                {isLoading ? (
                  Array.from({ length: skeletonRowCount }, (_, index) => (
                    <TableRow key={`skeleton-row-${index}`} className="pointer-events-none">
                      {visibleColumns.map((column) => (
                        <TableCell key={`${column.id}-${index}`}>
                          <TableLoadingCell columnId={column.id} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : table.getRowModel().rows?.length ? (
                  <SortableContext items={dataIds} strategy={verticalListSortingStrategy}>
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow key={row.id} row={row} />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      {t.noResults}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>

        {isLoading ? (
          <TableFooterSkeleton />
        ) : (
          <div className="flex items-center justify-between px-4">
            <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
              {table.getFilteredSelectedRowModel().rows.length} {t.of}{" "}
              {table.getFilteredRowModel().rows.length} {t.rowsSelected}
            </div>
            <div className="flex w-full items-center gap-8 lg:w-fit">
              <div className="hidden items-center gap-2 lg:flex">
                <Label htmlFor="rows-per-page" className="text-sm font-medium">
                  {t.rowsPerPage}
                </Label>
                <Select
                  value={`${table.getState().pagination.pageSize}`}
                  onValueChange={(value) => table.setPageSize(Number(value))}
                >
                  <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                    <SelectValue placeholder={table.getState().pagination.pageSize} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    <SelectGroup>
                      {[10, 20, 30, 40, 50].map((pageSize) => (
                        <SelectItem key={pageSize} value={`${pageSize}`}>{pageSize}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-fit items-center justify-center text-sm font-medium">
                {t.page} {table.getState().pagination.pageIndex + 1} {t.of} {table.getPageCount()}
              </div>
              <div className="ml-auto flex items-center gap-2 lg:ml-0">
                <Button variant="outline" className="hidden h-8 w-8 p-0 lg:flex" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                  <span className="sr-only">{t.goFirstPage}</span>
                  <ChevronsLeftIcon />
                </Button>
                <Button variant="outline" className="size-8" size="icon" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                  <span className="sr-only">{t.goPrevPage}</span>
                  <ChevronLeftIcon />
                </Button>
                <Button variant="outline" className="size-8" size="icon" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                  <span className="sr-only">{t.goNextPage}</span>
                  <ChevronRightIcon />
                </Button>
                <Button variant="outline" className="hidden size-8 lg:flex" size="icon" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
                  <span className="sr-only">{t.goLastPage}</span>
                  <ChevronsRightIcon />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


type WalletDetail = {
  source?: string
  chain?: string
  ethPrice: string
  txCount: number
  tokenTransferTotal?: number
  lastIndexedBlock?: number
  indexerStatus?: string
  transactions: Record<string, string>[]
  tokenTransfers: Record<string, string>[]
}

function timeAgo(ts: string) {
  const sec = Math.floor(Date.now() / 1000) - Number(ts)
  if (sec < 60)    return `${sec}s ago`
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function TableCellViewer({ item, t }: { item: z.infer<typeof schema>; t: Translations }) {
  const isMobile = useIsMobile()
  const clean = item.addressPurity === "C"
  const [detail, setDetail] = React.useState<WalletDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [tab, setTab] = React.useState("overview")
  const [open, setOpen] = React.useState(false)

  const CLIENT_TYPE_LABEL: Record<string, string> = {
    U: t.realUser, E: t.exchange, S: t.script, AP: t.malicious, B: t.bridge,
  }
  const TIER_LABEL: Record<string, string> = {
    L1: "<10k", L2: "10k-99.9k", L3: "100k-999.9k", L4: "1M-9.99M", L5: "10M+",
  }
  const FREQ_CYCLE_LABEL: Record<string, string> = {
    D: t.day, W: t.week, M: t.month, Y: t.year,
  }
  const FREQ_TIER_LABEL: Record<string, string> = {
    F1: t.tx0, F2: t.tx13, F3: t.tx410, F4: t.tx1119, F5: t.tx20plus,
  }

  const fetchDetail = React.useEffectEvent(async (force = false) => {
    if (detail && !force) return
    const showLoader = !detail
    if (showLoader) setLoading(true)
    try {
      const res = await fetch(`/api/wallet/${item.address}`)
      const json = await res.json()
      setDetail(json)
    } catch {
      // leave null
    } finally {
      if (showLoader) setLoading(false)
    }
  })

  React.useEffect(() => {
    if (!open) return

    const intervalId = window.setInterval(() => {
      void fetchDetail(true)
    }, 10_000)

    return () => window.clearInterval(intervalId)
  }, [open, item.address])

  return (
    <Drawer
      direction={isMobile ? "bottom" : "right"}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (isOpen) {
          void fetchDetail(true)
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <a
          href={`https://etherscan.io/address/${item.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-foreground hover:underline inline-flex items-center gap-1"
          title="Open on Etherscan"
        >
          {truncateAddr(item.address)}
          <ExternalLinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </a>

        <DrawerTrigger asChild>
          <Button
            id={`details-trigger-${item.id}`}
            variant="outline"
            size="sm"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          >
            {t.details}
          </Button>
        </DrawerTrigger>
      </div>

      <DrawerContent className="max-w-xl">
        <DrawerHeader className="gap-1 border-b pb-4">
          <DrawerTitle className="font-mono text-xs break-all">{item.address}</DrawerTitle>
          <DrawerDescription className="flex items-center gap-3 text-sm">
            <>
              <span className="font-semibold text-foreground">{item.balance} ETH</span>
              {detail && Number(detail.ethPrice) > 0 && (
                <>
                  <span className="text-muted-foreground">
                    ${(Number(item.balance) * Number(detail.ethPrice)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-muted-foreground text-xs">@ ${Number(detail.ethPrice).toLocaleString()}/ETH</span>
                </>
              )}
              {loading && <span className="text-muted-foreground text-xs">{t.loading}</span>}
            </>
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="mx-4 mt-3 grid w-auto grid-cols-3 shrink-0">
              <TabsTrigger value="overview">{t.overview}</TabsTrigger>
              <TabsTrigger value="txns">{t.transactions}</TabsTrigger>
              <TabsTrigger value="tokens">{t.tokenTransfers}</TabsTrigger>
            </TabsList>

            {/* OVERVIEW */}
            <TabsContent value="overview" className="flex-1 overflow-y-auto px-4 py-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t.balance}</span>
                  <span className="font-mono font-medium">{item.balance} ETH</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t.usdValue}</span>
                  <span className="font-mono font-medium">
                    {detail && Number(detail.ethPrice) > 0
                      ? `$${(Number(item.balance) * Number(detail.ethPrice)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "—"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t.txCount}</span>
                  <span className="font-mono font-medium">{detail ? detail.txCount : item.txCount}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t.clientType}</span>
                  <span className="font-medium">{CLIENT_TYPE_LABEL[item.clientType ?? ""] ?? item.clientType}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t.clientTier}</span>
                  <span className="font-medium">{item.clientTier} · {TIER_LABEL[item.clientTier ?? ""]}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t.colReview}</span>
                  <span className="font-medium">{item.review === "A" ? t.auto : t.manual}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t.freqCycle}</span>
                  <span className="font-medium">{FREQ_CYCLE_LABEL[item.freqCycle ?? ""] ?? item.freqCycle}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t.freqTier}</span>
                  <span className="font-medium">{FREQ_TIER_LABEL[item.freqTier ?? ""] ?? item.freqTier}</span>
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <span className="text-xs text-muted-foreground">{t.addressPurity}</span>
                  <Badge variant="outline" className={`w-fit ${clean ? "border-green-500/40 text-green-500" : "border-red-500/40 text-red-500"}`}>
                    {clean ? t.clean : t.toxic}
                  </Badge>
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <span className="text-xs text-muted-foreground">{t.fundedBy}</span>
                  <span className="font-mono text-xs break-all">{item.fundedBy ?? "—"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t.created}</span>
                  <span className="font-medium">{item.createdAt}</span>
                </div>
              </div>
            </TabsContent>

            {/* TRANSACTIONS */}
            <TabsContent value="txns" className="flex-1 overflow-y-auto px-4 py-3">
              {loading && <p className="text-sm text-muted-foreground">{t.loading}</p>}
              {!loading && (!detail?.transactions.length) && (
                <p className="text-sm text-muted-foreground">{t.noTransactions}</p>
              )}
              <div className="flex flex-col gap-2">
                {detail?.transactions.map((tx) => {
                  const isIn = tx.to?.toLowerCase() === item.address.toLowerCase()
                  return (
                    <div key={tx.hash} className="rounded-md border px-3 py-2 text-xs flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-muted-foreground truncate">{tx.hash?.slice(0, 18)}…</span>
                        <Badge variant="outline" className={isIn ? "border-green-500/40 text-green-500" : "border-orange-500/40 text-orange-500"}>
                          {isIn ? t.dirIn : t.dirOut}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{isIn ? `${t.from} ${tx.from?.slice(0,8)}…` : `${t.to} ${tx.to?.slice(0,8)}…`}</span>
                        <span>{(Number(tx.value) / 1e18).toFixed(4)} ETH</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t.block} {tx.blockNumber}</span>
                        <span>{timeAgo(tx.timeStamp)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </TabsContent>

            {/* TOKEN TRANSFERS */}
            <TabsContent value="tokens" className="flex-1 overflow-y-auto px-4 py-3">
              {loading && <p className="text-sm text-muted-foreground">{t.loading}</p>}
              {!loading && detail && (
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="secondary">{t.totalTransfers} {detail.tokenTransferTotal ?? detail.tokenTransfers.length}</Badge>
                  <Badge variant="outline">{t.showing} {detail.tokenTransfers.length}</Badge>
                </div>
              )}
              {!loading && (!detail?.tokenTransfers.length) && (
                <p className="text-sm text-muted-foreground">{t.noTokenTransfers}</p>
              )}
              <div className="flex flex-col gap-2">
                {detail?.tokenTransfers.map((tx, i) => {
                  const isIn = tx.to?.toLowerCase() === item.address.toLowerCase()
                  const decimals = Number(tx.tokenDecimal ?? 18)
                  const amount = (Number(tx.value) / Math.pow(10, decimals)).toFixed(4)
                  return (
                    <div key={`${tx.hash}-${i}`} className="rounded-md border px-3 py-2 text-xs flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{tx.tokenSymbol}</span>
                        <Badge variant="outline" className={isIn ? "border-green-500/40 text-green-500" : "border-orange-500/40 text-orange-500"}>
                          {isIn ? t.dirIn : t.dirOut}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{isIn ? `${t.from} ${tx.from?.slice(0,8)}…` : `${t.to} ${tx.to?.slice(0,8)}…`}</span>
                        <span>{amount} {tx.tokenSymbol}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t.block} {tx.blockNumber}</span>
                        <span>{timeAgo(tx.timeStamp)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DrawerFooter className="border-t pt-3">
          <DrawerClose asChild>
            <Button variant="outline">{t.close}</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
