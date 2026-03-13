import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001"

export async function POST(req: NextRequest) {
  const { addresses } = await req.json()

  try {
    const resp = await fetch(`${BACKEND_URL}/api/wallets/bulk-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "eth", addresses }),
      cache: "no-store",
    })

    if (!resp.ok) {
      return NextResponse.json({ error: "Backend error" }, { status: resp.status })
    }

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (e) {
    console.error("save-wallets proxy error:", e)
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 })
  }
}
