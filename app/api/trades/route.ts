import { NextResponse } from "next/server"

import {
  getAllTrades,
  getOpenTrades,
  getClosedTrades,
  getSignals,
  getTradeStats
} from "@/lib/tradeTracker"

type PerformancePeriod =
  | "ALL"
  | "TODAY"
  | "7D"
  | "30D"
  | "THIS_MONTH"
  | "CUSTOM"

type TradeLike = {
  status?: string
  openedAt?: string
  closedAt?: string
  createdAt?: string
  updatedAt?: string
  pnl?: number
}

const ALLOWED_PERIODS: PerformancePeriod[] = [
  "ALL",
  "TODAY",
  "7D",
  "30D",
  "THIS_MONTH",
  "CUSTOM"
]

function getTradeReferenceDate(trade: TradeLike) {
  return trade.closedAt || trade.updatedAt || trade.openedAt || trade.createdAt
}

function isValidDate(value?: string | null) {
  if (!value) return false
  return !Number.isNaN(new Date(value).getTime())
}

function normalizePeriod(value: string | null): PerformancePeriod {
  const period = (value || "ALL") as PerformancePeriod
  return ALLOWED_PERIODS.includes(period) ? period : "ALL"
}

function getDateRange(
  period: PerformancePeriod,
  from?: string | null,
  to?: string | null
) {
  const now = new Date()
  const start = new Date(now)
  let end: Date | null = new Date(now)

  if (period === "ALL") {
    return { start: null, end: null }
  }

  if (period === "TODAY") {
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }

  if (period === "7D") {
    start.setDate(start.getDate() - 7)
    return { start, end }
  }

  if (period === "30D") {
    start.setDate(start.getDate() - 30)
    return { start, end }
  }

  if (period === "THIS_MONTH") {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end = new Date(now)
    return { start, end }
  }

  if (period === "CUSTOM") {
    const customStart =
      from && isValidDate(from) ? new Date(`${from}T00:00:00`) : null
    const customEnd =
      to && isValidDate(to) ? new Date(`${to}T23:59:59.999`) : null

    return {
      start: customStart,
      end: customEnd
    }
  }

  return { start: null, end: null }
}

function isWithinRange(
  value: string | undefined,
  start: Date | null,
  end: Date | null
) {
  if (!value || !isValidDate(value)) return false

  const date = new Date(value)

  if (start && date < start) return false
  if (end && date > end) return false

  return true
}

function buildFilteredStats(closedTrades: TradeLike[]) {
  const tradesWithPnl = closedTrades.filter(
    (trade) => typeof trade.pnl === "number"
  )

  const total = tradesWithPnl.length
  const wins = tradesWithPnl.filter((trade) => (trade.pnl ?? 0) > 0).length
  const losses = tradesWithPnl.filter((trade) => (trade.pnl ?? 0) < 0).length
  const breakEven = tradesWithPnl.filter((trade) => (trade.pnl ?? 0) === 0).length

  const grossProfit = tradesWithPnl
    .filter((trade) => (trade.pnl ?? 0) > 0)
    .reduce((sum, trade) => sum + (trade.pnl ?? 0), 0)

  const grossLossAbs = Math.abs(
    tradesWithPnl
      .filter((trade) => (trade.pnl ?? 0) < 0)
      .reduce((sum, trade) => sum + (trade.pnl ?? 0), 0)
  )

  const netPnl = tradesWithPnl.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0)

  const averageWin = wins > 0 ? grossProfit / wins : 0
  const averageLoss = losses > 0 ? grossLossAbs / losses : 0
  const winRate = total > 0 ? (wins / total) * 100 : 0

  const bestTrade =
    total > 0
      ? Math.max(...tradesWithPnl.map((trade) => trade.pnl ?? 0))
      : 0

  const worstTrade =
    total > 0
      ? Math.min(...tradesWithPnl.map((trade) => trade.pnl ?? 0))
      : 0

  const profitFactor =
    grossLossAbs > 0 ? grossProfit / grossLossAbs : grossProfit > 0 ? Infinity : 0

  return {
    total,
    wins,
    losses,
    breakEven,
    winRate: Number(winRate.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(4)),
    grossLoss: Number(grossLossAbs.toFixed(4)),
    netPnl: Number(netPnl.toFixed(4)),
    averageWin: Number(averageWin.toFixed(4)),
    averageLoss: Number(averageLoss.toFixed(4)),
    bestTrade: Number(bestTrade.toFixed(4)),
    worstTrade: Number(worstTrade.toFixed(4)),
    profitFactor:
      profitFactor === Infinity ? Infinity : Number(profitFactor.toFixed(2))
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const period = normalizePeriod(searchParams.get("period"))
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const { start, end } = getDateRange(period, from, to)

    const allTrades = getAllTrades()
    const openTrades = getOpenTrades()
    const closedTrades = getClosedTrades()
    const signals = getSignals()

    const filteredClosed = closedTrades.filter((trade) =>
      isWithinRange(getTradeReferenceDate(trade), start, end)
    )

    const filteredSignals = signals.filter((trade) =>
      period === "ALL"
        ? true
        : isWithinRange(getTradeReferenceDate(trade), start, end)
    )

    const filteredAll = allTrades.filter((trade) => {
      if (trade.status === "OPEN") return true

      if (trade.status === "SIGNAL") {
        return period === "ALL"
          ? true
          : isWithinRange(getTradeReferenceDate(trade), start, end)
      }

      return isWithinRange(getTradeReferenceDate(trade), start, end)
    })

    const filteredStats =
      period === "ALL"
        ? getTradeStats()
        : buildFilteredStats(filteredClosed)

    return NextResponse.json({
      success: true,
      filter: {
        period,
        from: from || undefined,
        to: to || undefined
      },
      counts: {
        all: filteredAll.length,
        open: openTrades.length,
        signals: filteredSignals.length,
        closed: filteredClosed.length
      },
      all: filteredAll,
      signals: filteredSignals,
      open: openTrades,
      closed: filteredClosed,
      stats: filteredStats
    })
  } catch (error) {
    console.error("Trades API error:", error)

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load trades"
      },
      { status: 500 }
    )
  }
}