import { analyzeMarketRegime } from "@/lib/regimeEngine"
import { analyzeStructure } from "@/lib/structureEngine"
import { analyzeLiquidity } from "@/lib/liquidityEngine"
import {
  analyzeVolatility,
  buildVolatilityTargets
} from "@/lib/volatilityEngine"

/* =========================
SIGNAL TYPES
========================= */

export type SignalDirection = "BUY" | "SELL"
export type SignalTimeframe = "SHORT" | "MEDIUM" | "LONG"

export type Signal = {
  symbol: string
  timeframe: SignalTimeframe
  direction: SignalDirection
  entry: number
  tp: number
  sl: number
  confidence: number
}

export type Candle = {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type MarketContext = {
  trendCandles: Candle[]
  confirmCandles: Candle[]
  entryCandles: Candle[]
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
INTERNAL THRESHOLDS
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

function getConfidenceFloor(timeframe: SignalTimeframe) {
  if (timeframe === "SHORT") return 70
  if (timeframe === "MEDIUM") return 72
  return 75
}

/* =========================
LOCAL MARKET HELPERS
========================= */

function getMove(candles: Candle[], lookback: number) {
  if (candles.length <= lookback) return 0

  const last = safeNumber(candles[candles.length - 1]?.close)
  const prev = safeNumber(candles[candles.length - 1 - lookback]?.close)

  if (!last || !prev) return 0
  return (last - prev) / prev
}

function getRecentMomentum(candles: Candle[]) {
  if (candles.length < 5) return 0

  const last = safeNumber(candles[candles.length - 1]?.close)
  const prev = safeNumber(candles[candles.length - 4]?.close)

  if (!last || !prev) return 0
  return (last - prev) / prev
}

function getVolumeBias(candles: Candle[]) {
  if (candles.length < 10) return 0

  const recent = candles.slice(-5).map((c) => safeNumber(c.volume))
  const old = candles.slice(-10, -5).map((c) => safeNumber(c.volume))

  const recentAvg = avg(recent)
  const oldAvg = avg(old)

  if (!recentAvg || !oldAvg) return 0
  return (recentAvg - oldAvg) / oldAvg
}

/* =========================
EMA + ADX TREND HELPERS
========================= */

function calculateEMA(values: number[], period: number): number {
  if (values.length < period) return 0

  const k = 2 / (period + 1)
  // Seed with simple average of first `period` values, then walk forward.
  let ema = avg(values.slice(0, period))

  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k)
  }

  return ema
}

function calculateADX(candles: Candle[], period = 14): number {
  if (candles.length < period * 2 + 1) return 0

  const plusDM: number[] = []
  const minusDM: number[] = []
  const tr: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const p = candles[i - 1]

    const upMove = safeNumber(c.high) - safeNumber(p.high)
    const downMove = safeNumber(p.low) - safeNumber(c.low)

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0)
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0)

    const highLow = safeNumber(c.high) - safeNumber(c.low)
    const highPrevClose = Math.abs(safeNumber(c.high) - safeNumber(p.close))
    const lowPrevClose = Math.abs(safeNumber(c.low) - safeNumber(p.close))
    tr.push(Math.max(highLow, highPrevClose, lowPrevClose))
  }

  if (tr.length < period) return 0

  const smooth = (arr: number[]) => {
    const slice = arr.slice(-period)
    return slice.reduce((s, v) => s + v, 0)
  }

  const atr = smooth(tr)
  if (atr <= 0) return 0

  const plusDI = 100 * (smooth(plusDM) / atr)
  const minusDI = 100 * (smooth(minusDM) / atr)

  const di = plusDI + minusDI
  if (di <= 0) return 0

  return (Math.abs(plusDI - minusDI) / di) * 100
}

function detectTrend(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
): SignalDirection | "NEUTRAL" {
  // Needs enough data for EMA50 and ADX14 warmup.
  if (candles.length < 60) return "NEUTRAL"

  const closes = candles.map((c) => safeNumber(c.close)).filter((v) => v > 0)
  if (closes.length < 60) return "NEUTRAL"

  const ema20 = calculateEMA(closes, 20)
  const ema50 = calculateEMA(closes, 50)
  const adx = calculateADX(candles, 14)

  const move = getMove(candles, 12)
  const momentum = getRecentMomentum(candles)
  const threshold = getTrendThreshold(symbol, timeframe)

  // ADX < 20 = no clear trend, reject (classic threshold).
  if (adx < 20) return "NEUTRAL"

  const bullishStructure =
    ema20 > ema50 && move > threshold && momentum > 0
  const bearishStructure =
    ema20 < ema50 && move < -threshold && momentum < 0

  if (bullishStructure) return "BUY"
  if (bearishStructure) return "SELL"

  return "NEUTRAL"
}

function detectEntryMomentum(
  candles: Candle[],
  symbol: string,
  timeframe: SignalTimeframe
): SignalDirection | "NEUTRAL" {
  if (candles.length < 8) return "NEUTRAL"

  const move = getMove(candles, 4)
  const threshold = getTrendThreshold(symbol, timeframe) * 0.3

  if (move > threshold) return "BUY"
  if (move < -threshold) return "SELL"
  return "NEUTRAL"
}

function isLateEntry(candles: Candle[], timeframe: SignalTimeframe) {
  if (candles.length < 6) return true

  const closes = candles.slice(-6).map((c) => safeNumber(c.close))
  if (closes.some((v) => !v)) return true

  const totalMove = Math.abs(closes[5] - closes[0]) / closes[0]
  const lastMove = Math.abs(closes[5] - closes[4]) / closes[4]

  const maxMove =
    timeframe === "SHORT" ? 0.06 : timeframe === "MEDIUM" ? 0.08 : 0.11

  const maxLastMove =
    timeframe === "SHORT" ? 0.025 : timeframe === "MEDIUM" ? 0.035 : 0.045

  return totalMove > maxMove || lastMove > maxLastMove
}

function hasFakeBreakout(candles: Candle[], timeframe: SignalTimeframe) {
  if (candles.length < 8) return true

  const last = safeNumber(candles[candles.length - 1]?.close)
  const prev = safeNumber(candles[candles.length - 2]?.close)
  const prev2 = safeNumber(candles[candles.length - 3]?.close)

  if (!last || !prev || !prev2) return true

  const oneCandleMove = Math.abs(last - prev) / prev
  const twoCandleMove = Math.abs(last - prev2) / prev2

  const maxOneCandleMove =
    timeframe === "SHORT" ? 0.04 : timeframe === "MEDIUM" ? 0.05 : 0.06

  const maxTwoCandleMove =
    timeframe === "SHORT" ? 0.055 : timeframe === "MEDIUM" ? 0.07 : 0.09

  return oneCandleMove > maxOneCandleMove || twoCandleMove > maxTwoCandleMove
}

/* =========================
CONFIDENCE ENGINE
========================= */

function calculateConfidence(
  symbol: string,
  context: MarketContext,
  timeframe: SignalTimeframe,
  direction: SignalDirection
) {
  let score = 50

  const trendMove = Math.abs(getMove(context.trendCandles, 12))
  const confirmMove = Math.abs(getMove(context.confirmCandles, 8))
  const entryMove = Math.abs(getMove(context.entryCandles, 4))
  const volumeBias = getVolumeBias(context.entryCandles)

  const trendDirection = detectTrend(symbol, context.trendCandles, timeframe)
  const confirmDirection = detectTrend(symbol, context.confirmCandles, timeframe)
  const entryDirection = detectEntryMomentum(context.entryCandles, symbol, timeframe)

  const regime = analyzeMarketRegime(symbol, context.entryCandles, timeframe)
  const structure = analyzeStructure(
    symbol,
    context.entryCandles,
    timeframe,
    direction
  )
  const liquidity = analyzeLiquidity(symbol, context.entryCandles, timeframe)
  const volatility = analyzeVolatility(symbol, context.entryCandles, timeframe)

  if (trendDirection === direction) score += 14
  if (confirmDirection === direction) score += 14
  if (entryDirection === direction) score += 8
  else if (entryDirection === "NEUTRAL") score -= 2

  if (trendMove > getTrendThreshold(symbol, timeframe) * 1.05) score += 6
  if (confirmMove > getTrendThreshold(symbol, timeframe) * 0.75) score += 5
  if (entryMove > getTrendThreshold(symbol, timeframe) * 0.35) score += 4

  if (volumeBias > 0.03) score += 3
  if (volumeBias > 0.08) score += 2

  score += Math.round((regime.score - 50) * 0.18)
  score += Math.round((structure.score - 50) * 0.22)
  score += Math.round((liquidity.score - 50) * 0.14)
  score += Math.round((volatility.score - 50) * 0.16)

  if (direction === "BUY" && structure.validBuyZone) score += 6
  if (direction === "SELL" && structure.validSellZone) score += 6
  if (structure.retestValid) score += 4

  if (direction === "BUY" && liquidity.bullishLiquidityConfluence) score += 5
  if (direction === "SELL" && liquidity.bearishLiquidityConfluence) score += 5

  if (isLateEntry(context.entryCandles, timeframe)) score -= 6
  if (hasFakeBreakout(context.entryCandles, timeframe)) score -= 8

  return clamp(score, 0, 100)
}

/* =========================
BUILD SIGNAL
========================= */

function buildSignal(
  symbol: string,
  timeframe: SignalTimeframe,
  price: number,
  direction: SignalDirection,
  confidence: number,
  context: MarketContext
): Signal {
  const targets = buildVolatilityTargets(
    symbol,
    context.entryCandles,
    timeframe,
    direction,
    price
  )

  return {
    symbol,
    timeframe,
    direction,
    entry: Number(targets.entry.toFixed(4)),
    tp: Number(targets.tp.toFixed(4)),
    sl: Number(targets.sl.toFixed(4)),
    confidence
  }
}

function isSignalStructureValid(signal: Signal) {
  if (
    signal.entry <= 0 ||
    signal.tp <= 0 ||
    signal.sl <= 0 ||
    !Number.isFinite(signal.entry) ||
    !Number.isFinite(signal.tp) ||
    !Number.isFinite(signal.sl)
  ) {
    return false
  }

  if (signal.direction === "BUY") {
    return signal.tp > signal.entry && signal.sl < signal.entry
  }

  return signal.tp < signal.entry && signal.sl > signal.entry
}

/* =========================
MAIN GENERATOR
========================= */

export function generateSignals(
  symbol: string,
  context: MarketContext,
  selectedTimeframe: SignalTimeframe
): Signal[] {
  if (
    context.trendCandles.length < 20 ||
    context.confirmCandles.length < 20 ||
    context.entryCandles.length < 20
  ) {
    return []
  }

  const trendDirection = detectTrend(
    symbol,
    context.trendCandles,
    selectedTimeframe
  )
  const confirmDirection = detectTrend(
    symbol,
    context.confirmCandles,
    selectedTimeframe
  )
  const entryDirection = detectEntryMomentum(
    context.entryCandles,
    symbol,
    selectedTimeframe
  )

  if (trendDirection === "NEUTRAL") return []
  if (confirmDirection === "NEUTRAL") return []
  if (trendDirection !== confirmDirection) return []

  const direction = trendDirection
  const regime = analyzeMarketRegime(
    symbol,
    context.entryCandles,
    selectedTimeframe
  )
  const volatility = analyzeVolatility(
    symbol,
    context.entryCandles,
    selectedTimeframe
  )

  if (!regime.tradable) return []
  if (!volatility.tradable) return []

  const lastPrice = safeNumber(
    context.entryCandles[context.entryCandles.length - 1]?.close
  )
  if (!lastPrice) return []

  let confidence = calculateConfidence(
    symbol,
    context,
    selectedTimeframe,
    direction
  )

  if (entryDirection === "NEUTRAL") confidence -= 2
  confidence = clamp(confidence, 0, 100)

  if (confidence < getConfidenceFloor(selectedTimeframe)) {
    return []
  }

  const signal = buildSignal(
    symbol,
    selectedTimeframe,
    lastPrice,
    direction,
    confidence,
    context
  )

  if (!isSignalStructureValid(signal)) {
    return []
  }

  return [signal]
}