import { NextResponse } from "next/server"
import { closeTrade } from "@/lib/tradeTracker"
import { validateCloseTrade } from "@/lib/validator"

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim()
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request body"
        },
        { status: 400 }
      )
    }

    const validation = validateCloseTrade(body)

    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid close trade data",
          errors: validation.errors
        },
        { status: 400 }
      )
    }

    const id = safeString(body.id)
    const closePrice = safeNumber(body.closePrice)
    const closeReason = body.closeReason

    const trade = closeTrade(id, closePrice, closeReason)

    if (!trade) {
      return NextResponse.json(
        {
          success: false,
          message: "Trade not found or already closed"
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      trade
    })
  } catch (error) {
    console.error("Close trade error:", error)

    return NextResponse.json(
      {
        success: false,
        message: "Unable to close trade"
      },
      { status: 500 }
    )
  }
}