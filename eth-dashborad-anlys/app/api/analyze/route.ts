import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const resp = await fetch(`${BACKEND_URL}/api/wallets/bulk-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const data = await resp.json()
    return NextResponse.json(data, { status: resp.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected analyze proxy error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
