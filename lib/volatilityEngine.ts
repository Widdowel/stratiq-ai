/* =========================
VOLATILITY TYPES
========================= */

export type SignalDirection = "BUY" | "SELL"
export type SignalTimeframe = "SHORT" | "MEDIUM" | "LONG"

export type Candle = {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type VolatilityState =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "EXTREME"

export type VolatilityAnalysis = {
  atrPercent: number
  realizedVolatility: number
  state: VolatilityState
  stopPercent: number
  rrTarget: number
  tradable: boolean
  score: number
  reasons: string[]
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

function stdev(values: number[]) {
  if (values.length < 2) return 0

  const mean = avg(values)
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length

  return Math.sqrt(variance)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/* =========================
SYMBOL CONFIG
========================= */

function getBaseVolThreshold(symbol: string, timeframe: SignalTimeframe) {
  if (symbol === "XAUUSD" || symbol === "XAUUSDT") {
    return timeframe === "SHORT"
      ? 0.0018
      : timeframe === "MEDIUM"
      ? 0.003
      : 0.0048
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

export function getAtrMultiplier(timeframe: SignalTimeframe) {
  if (timeframe === "SHORT") return 1.7
  if (timeframe === "MEDIUM") return 2.1
  return 2.6
}

export function getMinimumSLPercent(
  symbol: string,
  timeframe: SignalTimeframe
) {
  if (symbol === "EURUSD" || symbol === "GBPUSD") {
    return timeframe === "SHORT"
      ? 0.003
      : timeframe === "MEDIUM"
      ? 0.005
      : 0.008
  }

  if (symbol === "XAUUSD" || symbol === "XAUUSDT") {
    return timeframe === "SHORT"
      ? 0.006
      : timeframe === "MEDIUM"
      ? 0.01
      : 0.015
  }

  if (symbol.endsWith("USDT")) {
    return timeframe === "SHORT"
      ? 0.01
      : timeframe === "MEDIUM"
      ? 0.015
      : 0.025
  }

  return 0.01
}

export function getMaximumSLPercent(
  symbol: string,
  timeframe: SignalTimeframe
) {
  if (symbol === "EURUSD" || symbol === "GBPUSD") {
    return timeframe === "SHORT"
      ? 0.012
      : timeframe === "MEDIUM"
      ? 0.02
      : 0.03
  }

  if (symbol === "XAUUSD" || symbol === "XAUUSDT") {
    return timeframe === "SHORT"
      ? 0.025
      : timeframe === "MEDIUM"
      ? 0.04
      : 0.06
  }

  if (symbol.endsWith("USDT")) {
    return timeframe === "SHORT"
      ? 0.04
      : timeframe === "MEDIUM"
      ? 0.07
      : 0.12
  }

  return 0.03
}

export function getRRTarget(timeframe: SignalTimeframe) {
  if (timeframe === "SHORT") return 1.8
  if (timeframe === "MEDIUM") return 2.2
  return 2.8
}

/* =========================
ATR / REALIZED VOL
========================= */

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

export function calculateReturns(candles: Candle[], period = 14) {
  if (candles.length < period + 1) return []

  const returns: number[] = []

  for (let i = candles.length - period; i < candles.length; i++) {
    const current = safeNumber(candles[i]?.close)
    const previous = safeNumber(candles[i - 1]?.close)

    if (!current || !previous) continue
    returns.push((current - previous) / previous)
  }

  return returns
}

export function calculateRealizedVolatility(candles: Candle[], period = 14) {
  const returns = calculateReturns(candles, period)
  return stdev(returns)
}

/* =========================
VOL STATE
========================= */

export function getVolatilityState(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
): VolatilityState {
  const atrPercent = calculateATRPercent(candles, 14)
  const base = getBaseVolThreshold(symbol, timeframe)

  if (atrPercent <= 0) return "LOW"
  if (atrPercent < base * 0.65) return "LOW"
  if (atrPercent < base * 1.9) return "NORMAL"
  if (atrPercent < base * 3.4) return "HIGH"
  return "EXTREME"
}

export function isVolatilityTradable(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
) {
  const state = getVolatilityState(symbol, candles, timeframe)
  return state !== "EXTREME"
}

/* =========================
STOP / TARGET ENGINE
========================= */

export function getRecommendedStopPercent(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
) {
  const atrPercent = calculateATRPercent(candles, 14)
  const rawStop = atrPercent * getAtrMultiplier(timeframe)

  const minStop = getMinimumSLPercent(symbol, timeframe)
  const maxStop = getMaximumSLPercent(symbol, timeframe)

  return clamp(rawStop, minStop, maxStop)
}

export function buildVolatilityTargets(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe,
  direction: SignalDirection,
  entryPrice: number
) {
  const entry = safeNumber(entryPrice)

  if (!entry) {
    return {
      entry: 0,
      sl: 0,
      tp: 0,
      stopPercent: 0,
      rrTarget: 0
    }
  }

  const stopPercent = getRecommendedStopPercent(symbol, candles, timeframe)
  const rrTarget = getRRTarget(timeframe)

  let sl = 0
  let tp = 0

  if (direction === "BUY") {
    sl = entry * (1 - stopPercent)
    tp = entry + (entry - sl) * rrTarget
  } else {
    sl = entry * (1 + stopPercent)
    tp = entry - (sl - entry) * rrTarget
  }

  return {
    entry: Number(entry.toFixed(4)),
    sl: Number(sl.toFixed(4)),
    tp: Number(tp.toFixed(4)),
    stopPercent,
    rrTarget
  }
}

/* =========================
FULL ANALYSIS
========================= */

export function analyzeVolatility(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
): VolatilityAnalysis {
  const reasons: string[] = []

  if (candles.length < 20) {
    return {
      atrPercent: 0,
      realizedVolatility: 0,
      state: "LOW",
      stopPercent: 0,
      rrTarget: getRRTarget(timeframe),
      tradable: false,
      score: 0,
      reasons: ["NOT_ENOUGH_CANDLES"]
    }
  }

  const atrPercent = calculateATRPercent(candles, 14)
  const realizedVolatility = calculateRealizedVolatility(candles, 14)
  const state = getVolatilityState(symbol, candles, timeframe)
  const stopPercent = getRecommendedStopPercent(symbol, candles, timeframe)
  const rrTarget = getRRTarget(timeframe)

  let tradable = true
  let score = 55

  if (state === "LOW") {
    score -= 10
    reasons.push("LOW_VOLATILITY")
  }

  if (state === "NORMAL") {
    score += 10
    reasons.push("NORMAL_VOLATILITY")
  }

  if (state === "HIGH") {
    score += 5
    reasons.push("HIGH_VOLATILITY")
  }

  if (state === "EXTREME") {
    tradable = false
    score -= 30
    reasons.push("EXTREME_VOLATILITY")
  }

  if (atrPercent > 0 && realizedVolatility > 0) {
    score += 3
    reasons.push("VOLATILITY_MEASURED")
  }

  if (stopPercent > 0) {
    score += 4
    reasons.push("STOP_MODEL_READY")
  }

  score = clamp(score, 0, 100)

  return {
    atrPercent,
    realizedVolatility,
    state,
    stopPercent,
    rrTarget,
    tradable,
    score,
    reasons
  }
}