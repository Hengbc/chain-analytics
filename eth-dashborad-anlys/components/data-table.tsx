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

import { useIsMobile } from "@/hooks/use-mobile"
import { useFilters, applyFilters } from "@/components/filter-context"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { GripVerticalIcon, EllipsisVerticalIcon, Columns3Icon, ChevronDownIcon, PlusIcon, DownloadIcon, ChevronsLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsRightIcon, ExternalLinkIcon } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"

export const schema = z.object({
  id: z.number(),
  address: z.string(),
  balance: z.string(),
  ethValueUsd: z.number().optional(),
  tokenHoldings: z.number().optional(),
  txCount: z.number(),
  fundedBy: z.string().nullable(),
  createdAt: z.string(),
  dataSource: z.string().optional(),
  clientType: z.string().optional(),
  clientTier: z.string().optional(),
  review: z.string().optional(),
  freqCycle: z.string().optional(),
  freqTier: z.string().optional(),
  addressPurity: z.string().optional(),
})

const CLIENT_TYPE_LABEL: Record<string, string> = {
  U: "Real User", E: "Exchange", S: "Script", AP: "Malicious", B: "Bridge",
}
const TIER_LABEL: Record<string, string> = {
  L1: "<10k", L2: "10k-99.9k", L3: "100k-999.9k", L4: "1M-9.99M", L5: "10M+",
}

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

function AddAddressSheet({ onAdd }: { onAdd: (w: z.infer<typeof schema>) => void }) {
  const [open, setOpen] = React.useState(false)
  const [address, setAddress] = React.useState("")
  const [clientType, setClientType] = React.useState("U")
  const [clientTier, setClientTier] = React.useState("L1")
  const [addressPurity, setAddressPurity] = React.useState("C")

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!address.trim()) return
    onAdd({
      id: Date.now(),
      address: address.trim(),
      balance: "0",
      txCount: 0,
      fundedBy: null,
      createdAt: new Date().toISOString().slice(0, 10),
      dataSource: "R",
      clientType,
      clientTier,
      review: "A",
      freqCycle: "D",
      freqTier: "F1",
      addressPurity,
    })
    setAddress("")
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon />
          <span className="hidden lg:inline">Add Address</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Add Wallet Address</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr-input">ETH Address</Label>
            <Input
              id="addr-input"
              placeholder="0x..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Client Type</Label>
            <Select value={clientType} onValueChange={setClientType}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="U">Real User</SelectItem>
                <SelectItem value="E">Exchange</SelectItem>
                <SelectItem value="S">Script / Protocol</SelectItem>
                <SelectItem value="AP">Malicious</SelectItem>
                <SelectItem value="B">Bridge</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Client Tier</Label>
            <Select value={clientTier} onValueChange={setClientTier}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="L1">&lt;10k</SelectItem>
                <SelectItem value="L2">10k – 99.9k</SelectItem>
                <SelectItem value="L3">100k – 999.9k</SelectItem>
                <SelectItem value="L4">1M – 9.99M</SelectItem>
                <SelectItem value="L5">10M+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Address Purity</Label>
            <Select value={addressPurity} onValueChange={setAddressPurity}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="C">Clean</SelectItem>
                <SelectItem value="P">Toxic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <SheetFooter className="mt-auto flex gap-2">
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">Cancel</Button>
            </SheetClose>
            <Button type="submit" className="flex-1">Add</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// Create a separate component for the drag handle
function DragHandle({ id }: { id: number }) {
  const { attributes, listeners } = useSortable({
    id,
  })

  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:bg-transparent"
    >
      <GripVerticalIcon className="size-3 text-muted-foreground" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  )
}

const columns: ColumnDef<z.infer<typeof schema>>[] = [
  {
    id: "drag",
    header: () => null,
    cell: ({ row }) => <DragHandle id={row.original.id} />,
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
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => <TableCellViewer item={row.original} />,
    enableHiding: false,
  },
  {
    accessorKey: "clientType",
    header: "Type",
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
            <SelectItem value="U">Real User</SelectItem>
            <SelectItem value="E">Exchange</SelectItem>
            <SelectItem value="S">Script</SelectItem>
            <SelectItem value="AP">Malicious</SelectItem>
            <SelectItem value="B">Bridge</SelectItem>
          </SelectContent>
        </Select>
      )
    },
  },
  {
    accessorKey: "clientTier",
    header: "Tier",
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
    header: "Review",
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
            <SelectItem value="A">Auto</SelectItem>
            <SelectItem value="M">Manual</SelectItem>
          </SelectContent>
        </Select>
      )
    },
  },
  {
    accessorKey: "freqCycle",
    header: "Freq Cycle",
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
            <SelectItem value="D">Day</SelectItem>
            <SelectItem value="W">Week</SelectItem>
            <SelectItem value="M">Month</SelectItem>
            <SelectItem value="Y">Year</SelectItem>
          </SelectContent>
        </Select>
      )
    },
  },
  {
    accessorKey: "freqTier",
    header: "Freq Tier",
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
            <SelectItem value="F1">0 TX</SelectItem>
            <SelectItem value="F2">1-3 TX</SelectItem>
            <SelectItem value="F3">4-10 TX</SelectItem>
            <SelectItem value="F4">11-19 TX</SelectItem>
            <SelectItem value="F5">20+ TX</SelectItem>
          </SelectContent>
        </Select>
      )
    },
  },
  {
    accessorKey: "balance",
    header: () => <div className="w-full text-right">ETH Value + Token Holdings</div>,
    cell: ({ row }) => {
      const eth = Number(row.original.balance || 0)
      const usd = row.original.ethValueUsd ?? 0
      const tokenHoldings = row.original.tokenHoldings ?? 0
      return (
        <div className="text-right text-xs leading-tight">
          <div className="font-mono tabular-nums">{eth.toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH</div>
          <div className="font-mono tabular-nums text-muted-foreground">${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div className="text-muted-foreground">{tokenHoldings} token holdings</div>
        </div>
      )
    },
  },
  {
    accessorKey: "txCount",
    header: () => <div className="w-full text-right">TX Count</div>,
    cell: ({ row }) => (
      <div className="text-right font-mono text-sm tabular-nums">
        {row.original.txCount}
      </div>
    ),
  },
  {
    accessorKey: "fundedBy",
    header: "Funded By",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {truncateAddr(row.original.fundedBy)}
      </span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.createdAt}</span>
    ),
  },
  {
    accessorKey: "addressPurity",
    header: "Purity",
    cell: ({ row }) => {
      const clean = row.original.addressPurity === "C"
      return (
        <Badge
          variant="outline"
          className={clean
            ? "border-green-500/40 text-green-500 px-1.5"
            : "border-red-500/40 text-red-500 px-1.5"}
        >
          {clean ? "Clean" : "Toxic"}
        </Badge>
      )
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
            size="icon"
          >
            <EllipsisVerticalIcon />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onSelect={() => {
              const el = document.getElementById(`details-trigger-${row.original.id}`)
              el?.click()
            }}
          >
            Details
          </DropdownMenuItem>
          <DropdownMenuItem>Analyze</DropdownMenuItem>
          <DropdownMenuItem>Copy Address</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]

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
  data: initialData,
}: {
  data: z.infer<typeof schema>[]
}) {
  const [data, setData] = React.useState(() => initialData)
  const { activeFilters } = useFilters()
  const filteredData = React.useMemo(
    () => applyFilters(data as Record<string, unknown>[], activeFilters) as z.infer<typeof schema>[],
    [data, activeFilters]
  )
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })
  const sortableId = React.useId()
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  )

  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => filteredData?.map(({ id }) => id) || [],
    [filteredData]
  )

  const table = useReactTable({
    data: filteredData,
    columns,
    meta: {
      updateClientType: (id: number, value: string) => {
        setData((prev) => prev.map((r) => (r.id === id ? { ...r, clientType: value } : r)))
      },
      updateClientTier: (id: number, value: string) => {
        setData((prev) => prev.map((r) => (r.id === id ? { ...r, clientTier: value } : r)))
      },
      updateReview: (id: number, value: string) => {
        setData((prev) => prev.map((r) => (r.id === id ? { ...r, review: value } : r)))
      },
      updateFreqCycle: (id: number, value: string) => {
        setData((prev) => prev.map((r) => (r.id === id ? { ...r, freqCycle: value } : r)))
      },
      updateFreqTier: (id: number, value: string) => {
        setData((prev) => prev.map((r) => (r.id === id ? { ...r, freqTier: value } : r)))
      },
    },
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
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
      setData((data) => {
        const oldIndex = dataIds.indexOf(active.id)
        const newIndex = dataIds.indexOf(over.id)
        return arrayMove(data, oldIndex, newIndex)
      })
    }
  }

  return (
    <Tabs
      defaultValue="outline"
      className="w-full flex-col justify-start gap-6"
    >
      <div className="flex items-center justify-between px-4 lg:px-6">
        <Label htmlFor="view-selector" className="sr-only">
          View
        </Label>
        <Select defaultValue="outline">
          <SelectTrigger
            className="flex w-fit @4xl/main:hidden"
            size="sm"
            id="view-selector"
          >
            <SelectValue placeholder="Select a view" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="outline">Outline</SelectItem>
              <SelectItem value="past-performance">Past Performance</SelectItem>
              <SelectItem value="key-personnel">Key Personnel</SelectItem>
              <SelectItem value="focus-documents">Focus Documents</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex">
          <TabsTrigger value="outline">Outline</TabsTrigger>
          <TabsTrigger value="past-performance">
            Past Performance <Badge variant="secondary">3</Badge>
          </TabsTrigger>
          <TabsTrigger value="key-personnel">
            Key Personnel <Badge variant="secondary">2</Badge>
          </TabsTrigger>
          <TabsTrigger value="focus-documents">Focus Documents</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3Icon data-icon="inline-start" />
                Columns
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCSV(table.getFilteredRowModel().rows.map((r) => r.original))}
          >
            <DownloadIcon />
            <span className="hidden lg:inline">Export CSV</span>
          </Button>
          <AddAddressSheet onAdd={(w) => setData((prev) => [...prev, w])} />
        </div>
      </div>
      <TabsContent
        value="outline"
        className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
      >
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
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead key={header.id} colSpan={header.colSpan}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="**:data-[slot=table-cell]:first:w-8">
                {table.getRowModel().rows?.length ? (
                  <SortableContext
                    items={dataIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow key={row.id} row={row} />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} row(s) selected.
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value))
                }}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectGroup>
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to first page</span>
                <ChevronsLeftIcon
                />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <ChevronLeftIcon
                />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <ChevronRightIcon
                />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to last page</span>
                <ChevronsRightIcon
                />
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>
      <TabsContent
        value="past-performance"
        className="flex flex-col px-4 lg:px-6"
      >
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
      <TabsContent value="key-personnel" className="flex flex-col px-4 lg:px-6">
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
      <TabsContent
        value="focus-documents"
        className="flex flex-col px-4 lg:px-6"
      >
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
    </Tabs>
  )
}


type WalletDetail = {
  ethPrice: string
  txCount: number
  tokenTransferTotal?: number
  transactions: Record<string, string>[]
  tokenTransfers: Record<string, string>[]
}

function timeAgo(ts: string) {
  const sec = Math.floor(Date.now() / 1000) - Number(ts)
  if (sec < 60)  return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function TableCellViewer({ item }: { item: z.infer<typeof schema> }) {
  const isMobile = useIsMobile()
  const clean = item.addressPurity === "C"
  const [detail, setDetail] = React.useState<WalletDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [tab, setTab] = React.useState("overview")

  async function fetchDetail() {
    if (detail) return
    setLoading(true)
    try {
      const res = await fetch(`/api/wallet/${item.address}`)
      const json = await res.json()
      setDetail(json)
    } catch {
      // leave null
    } finally {
      setLoading(false)
    }
  }

  return (
    <Drawer direction={isMobile ? "bottom" : "right"} onOpenChange={(o) => { if (o) fetchDetail() }}>
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
            Details
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
              {loading && <span className="text-muted-foreground text-xs">Loading…</span>}
            </>
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="mx-4 mt-3 grid w-auto grid-cols-3 shrink-0">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="txns">Transactions</TabsTrigger>
              <TabsTrigger value="tokens">Token Transfers</TabsTrigger>
            </TabsList>

            {/* ── OVERVIEW ── */}
            <TabsContent value="overview" className="flex-1 overflow-y-auto px-4 py-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Balance</span>
                  <span className="font-mono font-medium">{item.balance} ETH</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">USD Value</span>
                  <span className="font-mono font-medium">
                    {detail && Number(detail.ethPrice) > 0
                      ? `$${(Number(item.balance) * Number(detail.ethPrice)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "—"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">TX Count</span>
                  <span className="font-mono font-medium">{detail ? detail.txCount : item.txCount}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Client Type</span>
                  <span className="font-medium">{CLIENT_TYPE_LABEL[item.clientType ?? ""] ?? item.clientType}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Client Tier</span>
                  <span className="font-medium">{item.clientTier} · {TIER_LABEL[item.clientTier ?? ""]}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Review</span>
                  <span className="font-medium">{item.review === "A" ? "Auto" : "Manual"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Freq Cycle</span>
                  <span className="font-medium">{{ D: "Day", W: "Week", M: "Month", Y: "Year" }[item.freqCycle ?? ""] ?? item.freqCycle}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Freq Tier</span>
                  <span className="font-medium">{{ F1: "0 TX", F2: "1-3 TX", F3: "4-10 TX", F4: "11-19 TX", F5: "20+ TX" }[item.freqTier ?? ""] ?? item.freqTier}</span>
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <span className="text-xs text-muted-foreground">Address Purity</span>
                  <Badge variant="outline" className={`w-fit ${clean ? "border-green-500/40 text-green-500" : "border-red-500/40 text-red-500"}`}>
                    {clean ? "Clean" : "Toxic"}
                  </Badge>
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <span className="text-xs text-muted-foreground">Funded By</span>
                  <span className="font-mono text-xs break-all">{item.fundedBy ?? "—"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Created</span>
                  <span className="font-medium">{item.createdAt}</span>
                </div>
              </div>
            </TabsContent>

            {/* ── TRANSACTIONS ── */}
            <TabsContent value="txns" className="flex-1 overflow-y-auto px-4 py-3">
              {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!loading && (!detail?.transactions.length) && (
                <p className="text-sm text-muted-foreground">No transactions found.</p>
              )}
              <div className="flex flex-col gap-2">
                {detail?.transactions.map((tx) => {
                  const isIn = tx.to?.toLowerCase() === item.address.toLowerCase()
                  return (
                    <div key={tx.hash} className="rounded-md border px-3 py-2 text-xs flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-muted-foreground truncate">{tx.hash?.slice(0, 18)}…</span>
                        <Badge variant="outline" className={isIn ? "border-green-500/40 text-green-500" : "border-orange-500/40 text-orange-500"}>
                          {isIn ? "IN" : "OUT"}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{isIn ? `From ${tx.from?.slice(0,8)}…` : `To ${tx.to?.slice(0,8)}…`}</span>
                        <span>{(Number(tx.value) / 1e18).toFixed(4)} ETH</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Block {tx.blockNumber}</span>
                        <span>{timeAgo(tx.timeStamp)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </TabsContent>

            {/* ── TOKEN TRANSFERS ── */}
            <TabsContent value="tokens" className="flex-1 overflow-y-auto px-4 py-3">
              {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!loading && detail && (
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="secondary">Total Transfers: {detail.tokenTransferTotal ?? detail.tokenTransfers.length}</Badge>
                  <Badge variant="outline">Showing: {detail.tokenTransfers.length}</Badge>
                </div>
              )}
              {!loading && (!detail?.tokenTransfers.length) && (
                <p className="text-sm text-muted-foreground">No token transfers found.</p>
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
                          {isIn ? "IN" : "OUT"}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{isIn ? `From ${tx.from?.slice(0,8)}…` : `To ${tx.to?.slice(0,8)}…`}</span>
                        <span>{amount} {tx.tokenSymbol}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Block {tx.blockNumber}</span>
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
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
