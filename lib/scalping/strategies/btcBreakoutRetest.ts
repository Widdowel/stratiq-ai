/* =========================
BTCUSDT - BREAKOUT + RETEST STRATEGY

Hypothesis:
  BTC alternates between compression (coiling range) and expansion
  (directional breakout). The highest-probability entry isn't the
  breakout candle itself - it's the retest of the broken level
  after the initial expansion.

Setup:
  1. HTF 1h bias: EMA20 > EMA50 (bullish) or EMA20 < EMA50 (bearish)
  2. 15m squeeze: Bollinger bandwidth is in the bottom 20% of the
     last 50 bars. Compression identified.
  3. 15m breakout candle: closes above BB upper (long) or below BB
     lower (short) AND volume >= 1.5x avg(20).
  4. 5m retest: after the breakout, price comes back to within N
     ticks of the broken level (upper band for long, lower for short).
  5. 5m rejection: bullish/bearish pin bar OR engulfing candle at
     the retest level.
  6. ADX(14) on 15m >= 20.

Invalidation:
  SL just beyond the retest candle's wick + 0.15% buffer (BTC
  needs some room above/below wicks because of frequent stop hunts).

Target:
  Fixed RR 1.8:1. Adaptive RR is applied later by enhancements/adaptiveRR.

Sessions:
  13:00 - 21:00 UTC (US hours, where BTC momentum peaks).
========================= */

import type { Candle } from "@/lib/providers"
import {
  ema,
  bollinger,
  isBollingerSqueeze,
  adx,
  isBullishPinBar,
  isBearishPinBar,
  isBullishEngulfing,
  isBearishEngulfing,
  volumeSpike
} from "@/lib/scalping/shared/indicators"
import {
  evaluateConfluence,
  gate,
  factor
} from "@/lib/scalping/shared/confluence"
import { isInScalpWindow } from "@/lib/scalping/shared/scalpSessions"
import type { ScalpSignal } from "@/lib/scalping/types"

/* =========================
CONFIG
========================= */

const CONFIDENCE_FLOOR = 83 // raised from 80 - filter out the noisiest setups
const SL_BUFFER_PCT = 0.0025 // 0.25% beyond retest wick - v5 MAE p25=-0.96 means
                              // 25% of trades wicked to full SL; widening by 0.1%
                              // gives room without blowing up worst-case loss
const RR_TARGET = 0.5 // ultra-scalp - MFE p50 is 0.80R so 0.5R hits ~70% of the time
const BE_TRIGGER_FRACTION = 0.3 // SL to entry at +0.3R, before the 0.5R TP
const BREAKOUT_LOOKBACK = 25 // how many 15m bars back to check for the breakout
const RETEST_TOLERANCE_PCT = 0.004 // price must come back within 0.4% of broken level
const MIN_ADX = 18
const MIN_RVOL = 1.4 // volume >= 1.4x avg(20) on breakout bar

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function findBreakoutBar(
  candles15m: Candle[],
  direction: "LONG" | "SHORT",
  lookback: number
): { index: number; level: number } | null {
  const closes = candles15m.map((c) => safeNumber(c.close)).filter((v) => v > 0)
  if (closes.length < 25) return null

  for (let i = candles15m.length - 1; i >= Math.max(0, candles15m.length - lookback); i--) {
    const subset = candles15m.slice(0, i + 1)
    if (subset.length < 20) continue

    const subsetCloses = subset.map((c) => safeNumber(c.close))
    const bb = bollinger(subsetCloses, 20, 2)
    if (!bb.upper || !bb.lower) continue

    const close = safeNumber(candles15m[i].close)
    const vol = volumeSpike(subset, 20, MIN_RVOL)

    if (direction === "LONG" && close > bb.upper && vol) {
      return { index: i, level: bb.upper }
    }
    if (direction === "SHORT" && close < bb.lower && vol) {
      return { index: i, level: bb.lower }
    }
  }

  return null
}

export type BtcEvalResult = {
  signal: ScalpSignal | null
  passed: boolean
  confidence: number
  failedGates: string[]
  prefligthFailed?: string
}

/**
 * Runs the BTC breakout + retest strategy on a fresh set of candles.
 * Returns a ScalpSignal or null.
 *
 *   candles1h    - HTF bias (>=60 bars recommended)
 *   candles15m   - squeeze + breakout detection (>=80 bars)
 *   candles5m    - retest + rejection pattern (>=20 bars)
 */
export function runBtcBreakoutRetest(
  symbol: string,
  candles1h: Candle[],
  candles15m: Candle[],
  candles5m: Candle[],
  now: Date = new Date()
): ScalpSignal | null {
  return evaluateBtc(symbol, candles1h, candles15m, candles5m, now).signal
}

/** Same logic but returns gate-level detail even on failure. */
export function runBtcBreakoutRetestDebug(
  symbol: string,
  candles1h: Candle[],
  candles15m: Candle[],
  candles5m: Candle[],
  now: Date = new Date()
): BtcEvalResult {
  return evaluateBtc(symbol, candles1h, candles15m, candles5m, now)
}

function preflightFail(reason: string): BtcEvalResult {
  return {
    signal: null,
    passed: false,
    confidence: 0,
    failedGates: [],
    prefligthFailed: reason
  }
}

function evaluateBtc(
  symbol: string,
  candles1h: Candle[],
  candles15m: Candle[],
  candles5m: Candle[],
  now: Date
): BtcEvalResult {
  // -------- Pre-flight sanity --------
  if (candles1h.length < 60 || candles15m.length < 80 || candles5m.length < 20) {
    return preflightFail("INSUFFICIENT_CANDLES")
  }

  const lastPrice = safeNumber(candles5m[candles5m.length - 1].close)
  if (!lastPrice) return preflightFail("INVALID_LAST_PRICE")

  // -------- HTF bias --------
  const closes1h = candles1h.map((c) => safeNumber(c.close))
  const ema20h = ema(closes1h, 20)
  const ema50h = ema(closes1h, 50)
  const htfBias: "LONG" | "SHORT" | "NEUTRAL" =
    ema20h > ema50h ? "LONG" : ema20h < ema50h ? "SHORT" : "NEUTRAL"

  if (htfBias === "NEUTRAL") return preflightFail("HTF_BIAS_NEUTRAL")

  // -------- 15m squeeze --------
  const closes15m = candles15m.map((c) => safeNumber(c.close))
  const squeeze = isBollingerSqueeze(closes15m, 20, 2, 50, 0.2)

  // -------- Breakout bar detection --------
  const breakoutDir = htfBias
  const breakout = findBreakoutBar(candles15m, breakoutDir, BREAKOUT_LOOKBACK)
  if (!breakout) return preflightFail("NO_BREAKOUT_BAR")

  // -------- Retest check on 5m --------
  const closes5m = candles5m.map((c) => safeNumber(c.close))
  const lastClose5m = closes5m[closes5m.length - 1]

  const retestDistance = Math.abs(lastClose5m - breakout.level) / breakout.level
  const priceReturnedToLevel = retestDistance <= RETEST_TOLERANCE_PCT

  // After a bullish breakout we expect price to DIP back to the upper band.
  // After a bearish breakout we expect price to RALLY back to the lower band.
  const correctSide =
    breakoutDir === "LONG"
      ? lastClose5m >= breakout.level * (1 - RETEST_TOLERANCE_PCT)
      : lastClose5m <= breakout.level * (1 + RETEST_TOLERANCE_PCT)

  // -------- Rejection pattern --------
  const bullishRejection =
    isBullishPinBar(candles5m) || isBullishEngulfing(candles5m)
  const bearishRejection =
    isBearishPinBar(candles5m) || isBearishEngulfing(candles5m)

  const rejectionAligned =
    breakoutDir === "LONG" ? bullishRejection : bearishRejection

  // -------- ADX filter --------
  const adx15m = adx(candles15m, 14)

  // -------- Gates --------
  const gates = [
    gate("session_window", isInScalpWindow(symbol, now), "BTCUSDT golden window is 13:00-21:00 UTC"),
    gate("htf_bias_clear", true, `EMA20=${ema20h.toFixed(2)} EMA50=${ema50h.toFixed(2)}`),
    gate("breakout_found", !!breakout, "No qualifying breakout bar in lookback"),
    gate("price_at_retest", priceReturnedToLevel && correctSide, "Price must revisit broken level"),
    gate("rejection_pattern", rejectionAligned, "Need pin bar or engulfing in direction"),
    gate("adx_trending", adx15m.adx >= MIN_ADX, `ADX=${adx15m.adx.toFixed(1)} < ${MIN_ADX}`)
  ]

  // -------- Factors --------
  const factors = [
    factor("htf_bias", 15, `1h EMA20 vs EMA50: ${htfBias}`),
    factor("squeeze_strength", squeeze ? 12 : 0, squeeze ? "15m BB contraction confirmed (bonus)" : "No squeeze, relying on breakout + retest alone"),
    factor("breakout_quality", breakout ? 12 : 0, `Broken at ${breakout?.level.toFixed(2)}`),
    factor("retest_clean", priceReturnedToLevel && correctSide ? 8 : 0, `${(retestDistance * 100).toFixed(2)}% from level`),
    factor("rejection", rejectionAligned ? 10 : 0, "Price action confirmation"),
    factor("adx_value", Math.min(10, (adx15m.adx - 20) / 3), `ADX=${adx15m.adx.toFixed(1)}`),
    factor(
      "di_separation",
      breakoutDir === "LONG"
        ? Math.min(5, Math.max(0, adx15m.plusDI - adx15m.minusDI) / 4)
        : Math.min(5, Math.max(0, adx15m.minusDI - adx15m.plusDI) / 4),
      `+DI=${adx15m.plusDI.toFixed(1)} -DI=${adx15m.minusDI.toFixed(1)}`
    )
  ]

  const result = evaluateConfluence(gates, factors, CONFIDENCE_FLOOR)

  if (!result.passed) {
    return {
      signal: null,
      passed: false,
      confidence: result.confidence,
      failedGates: result.failedGates
    }
  }

  // -------- Build signal --------
  const entry = lastPrice
  const last5m = candles5m[candles5m.length - 1]
  const wickExtreme =
    breakoutDir === "LONG" ? safeNumber(last5m.low) : safeNumber(last5m.high)

  let sl: number
  let tp: number

  if (breakoutDir === "LONG") {
    sl = wickExtreme * (1 - SL_BUFFER_PCT)
    const risk = entry - sl
    tp = entry + risk * RR_TARGET
  } else {
    sl = wickExtreme * (1 + SL_BUFFER_PCT)
    const risk = sl - entry
    tp = entry - risk * RR_TARGET
  }

  const risk = Math.abs(entry - sl)
  if (!risk) return preflightFail("ZERO_RISK")

  const breakEvenTrigger =
    breakoutDir === "LONG"
      ? entry + risk * BE_TRIGGER_FRACTION
      : entry - risk * BE_TRIGGER_FRACTION

  const signal: ScalpSignal = {
    id: `${symbol}-BTC_BREAKOUT_RETEST-${breakoutDir}-${Date.now()}`,
    symbol,
    strategy: "BTC_BREAKOUT_RETEST",
    direction: breakoutDir === "LONG" ? "BUY" : "SELL",
    entry: Number(entry.toFixed(2)),
    sl: Number(sl.toFixed(2)),
    tp: Number(tp.toFixed(2)),
    confidence: result.confidence,
    rr: RR_TARGET,
    breakEvenTrigger: Number(breakEvenTrigger.toFixed(2)),
    generatedAt: now.getTime(),
    debug: {
      gates: result.gates,
      factors: result.factors
    }
  }

  return {
    signal,
    passed: true,
    confidence: result.confidence,
    failedGates: []
  }
}
