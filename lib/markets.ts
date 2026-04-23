/* =========================
MARKET TYPES
========================= */

export type MarketType = "crypto" | "forex" | "gold"

/* =========================
SCAN TIMEFRAME
========================= */

export type ScanTimeframe = "SHORT" | "MEDIUM" | "LONG"

/* =========================
MARKET STRUCTURE
========================= */

export type Market = {
  symbol: string
  type: MarketType
}

/* =========================
MULTI-TF CONFIG
========================= */

export type TimeframeContextConfig = {
  trend: string
  confirm: string
  entry: string
}

export function getTimeframeContextConfig(
  timeframe: ScanTimeframe
): TimeframeContextConfig {
  if (timeframe === "SHORT") {
    return {
      trend: "1h",
      confirm: "15m",
      entry: "15m"
    }
  }

  if (timeframe === "MEDIUM") {
    return {
      trend: "1h",
      confirm: "1h",
      entry: "15m"
    }
  }

  return {
    trend: "4h",
    confirm: "1h",
    entry: "1h"
  }
}

/* =========================
TRADED MARKETS
========================= */

export const markets: Market[] = [
  /* CRYPTO */
  { symbol: "BTCUSDT", type: "crypto" },

  /* FOREX */
  { symbol: "EURUSD", type: "forex" },
  { symbol: "GBPUSD", type: "forex" },

  /* GOLD */
  { symbol: "XAUUSD", type: "gold" }
]

/* =========================
SUPPORTED SYMBOLS
========================= */

export const supportedSymbols: string[] = markets.map(
  (market) => market.symbol
)

/* =========================
HELPERS
========================= */

export function isSupportedSymbol(symbol: string): boolean {
  return supportedSymbols.includes(symbol)
}

export function getMarketBySymbol(symbol: string): Market {
  const market = markets.find((m) => m.symbol === symbol)

  if (!market) {
    throw new Error(`Unknown symbol: ${symbol}`)
  }

  return market
}

export function getMarketType(symbol: string): MarketType {
  return getMarketBySymbol(symbol).type
}

/* =========================
GROUP HELPERS
========================= */

export function getCryptoMarkets(): Market[] {
  return markets.filter((m) => m.type === "crypto")
}

export function getForexMarkets(): Market[] {
  return markets.filter((m) => m.type === "forex")
}

export function getGoldMarkets(): Market[] {
  return markets.filter((m) => m.type === "gold")
}

/* =========================
SYMBOL HELPERS
========================= */

export function isCryptoSymbol(symbol: string): boolean {
  return symbol.endsWith("USDT") && symbol !== "XAUUSDT"
}

export function isForexSymbol(symbol: string): boolean {
  return symbol === "EURUSD" || symbol === "GBPUSD"
}

export function isGoldSymbol(symbol: string): boolean {
  return symbol === "XAUUSD" || symbol === "XAUUSDT"
}