import {
  closeTrade,
  getOpenTrades,
  type TradeRecord
} from "@/lib/tradeTracker"

type LivePriceBook = {
  BINANCE: Record<string, number>
  TWELVEDATA: Record<string, number>
  MT5: Record<string, number>
}

type BarSnapshot = {
  high: number
  low: number
}

type LiveBarBook = {
  BINANCE: Record<string, BarSnapshot>
  TWELVEDATA: Record<string, BarSnapshot>
  MT5: Record<string, BarSnapshot>
}

type TradeCloseReason = "SL" | "TP"

type MonitorResult = {
  closedTrades: TradeRecord[]
  scannedTrades: number
  skippedTrades: number
}

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function isValidPositiveNumber(value: unknown): boolean {
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

function normalizePriceSource(
  source: unknown
): keyof LivePriceBook | null {
  if (source === "BINANCE") return "BINANCE"
  if (source === "TWELVEDATA") return "TWELVEDATA"
  if (source === "MT5") return "MT5"
  return null
}

function hasValidTradeLevels(trade: TradeRecord) {
  if (
    !isValidPositiveNumber(trade.entry) ||
    !isValidPositiveNumber(trade.tp) ||
    !isValidPositiveNumber(trade.sl)
  ) {
    return false
  }

  if (trade.direction === "BUY") {
    return trade.tp > trade.entry && trade.sl < trade.entry
  }

  if (trade.direction === "SELL") {
    return trade.tp < trade.entry && trade.sl > trade.entry
  }

  return false
}

function getTradeCurrentPrice(
  trade: TradeRecord,
  livePrices: LivePriceBook
): number | undefined {
  const source = normalizePriceSource(trade.priceSource)

  if (!source) return undefined
  if (!trade.symbol) return undefined

  const rawPrice = livePrices[source]?.[trade.symbol]
  const price = safeNumber(rawPrice)

  return price > 0 ? price : undefined
}

function getTradeBarSnapshot(
  trade: TradeRecord,
  liveBars?: LiveBarBook
): BarSnapshot | undefined {
  if (!liveBars) return undefined

  const source = normalizePriceSource(trade.priceSource)
  if (!source) return undefined
  if (!trade.symbol) return undefined

  const snap = liveBars[source]?.[trade.symbol]
  if (!snap) return undefined

  const high = safeNumber(snap.high)
  const low = safeNumber(snap.low)

  return high > 0 && low > 0 ? { high, low } : undefined
}

function shouldCloseBuyTrade(
  trade: TradeRecord,
  currentPrice: number,
  snap?: BarSnapshot
): TradeCloseReason | null {
  // Intra-bar detection when wick data is available.
  // If both TP and SL hit in same bar: conservative â†’ SL wins.
  if (snap) {
    const slHit = snap.low <= trade.sl
    const tpHit = snap.high >= trade.tp
    if (slHit) return "SL"
    if (tpHit) return "TP"
    return null
  }

  if (currentPrice <= trade.sl) return "SL"
  if (currentPrice >= trade.tp) return "TP"
  return null
}

function shouldCloseSellTrade(
  trade: TradeRecord,
  currentPrice: number,
  snap?: BarSnapshot
): TradeCloseReason | null {
  if (snap) {
    const slHit = snap.high >= trade.sl
    const tpHit = snap.low <= trade.tp
    if (slHit) return "SL"
    if (tpHit) return "TP"
    return null
  }

  if (currentPrice >= trade.sl) return "SL"
  if (currentPrice <= trade.tp) return "TP"
  return null
}

function getTradeCloseReason(
  trade: TradeRecord,
  currentPrice: number,
  snap?: BarSnapshot
): TradeCloseReason | null {
  if (!hasValidTradeLevels(trade)) {
    return null
  }

  if (trade.direction === "BUY") {
    return shouldCloseBuyTrade(trade, currentPrice, snap)
  }

  if (trade.direction === "SELL") {
    return shouldCloseSellTrade(trade, currentPrice, snap)
  }

  return null
}

function closeTradeIfNeeded(
  trade: TradeRecord,
  currentPrice: number,
  snap?: BarSnapshot
) {
  const closeReason = getTradeCloseReason(trade, currentPrice, snap)

  if (!closeReason) {
    return null
  }

  // On SL hit with wick data, close at the SL level (not mid-bar).
  // On TP hit, close at TP. Else close at currentPrice.
  let closePrice = currentPrice
  if (snap && closeReason === "SL") {
    closePrice = trade.sl
  } else if (snap && closeReason === "TP") {
    closePrice = trade.tp
  }

  return closeTrade(trade.id, closePrice, closeReason)
}

export function monitorOpenTrades(
  livePrices: LivePriceBook,
  liveBars?: LiveBarBook
): TradeRecord[] {
  const openTrades = getOpenTrades()
  const closedTrades: TradeRecord[] = []

  for (const trade of openTrades) {
    const currentPrice = getTradeCurrentPrice(trade, livePrices)

    if (currentPrice === undefined) {
      continue
    }

    const snap = getTradeBarSnapshot(trade, liveBars)
    const updatedTrade = closeTradeIfNeeded(trade, currentPrice, snap)

    if (updatedTrade) {
      closedTrades.push(updatedTrade)
    }
  }

  return closedTrades
}

export function monitorOpenTradesDetailed(
  livePrices: LivePriceBook,
  liveBars?: LiveBarBook
): MonitorResult {
  const openTrades = getOpenTrades()
  const closedTrades: TradeRecord[] = []
  let skippedTrades = 0

  for (const trade of openTrades) {
    const currentPrice = getTradeCurrentPrice(trade, livePrices)

    if (currentPrice === undefined || !hasValidTradeLevels(trade)) {
      skippedTrades += 1
      continue
    }

    const snap = getTradeBarSnapshot(trade, liveBars)
    const updatedTrade = closeTradeIfNeeded(trade, currentPrice, snap)

    if (updatedTrade) {
      closedTrades.push(updatedTrade)
    }
  }

  return {
    closedTrades,
    scannedTrades: openTrades.length,
    skippedTrades
  }
}

export function getCurrentPriceForTrade(
  trade: TradeRecord,
  livePrices: LivePriceBook
) {
  return getTradeCurrentPrice(trade, livePrices)
}

export type { LivePriceBook, LiveBarBook, BarSnapshot, TradeCloseReason, MonitorResult }