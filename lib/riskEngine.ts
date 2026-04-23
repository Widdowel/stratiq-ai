/* =========================
RISK CONFIG
========================= */

const MAX_OPEN_TRADES = 5
const MAX_SYMBOL_EXPOSURE = 1
const MAX_CRYPTO_TRADES = 2
const MAX_FOREX_TRADES = 1
const MAX_GOLD_TRADES = 1

const MIN_CONFIDENCE_REQUIRED = 70

/* =========================
TRADE TYPE
========================= */

export type Trade = {
  symbol: string
  direction: "BUY" | "SELL"
  confidence: number
  positionSize?: number
}

/* =========================
RISK RESULT TYPE
========================= */

export type RiskResult = {
  allowed: boolean
  positionSize: number
  reason?: string
}

/* =========================
MARKET GROUP HELPERS
========================= */

function isGoldSymbol(symbol: string) {
  return symbol === "XAUUSD" || symbol === "XAUUSDT"
}

function isForexSymbol(symbol: string) {
  return symbol === "EURUSD" || symbol === "GBPUSD"
}

function isCryptoSymbol(symbol: string) {
  return symbol.endsWith("USDT") && !isGoldSymbol(symbol)
}

/* =========================
POSITION SIZE MODEL
========================= */

function getBasePositionSize(confidence: number) {
  if (confidence >= 90) return 1.25
  if (confidence >= 85) return 1.1
  if (confidence >= 80) return 1
  if (confidence >= 75) return 0.9
  if (confidence >= 70) return 0.8
  return 0
}

/* =========================
CORRELATION / EXPOSURE CHECKS
========================= */

function hasOppositeTradeOnSameSymbol(
  currentTrades: Trade[],
  newTrade: Trade
) {
  return currentTrades.some(
    (trade) =>
      trade.symbol === newTrade.symbol &&
      trade.direction !== newTrade.direction
  )
}

function countCryptoTrades(currentTrades: Trade[]) {
  return currentTrades.filter((trade) => isCryptoSymbol(trade.symbol)).length
}

function countForexTrades(currentTrades: Trade[]) {
  return currentTrades.filter((trade) => isForexSymbol(trade.symbol)).length
}

function countGoldTrades(currentTrades: Trade[]) {
  return currentTrades.filter((trade) => isGoldSymbol(trade.symbol)).length
}

/* =========================
EVALUATE PORTFOLIO RISK
========================= */

export function evaluateRisk(
  currentTrades: Trade[],
  newTrade: Trade
): RiskResult {
  if (currentTrades.length >= MAX_OPEN_TRADES) {
    return {
      allowed: false,
      positionSize: 0,
      reason: "MAX_OPEN_TRADES_REACHED"
    }
  }

  const sameSymbolTrades = currentTrades.filter(
    (trade) => trade.symbol === newTrade.symbol
  )

  if (sameSymbolTrades.length >= MAX_SYMBOL_EXPOSURE) {
    return {
      allowed: false,
      positionSize: 0,
      reason: "SYMBOL_EXPOSURE_LIMIT"
    }
  }

  if (hasOppositeTradeOnSameSymbol(currentTrades, newTrade)) {
    return {
      allowed: false,
      positionSize: 0,
      reason: "OPPOSITE_TRADE_ALREADY_OPEN"
    }
  }

  if (newTrade.confidence < MIN_CONFIDENCE_REQUIRED) {
    return {
      allowed: false,
      positionSize: 0,
      reason: "CONFIDENCE_TOO_LOW"
    }
  }

  if (isCryptoSymbol(newTrade.symbol)) {
    if (countCryptoTrades(currentTrades) >= MAX_CRYPTO_TRADES) {
      return {
        allowed: false,
        positionSize: 0,
        reason: "CRYPTO_EXPOSURE_LIMIT"
      }
    }
  }

  if (isForexSymbol(newTrade.symbol)) {
    if (countForexTrades(currentTrades) >= MAX_FOREX_TRADES) {
      return {
        allowed: false,
        positionSize: 0,
        reason: "FOREX_EXPOSURE_LIMIT"
      }
    }
  }

  if (isGoldSymbol(newTrade.symbol)) {
    if (countGoldTrades(currentTrades) >= MAX_GOLD_TRADES) {
      return {
        allowed: false,
        positionSize: 0,
        reason: "GOLD_EXPOSURE_LIMIT"
      }
    }
  }

  let positionSize = getBasePositionSize(newTrade.confidence)

  if (positionSize <= 0) {
    return {
      allowed: false,
      positionSize: 0,
      reason: "INVALID_POSITION_SIZE"
    }
  }

  if (currentTrades.length >= 3) {
    positionSize *= 0.9
  }

  if (currentTrades.length >= 4) {
    positionSize *= 0.8
  }

  return {
    allowed: true,
    positionSize: Number(positionSize.toFixed(2))
  }
}