/* =========================
REGIME TYPES
========================= */

export type SignalTimeframe = "SHORT" | "MEDIUM" | "LONG"

export type Candle = {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type MarketRegime =
  | "TRENDING"
  | "RANGING"
  | "CHOPPY"
  | "VOLATILE"
  | "UNTRADABLE"

export type VolatilityState =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "EXTREME"

export type RegimeDirection =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL"

export type RegimeAnalysis = {
  regime: MarketRegime
  direction: RegimeDirection
  volatility: VolatilityState
  tradable: boolean
  score: number
  reasons: string[]
  metrics: {
    trendMove: number
    momentum: number
    atrPercent: number
    rangePercent: number
    directionChanges: number
  }
}

/* =========================
UTILS
========================= */

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function avg(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/* =========================
THRESHOLDS
========================= */

function getTrendThreshold(symbol: string, timeframe: SignalTimeframe) {
  if (symbol === "XAUUSD" || symbol === "XAUUSDT") {
    return timeframe === "SHORT"
      ? 0.0016
      : timeframe === "MEDIUM"
      ? 0.0028
      : 0.0045
  }

  if (symbol === "EURUSD" || symbol === "GBPUSD") {
    return timeframe === "SHORT"
      ? 0.0006
      : timeframe === "MEDIUM"
      ? 0.0011
      : 0.0018
  }

  if (symbol.endsWith("USDT")) {
    return timeframe === "SHORT"
      ? 0.0025
      : timeframe === "MEDIUM"
      ? 0.0045
      : 0.008
  }

  return 0.0012
}

function getLowVolThreshold(symbol: string, timeframe: SignalTimeframe) {
  return getTrendThreshold(symbol, timeframe) * 0.55
}

function getHighVolThreshold(symbol: string, timeframe: SignalTimeframe) {
  return getTrendThreshold(symbol, timeframe) * 2.3
}

function getExtremeVolThreshold(symbol: string, timeframe: SignalTimeframe) {
  return getTrendThreshold(symbol, timeframe) * 3.8
}

/* =========================
CORE METRICS
========================= */

export function getMove(candles: Candle[], lookback: number) {
  if (candles.length <= lookback) return 0

  const last = safeNumber(candles[candles.length - 1]?.close)
  const prev = safeNumber(candles[candles.length - 1 - lookback]?.close)

  if (!last || !prev) return 0
  return (last - prev) / prev
}

export function getRecentMomentum(candles: Candle[]) {
  if (candles.length < 5) return 0

  const last = safeNumber(candles[candles.length - 1]?.close)
  const prev = safeNumber(candles[candles.length - 4]?.close)

  if (!last || !prev) return 0
  return (last - prev) / prev
}

export function calculateATRPercent(candles: Candle[], period = 14) {
  if (candles.length < period + 1) return 0

  const trueRanges: number[] = []

  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i]
    const p = candles[i - 1]

    const high = safeNumber(c?.high)
    const low = safeNumber(c?.low)
    const prevClose = safeNumber(p?.close)

    if (!high || !low || !prevClose) continue

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    )

    trueRanges.push(tr / prevClose)
  }

  return avg(trueRanges)
}

export function getRangePercent(candles: Candle[], lookback = 12) {
  if (candles.length < lookback) return 0

  const slice = candles.slice(-lookback)
  const highs = slice.map((c) => safeNumber(c.high)).filter((v) => v > 0)
  const lows = slice.map((c) => safeNumber(c.low)).filter((v) => v > 0)

  if (highs.length < lookback || lows.length < lookback) return 0

  const high = Math.max(...highs)
  const low = Math.min(...lows)

  if (!high || !low) return 0
  return (high - low) / low
}

export function getDirectionChanges(candles: Candle[], lookback = 12) {
  if (candles.length < lookback) return 0

  let directionChanges = 0
  const slice = candles.slice(-lookback)

  for (let i = 2; i < slice.length; i++) {
    const a = safeNumber(slice[i]?.close) - safeNumber(slice[i - 1]?.close)
    const b = safeNumber(slice[i - 1]?.close) - safeNumber(slice[i - 2]?.close)

    if (!a || !b) continue
    if (a * b < 0) directionChanges++
  }

  return directionChanges
}

/* =========================
VOLATILITY
========================= */

export function getVolatilityState(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
): VolatilityState {
  const atrPercent = calculateATRPercent(candles, 14)

  if (atrPercent <= 0) return "LOW"
  if (atrPercent < getLowVolThreshold(symbol, timeframe)) return "LOW"
  if (atrPercent > getExtremeVolThreshold(symbol, timeframe)) return "EXTREME"
  if (atrPercent > getHighVolThreshold(symbol, timeframe)) return "HIGH"

  return "NORMAL"
}

/* =========================
REGIME HELPERS
========================= */

export function detectRegimeDirection(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
): RegimeDirection {
  if (candles.length < 20) return "NEUTRAL"

  const trendMove = getMove(candles, 12)
  const momentum = getRecentMomentum(candles)
  const threshold = getTrendThreshold(symbol, timeframe)

  if (trendMove > threshold && momentum > 0) return "BULLISH"
  if (trendMove < -threshold && momentum < 0) return "BEARISH"

  return "NEUTRAL"
}

export function isFlatMarket(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
) {
  if (candles.length < 12) return true

  const rangePercent = getRangePercent(candles, 12)
  const threshold = getTrendThreshold(symbol, timeframe) * 0.7

  return rangePercent < threshold
}

export function isChoppyMarket(candles: Candle[]) {
  if (candles.length < 12) return true
  return getDirectionChanges(candles, 12) >= 8
}

export function isExplosiveMarket(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
) {
  const atrPercent = calculateATRPercent(candles, 14)
  return atrPercent > getExtremeVolThreshold(symbol, timeframe)
}

export function isTradableRegime(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
) {
  if (candles.length < 20) return false
  if (isExplosiveMarket(symbol, candles, timeframe)) return false
  if (isFlatMarket(symbol, candles, timeframe) && isChoppyMarket(candles)) {
    return false
  }

  return true
}

/* =========================
FULL ANALYSIS
========================= */

export function analyzeMarketRegime(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
): RegimeAnalysis {
  const reasons: string[] = []

  if (candles.length < 20) {
    return {
      regime: "UNTRADABLE",
      direction: "NEUTRAL",
      volatility: "LOW",
      tradable: false,
      score: 0,
      reasons: ["NOT_ENOUGH_CANDLES"],
      metrics: {
        trendMove: 0,
        momentum: 0,
        atrPercent: 0,
        rangePercent: 0,
        directionChanges: 0
      }
    }
  }

  const signedTrendMove = getMove(candles, 12)
  const trendMove = Math.abs(signedTrendMove)
  const signedMomentum = getRecentMomentum(candles)
  const momentum = Math.abs(signedMomentum)
  const atrPercent = calculateATRPercent(candles, 14)
  const rangePercent = getRangePercent(candles, 12)
  const directionChanges = getDirectionChanges(candles, 12)

  const direction = detectRegimeDirection(symbol, candles, timeframe)
  const volatility = getVolatilityState(symbol, candles, timeframe)

  const flatMarket = isFlatMarket(symbol, candles, timeframe)
  const choppyMarket = isChoppyMarket(candles)
  const explosiveMarket = isExplosiveMarket(symbol, candles, timeframe)

  let regime: MarketRegime = "RANGING"
  let tradable = true
  let score = 55

  if (explosiveMarket) {
    regime = "UNTRADABLE"
    tradable = false
    score -= 35
    reasons.push("EXTREME_VOLATILITY")
  } else if (flatMarket && choppyMarket) {
    regime = "UNTRADABLE"
    tradable = false
    score -= 35
    reasons.push("FLAT_AND_CHOPPY")
  } else if (choppyMarket) {
    regime = "CHOPPY"
    score -= 18
    reasons.push("CHOPPY_MARKET")
  } else if (direction !== "NEUTRAL") {
    regime = "TRENDING"
    score += 18
    reasons.push("TREND_CONFIRMED")
  } else if (volatility === "HIGH") {
    regime = "VOLATILE"
    score += 4
    reasons.push("VOLATILE_BUT_ACTIVE")
  } else {
    regime = "RANGING"
    score -= 6
    reasons.push("RANGING_MARKET")
  }

  if (volatility === "LOW") {
    score -= 8
    reasons.push("LOW_VOLATILITY")
  }

  if (volatility === "NORMAL") {
    score += 8
    reasons.push("NORMAL_VOLATILITY")
  }

  if (volatility === "HIGH") {
    score += 3
    reasons.push("HIGH_VOLATILITY")
  }

  if (trendMove > getTrendThreshold(symbol, timeframe) * 1.15) {
    score += 8
    reasons.push("STRONG_TREND_MOVE")
  }

  if (momentum > getTrendThreshold(symbol, timeframe) * 0.45) {
    score += 6
    reasons.push("STRONG_MOMENTUM")
  }

  if (directionChanges <= 3) {
    score += 7
    reasons.push("CLEAN_PRICE_ACTION")
  }

  if (directionChanges >= 7) {
    score -= 8
    reasons.push("EXCESSIVE_DIRECTION_CHANGES")
  }

  if (flatMarket && !choppyMarket) {
    score -= 6
    reasons.push("COMPRESSED_RANGE")
  }

  if (!tradable && regime !== "UNTRADABLE") {
    regime = "UNTRADABLE"
  }

  score = clamp(score, 0, 100)

  return {
    regime,
    direction,
    volatility,
    tradable,
    score,
    reasons,
    metrics: {
      trendMove,
      momentum,
      atrPercent,
      rangePercent,
      directionChanges
    }
  }
}