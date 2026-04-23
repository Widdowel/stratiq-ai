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

function shouldCloseBuyTrade(
  trade: TradeRecord,
  currentPrice: number
): TradeCloseReason | null {
  if (currentPrice <= trade.sl) return "SL"
  if (currentPrice >= trade.tp) return "TP"
  return null
}

function shouldCloseSellTrade(
  trade: TradeRecord,
  currentPrice: number
): TradeCloseReason | null {
  if (currentPrice >= trade.sl) return "SL"
  if (currentPrice <= trade.tp) return "TP"
  return null
}

function getTradeCloseReason(
  trade: TradeRecord,
  currentPrice: number
): TradeCloseReason | null {
  if (!hasValidTradeLevels(trade)) {
    return null
  }

  if (trade.direction === "BUY") {
    return shouldCloseBuyTrade(trade, currentPrice)
  }

  if (trade.direction === "SELL") {
    return shouldCloseSellTrade(trade, currentPrice)
  }

  return null
}

function closeTradeIfNeeded(
  trade: TradeRecord,
  currentPrice: number
) {
  const closeReason = getTradeCloseReason(trade, currentPrice)

  if (!closeReason) {
    return null
  }

  return closeTrade(trade.id, currentPrice, closeReason)
}

export function monitorOpenTrades(
  livePrices: LivePriceBook
): TradeRecord[] {
  const openTrades = getOpenTrades()
  const closedTrades: TradeRecord[] = []

  for (const trade of openTrades) {
    const currentPrice = getTradeCurrentPrice(trade, livePrices)

    if (currentPrice === undefined) {
      continue
    }

    const updatedTrade = closeTradeIfNeeded(trade, currentPrice)

    if (updatedTrade) {
      closedTrades.push(updatedTrade)
    }
  }

  return closedTrades
}

export function monitorOpenTradesDetailed(
  livePrices: LivePriceBook
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

    const updatedTrade = closeTradeIfNeeded(trade, currentPrice)

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

export type { LivePriceBook, TradeCloseReason, MonitorResult }