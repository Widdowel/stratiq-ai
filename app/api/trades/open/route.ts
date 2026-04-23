import { NextResponse } from "next/server"
import {
  openTrade,
  type ExecutionVenue,
  type PriceSource,
  type MarginMode,
  type AccountCurrency
} from "@/lib/tradeTracker"
import { validateOpenTrade } from "@/lib/validator"

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined
  }

  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function optionalString(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function requiredString(value: unknown) {
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

    const validation = validateOpenTrade(body)

    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid trade data",
          errors: validation.errors
        },
        { status: 400 }
      )
    }

    const payload = {
      id:
        typeof body.id === "string" && body.id.trim()
          ? body.id.trim()
          : crypto.randomUUID(),

      symbol: requiredString(body.symbol),
      direction: body.direction,
      timeframe: body.timeframe,

      entry: safeNumber(body.entry),
      tp: safeNumber(body.tp),
      sl: safeNumber(body.sl),
      confidence: safeNumber(body.confidence, 0),
      positionSize: safeNumber(body.positionSize, 1),

      executionVenue:
        body.executionVenue !== undefined
          ? (body.executionVenue as ExecutionVenue)
          : undefined,

      priceSource:
        body.priceSource !== undefined
          ? (body.priceSource as PriceSource)
          : undefined,

      actualLot: optionalNumber(body.actualLot),
      actualEntry: optionalNumber(body.actualEntry),
      quantity: optionalNumber(body.quantity),
      marginUsedUsdt: optionalNumber(body.marginUsedUsdt),
      leverage: optionalNumber(body.leverage),

      marginMode:
        body.marginMode !== undefined
          ? (body.marginMode as MarginMode)
          : undefined,

      accountCurrency:
        body.accountCurrency !== undefined
          ? (body.accountCurrency as AccountCurrency)
          : undefined,

      notes: optionalString(body.notes)
    }

    const trade = openTrade(payload)

    return NextResponse.json({
      success: true,
      trade
    })
  } catch (error) {
    console.error("Open trade error:", error)

    return NextResponse.json(
      {
        success: false,
        message: "Unable to open trade"
      },
      { status: 500 }
    )
  }
}