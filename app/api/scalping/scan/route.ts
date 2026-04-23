/* =========================
SCALPING SCAN API ROUTE

POST /api/scalping/scan

Runs the new scalping pipeline (orchestrator.ts) across all scalp-
enabled symbols and returns validated ScalpSignals.

Body: { symbols?: string[] } - optional filter. Defaults to BTCUSDT,
EURUSD, XAUUSD.
========================= */

import { NextResponse } from "next/server"
import { runScalpingPipeline, type ScalpContext } from "@/lib/scalping/orchestrator"
import { loadBacktestData } from "@/lib/scalping/backtest/dataLoader"

const DEFAULT_SYMBOLS = ["BTCUSDT", "EURUSD", "XAUUSD"]

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const symbolsIn: unknown = body?.symbols

    const symbols =
      Array.isArray(symbolsIn) && symbolsIn.every((s) => typeof s === "string")
        ? (symbolsIn as string[])
        : DEFAULT_SYMBOLS

    const contexts: ScalpContext[] = []

    for (const symbol of symbols) {
      try {
        const data = await loadBacktestData(symbol, 400)
        contexts.push({
          symbol,
          candles1h: data.candles1h,
          candles15m: data.candles15m,
          candles5m: data.candles5m
        })
      } catch (err) {
        console.error(`[scalping/scan] load failed for ${symbol}:`, err)
      }
    }

    const result = await runScalpingPipeline(contexts)

    return NextResponse.json({
      success: true,
      ...result
    })
  } catch (error) {
    console.error("[scalping/scan] error:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Scalping scan failed"
      },
      { status: 500 }
    )
  }
}
