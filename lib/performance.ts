import type { TradeRecord } from "./tradeTracker"

export type PerformancePeriod =
  | "ALL"
  | "TODAY"
  | "7D"
  | "30D"
  | "THIS_MONTH"
  | "CUSTOM"

export type PerformanceSummary = {
  totalTrades: number
  closedTrades: number
  winningTrades: number
  losingTrades: number
  breakEvenTrades: number

  winRate: number
  lossRate: number

  grossProfit: number
  grossLoss: number
  netProfit: number

  averageWin: number
  averageLoss: number

  bestTrade: number
  worstTrade: number

  profitFactor: number
  expectancy: number

  maxDrawdown: number
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
}

export type SymbolPerformance = {
  symbol: string
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  grossProfit: number
  grossLoss: number
  netProfit: number
  profitFactor: number
}

export type PerformanceFilter = {
  period?: PerformancePeriod
  from?: string
  to?: string
}

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals))
}

function isClosedTrade(trade: TradeRecord): boolean {
  return (
    trade.status === "CLOSED" ||
    trade.status === "SL_HIT" ||
    trade.status === "CANCELLED"
  )
}

function getTradeDate(trade: TradeRecord): Date | null {
  const rawDate = trade.closedAt ?? trade.openedAt ?? trade.createdAt

  if (!rawDate) return null

  const date = new Date(rawDate)
  return Number.isNaN(date.getTime()) ? null : date
}

function getPeriodRange(filter?: PerformanceFilter) {
  const period = filter?.period ?? "ALL"
  const now = new Date()

  if (period === "ALL") {
    return { from: null as Date | null, to: null as Date | null }
  }

  if (period === "TODAY") {
    const from = new Date(now)
    from.setHours(0, 0, 0, 0)

    const to = new Date(now)
    to.setHours(23, 59, 59, 999)

    return { from, to }
  }

  if (period === "7D") {
    const from = new Date(now)
    from.setDate(now.getDate() - 7)
    return { from, to: now }
  }

  if (period === "30D") {
    const from = new Date(now)
    from.setDate(now.getDate() - 30)
    return { from, to: now }
  }

  if (period === "THIS_MONTH") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now)
    return { from, to }
  }

  if (period === "CUSTOM") {
    const from = filter?.from ? new Date(filter.from) : null
    const to = filter?.to ? new Date(filter.to) : null

    return {
      from: from && !Number.isNaN(from.getTime()) ? from : null,
      to: to && !Number.isNaN(to.getTime()) ? to : null
    }
  }

  return { from: null as Date | null, to: null as Date | null }
}

export function filterTradesByPeriod(
  trades: TradeRecord[],
  filter?: PerformanceFilter
): TradeRecord[] {
  const { from, to } = getPeriodRange(filter)

  if (!from && !to) return trades

  return trades.filter((trade) => {
    const tradeDate = getTradeDate(trade)
    if (!tradeDate) return false

    if (from && tradeDate < from) return false
    if (to && tradeDate > to) return false

    return true
  })
}

function getClosedTrades(
  trades: TradeRecord[],
  filter?: PerformanceFilter
): TradeRecord[] {
  const filteredTrades = filterTradesByPeriod(trades, filter)

  return filteredTrades.filter(
    (trade) => isClosedTrade(trade) && typeof trade.pnl === "number"
  )
}

export function calculateWinRate(
  trades: TradeRecord[],
  filter?: PerformanceFilter
): number {
  const closedTrades = getClosedTrades(trades, filter)

  if (!closedTrades.length) return 0

  const wins = closedTrades.filter((trade) => safeNumber(trade.pnl) > 0).length
  return round((wins / closedTrades.length) * 100)
}

export function calculateProfitFactor(
  trades: TradeRecord[],
  filter?: PerformanceFilter
): number {
  const closedTrades = getClosedTrades(trades, filter)

  const grossProfit = closedTrades
    .filter((trade) => safeNumber(trade.pnl) > 0)
    .reduce((sum, trade) => sum + safeNumber(trade.pnl), 0)

  const grossLoss = Math.abs(
    closedTrades
      .filter((trade) => safeNumber(trade.pnl) < 0)
      .reduce((sum, trade) => sum + safeNumber(trade.pnl), 0)
  )

  if (grossLoss === 0) {
    return grossProfit > 0 ? Infinity : 0
  }

  return round(grossProfit / grossLoss)
}

export function calculateMaxDrawdown(
  trades: TradeRecord[],
  filter?: PerformanceFilter
): number {
  const closedTrades = getClosedTrades(trades, filter)

  let equity = 0
  let peak = 0
  let maxDrawdown = 0

  for (const trade of closedTrades) {
    equity += safeNumber(trade.pnl)

    if (equity > peak) {
      peak = equity
    }

    const drawdown = peak - equity

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
    }
  }

  return round(maxDrawdown, 4)
}

export function calculateConsecutiveStats(
  trades: TradeRecord[],
  filter?: PerformanceFilter
) {
  const closedTrades = getClosedTrades(trades, filter)

  let currentWins = 0
  let currentLosses = 0
  let maxConsecutiveWins = 0
  let maxConsecutiveLosses = 0

  for (const trade of closedTrades) {
    const pnl = safeNumber(trade.pnl)

    if (pnl > 0) {
      currentWins += 1
      currentLosses = 0
    } else if (pnl < 0) {
      currentLosses += 1
      currentWins = 0
    } else {
      currentWins = 0
      currentLosses = 0
    }

    if (currentWins > maxConsecutiveWins) {
      maxConsecutiveWins = currentWins
    }

    if (currentLosses > maxConsecutiveLosses) {
      maxConsecutiveLosses = currentLosses
    }
  }

  return {
    maxConsecutiveWins,
    maxConsecutiveLosses
  }
}

export function getNetPnlForPeriod(
  trades: TradeRecord[],
  filter?: PerformanceFilter
): number {
  const closedTrades = getClosedTrades(trades, filter)

  const netProfit = closedTrades.reduce(
    (sum, trade) => sum + safeNumber(trade.pnl),
    0
  )

  return round(netProfit, 4)
}

export function getPerformanceSummary(
  trades: TradeRecord[],
  filter?: PerformanceFilter
): PerformanceSummary {
  const closedTrades = getClosedTrades(trades, filter)
  const filteredTrades = filterTradesByPeriod(trades, filter)

  const winningTradesList = closedTrades.filter(
    (trade) => safeNumber(trade.pnl) > 0
  )

  const losingTradesList = closedTrades.filter(
    (trade) => safeNumber(trade.pnl) < 0
  )

  const breakEvenTradesList = closedTrades.filter(
    (trade) => safeNumber(trade.pnl) === 0
  )

  const grossProfit = winningTradesList.reduce(
    (sum, trade) => sum + safeNumber(trade.pnl),
    0
  )

  const grossLossSigned = losingTradesList.reduce(
    (sum, trade) => sum + safeNumber(trade.pnl),
    0
  )

  const grossLoss = Math.abs(grossLossSigned)
  const netProfit = grossProfit + grossLossSigned

  const averageWin =
    winningTradesList.length > 0
      ? grossProfit / winningTradesList.length
      : 0

  const averageLoss =
    losingTradesList.length > 0
      ? grossLoss / losingTradesList.length
      : 0

  const bestTrade =
    closedTrades.length > 0
      ? Math.max(...closedTrades.map((trade) => safeNumber(trade.pnl)))
      : 0

  const worstTrade =
    closedTrades.length > 0
      ? Math.min(...closedTrades.map((trade) => safeNumber(trade.pnl)))
      : 0

  const profitFactor =
    grossLoss === 0
      ? grossProfit > 0
        ? Infinity
        : 0
      : grossProfit / grossLoss

  const expectancy =
    closedTrades.length > 0 ? netProfit / closedTrades.length : 0

  const { maxConsecutiveWins, maxConsecutiveLosses } =
    calculateConsecutiveStats(closedTrades)

  const winningTrades = winningTradesList.length
  const losingTrades = losingTradesList.length
  const breakEvenTrades = breakEvenTradesList.length

  const winRate =
    closedTrades.length > 0
      ? (winningTrades / closedTrades.length) * 100
      : 0

  const lossRate =
    closedTrades.length > 0
      ? (losingTrades / closedTrades.length) * 100
      : 0

  return {
    totalTrades: filteredTrades.length,
    closedTrades: closedTrades.length,
    winningTrades,
    losingTrades,
    breakEvenTrades,

    winRate: round(winRate),
    lossRate: round(lossRate),

    grossProfit: round(grossProfit, 4),
    grossLoss: round(grossLoss, 4),
    netProfit: round(netProfit, 4),

    averageWin: round(averageWin, 4),
    averageLoss: round(averageLoss, 4),

    bestTrade: round(bestTrade, 4),
    worstTrade: round(worstTrade, 4),

    profitFactor:
      profitFactor === Infinity ? Infinity : round(profitFactor),
    expectancy: round(expectancy, 4),

    maxDrawdown: calculateMaxDrawdown(closedTrades),
    maxConsecutiveWins,
    maxConsecutiveLosses
  }
}

export function getPerformanceBySymbol(
  trades: TradeRecord[],
  filter?: PerformanceFilter
): SymbolPerformance[] {
  const closedTrades = getClosedTrades(trades, filter)

  const grouped = new Map<string, TradeRecord[]>()

  for (const trade of closedTrades) {
    const symbol = trade.symbol

    if (!grouped.has(symbol)) {
      grouped.set(symbol, [])
    }

    grouped.get(symbol)!.push(trade)
  }

  const results: SymbolPerformance[] = []

  for (const [symbol, symbolTrades] of grouped.entries()) {
    const winningTrades = symbolTrades.filter(
      (trade) => safeNumber(trade.pnl) > 0
    ).length

    const losingTrades = symbolTrades.filter(
      (trade) => safeNumber(trade.pnl) < 0
    ).length

    const grossProfit = symbolTrades
      .filter((trade) => safeNumber(trade.pnl) > 0)
      .reduce((sum, trade) => sum + safeNumber(trade.pnl), 0)

    const grossLoss = Math.abs(
      symbolTrades
        .filter((trade) => safeNumber(trade.pnl) < 0)
        .reduce((sum, trade) => sum + safeNumber(trade.pnl), 0)
    )

    const netProfit = symbolTrades.reduce(
      (sum, trade) => sum + safeNumber(trade.pnl),
      0
    )

    const winRate =
      symbolTrades.length > 0
        ? (winningTrades / symbolTrades.length) * 100
        : 0

    const profitFactor =
      grossLoss === 0
        ? grossProfit > 0
          ? Infinity
          : 0
        : grossProfit / grossLoss

    results.push({
      symbol,
      totalTrades: symbolTrades.length,
      winningTrades,
      losingTrades,
      winRate: round(winRate),
      grossProfit: round(grossProfit, 4),
      grossLoss: round(grossLoss, 4),
      netProfit: round(netProfit, 4),
      profitFactor:
        profitFactor === Infinity ? Infinity : round(profitFactor)
    })
  }

  return results.sort((a, b) => b.netProfit - a.netProfit)
}