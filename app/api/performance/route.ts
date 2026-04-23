import { NextResponse } from "next/server"
import { getAllTrades } from "@/lib/tradeTracker"
import {
  getPerformanceSummary,
  getPerformanceBySymbol,
  calculateWinRate,
  calculateProfitFactor,
  calculateMaxDrawdown,
  getNetPnlForPeriod,
  type PerformanceFilter,
  type PerformancePeriod
} from "@/lib/performance"

function isValidPeriod(value: string | null): value is PerformancePeriod {
  return (
    value === "ALL" ||
    value === "TODAY" ||
    value === "7D" ||
    value === "30D" ||
    value === "THIS_MONTH" ||
    value === "CUSTOM"
  )
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const periodParam = searchParams.get("period")
    const from = searchParams.get("from") ?? undefined
    const to = searchParams.get("to") ?? undefined

    const filter: PerformanceFilter = {
      period: isValidPeriod(periodParam) ? periodParam : "ALL",
      from,
      to
    }

    const trades = getAllTrades()

    const summary = getPerformanceSummary(trades, filter)
    const bySymbol = getPerformanceBySymbol(trades, filter)

    return NextResponse.json({
      success: true,
      filter,
      summary,
      bySymbol,
      quickStats: {
        winRate: calculateWinRate(trades, filter),
        profitFactor: calculateProfitFactor(trades, filter),
        maxDrawdown: calculateMaxDrawdown(trades, filter),
        netPnl: getNetPnlForPeriod(trades, filter)
      }
    })
  } catch (error) {
    console.error("Performance API error:", error)

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load performance data"
      },
      { status: 500 }
    )
  }
}