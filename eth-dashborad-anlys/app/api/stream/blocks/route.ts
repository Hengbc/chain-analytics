import { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001"

export async function GET(req: NextRequest) {
  const chain = req.nextUrl.searchParams.get("chain") ?? "eth"

  const backendRes = await fetch(
    `${BACKEND_URL}/api/stream/blocks?chain=${chain}&poll_interval=3`,
    {
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
      // @ts-expect-error — Node fetch duplex option
      duplex: "half",
    }
  )

  if (!backendRes.ok || !backendRes.body) {
    return new Response("Backend stream unavailable", { status: 502 })
  }

  return new Response(backendRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  })
}
