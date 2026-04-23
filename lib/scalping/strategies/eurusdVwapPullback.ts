/* =========================
EURUSD - VWAP PULLBACK STRATEGY

Hypothesis:
  During London and NY opens, EURUSD respects session VWAP and EMA21
  as dynamic support/resistance. High-probability entries come from
  pullbacks to VWAP in the direction of the HTF trend, rejected by a
  clean price-action pattern.

Setup (long version, short is symmetric):
  1. Golden window: 08-11 UTC or 14-17 UTC.
  2. 15m trend: EMA9 > EMA21 (bullish bias).
  3. 15m ADX(14) >= 20.
  4. 5m: price pulled back to within 3 pips of VWAP or EMA21 from ABOVE.
  5. 5m rejection: bullish pin bar or engulfing at the level.
  6. 5m stochastic: %K crossed up through %D from oversold (<30).
  7. RSI 5m between 40-60 (not overbought, not exhausted).
  8. Price not within 5 pips of a Bollinger band extreme on 15m (avoids
     chasing exhausted moves).

Invalidation:
  SL = low of the rejection candle - 2 pips.
Target:
  Fixed RR 1.5:1 (tight scalp, adaptive RR applied later if high conf).

Session:
  08:00 - 11:00 UTC (London open) or 14:30 - 16:30 UTC (NY open+overlap).
========================= */

import type { Candle } from "@/lib/providers"
import {
  ema,
  rsi,
  adx,
  stochastic,
  rollingVwap,
  bollinger,
  isBullishPinBar,
  isBearishPinBar,
  isBullishEngulfing,
  isBearishEngulfing
} from "@/lib/scalping/shared/indicators"
import {
  evaluateConfluence,
  gate,
  factor
} from "@/lib/scalping/shared/confluence"
import { isInScalpWindow } from "@/lib/scalping/shared/scalpSessions"
import type { ScalpSignal } from "@/lib/scalping/types"

const CONFIDENCE_FLOOR = 80
const PIP = 0.0001 // EURUSD pip
const SL_BUFFER_PIPS = 2
const RR_TARGET = 1.5
const BE_TRIGGER_FRACTION = 0.5
const PULLBACK_TOLERANCE_PIPS = 3
const MIN_ADX = 20
const BB_EXHAUST_BUFFER_PIPS = 5

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function pips(n: number): number {
  return n * PIP
}

export function runEurusdVwapPullback(
  symbol: string,
  candles1h: Candle[],
  candles15m: Candle[],
  candles5m: Candle[],
  now: Date = new Date()
): ScalpSignal | null {
  if (candles1h.length < 40 || candles15m.length < 60 || candles5m.length < 30) {
    return null
  }

  const last5m = candles5m[candles5m.length - 1]
  const lastPrice = safeNumber(last5m.close)
  if (!lastPrice) return null

  // -------- 15m trend --------
  const closes15m = candles15m.map((c) => safeNumber(c.close))
  const ema9 = ema(closes15m, 9)
  const ema21 = ema(closes15m, 21)
  const bias15m: "LONG" | "SHORT" | "NEUTRAL" =
    ema9 > ema21 ? "LONG" : ema9 < ema21 ? "SHORT" : "NEUTRAL"

  if (bias15m === "NEUTRAL") return null

  // -------- ADX --------
  const adx15m = adx(candles15m, 14)

  // -------- VWAP (rolling, forex has no real volume) --------
  const vwap = rollingVwap(candles5m, 48)

  // -------- 5m indicators --------
  const closes5m = candles5m.map((c) => safeNumber(c.close))
  const rsi5m = rsi(closes5m, 14)
  const stoch = stochastic(candles5m, 14, 3)

  // -------- Pullback check --------
  // Distance from price to VWAP or EMA21 (whichever closer).
  const distToVwap = Math.abs(lastPrice - vwap)
  const distToEma21 = Math.abs(lastPrice - ema21)
  const nearestAnchor = Math.min(distToVwap, distToEma21)
  const pullbackWithinTol = nearestAnchor <= pips(PULLBACK_TOLERANCE_PIPS)

  // Direction check - for a long, price must have pulled DOWN to the anchor.
  // We can infer that from the 5m last few candles making lower lows before the rejection.
  const recent = candles5m.slice(-4)
  const pulledDown =
    bias15m === "LONG" &&
    recent[0].close > lastPrice &&
    Math.min(...recent.map((c) => safeNumber(c.low))) <= vwap * 1.0001
  const pulledUp =
    bias15m === "SHORT" &&
    recent[0].close < lastPrice &&
    Math.max(...recent.map((c) => safeNumber(c.high))) >= vwap * 0.9999

  // -------- Rejection candle --------
  const bullishRejection =
    isBullishPinBar(candles5m) || isBullishEngulfing(candles5m)
  const bearishRejection =
    isBearishPinBar(candles5m) || isBearishEngulfing(candles5m)
  const rejectionAligned = bias15m === "LONG" ? bullishRejection : bearishRejection

  // -------- Stochastic cross --------
  // Use the last and prior stoch reading to detect a cross in the right direction.
  const stochPrev = stochastic(candles5m.slice(0, -1), 14, 3)
  const bullishStochCross =
    stochPrev.k < stochPrev.d && stoch.k > stoch.d && stoch.k < 40
  const bearishStochCross =
    stochPrev.k > stochPrev.d && stoch.k < stoch.d && stoch.k > 60
  const stochAligned = bias15m === "LONG" ? bullishStochCross : bearishStochCross

  // -------- RSI sanity --------
  // Don't chase into exhaustion.
  const rsiOk = rsi5m >= 40 && rsi5m <= 60

  // -------- BB exhaustion guard --------
  const bb15m = bollinger(closes15m, 20, 2)
  const priceTooCloseToUpper =
    bb15m.upper > 0 && Math.abs(lastPrice - bb15m.upper) < pips(BB_EXHAUST_BUFFER_PIPS)
  const priceTooCloseToLower =
    bb15m.lower > 0 && Math.abs(lastPrice - bb15m.lower) < pips(BB_EXHAUST_BUFFER_PIPS)
  const bbExhausted =
    (bias15m === "LONG" && priceTooCloseToUpper) ||
    (bias15m === "SHORT" && priceTooCloseToLower)

  // -------- Gates --------
  const gates = [
    gate("session_window", isInScalpWindow(symbol, now), "EURUSD scalp window 08-11/14-17 UTC"),
    gate("trend_clear", true, `EMA9=${ema9.toFixed(5)} EMA21=${ema21.toFixed(5)}`),
    gate("adx_trending", adx15m.adx >= MIN_ADX, `ADX=${adx15m.adx.toFixed(1)}`),
    gate("pullback_to_anchor", pullbackWithinTol, `Dist=${(nearestAnchor / PIP).toFixed(1)} pips`),
    gate("pullback_direction", bias15m === "LONG" ? pulledDown : pulledUp, "Price must have pulled into the anchor"),
    gate("rejection_pattern", rejectionAligned, "Pin bar or engulfing required"),
    gate("stoch_cross", stochAligned, "Stoch must cross in signal direction"),
    gate("rsi_healthy", rsiOk, `RSI=${rsi5m.toFixed(1)} not in 40-60`),
    gate("not_bb_exhausted", !bbExhausted, "Price too close to BB extreme on 15m")
  ]

  // -------- Factors --------
  const factors = [
    factor("trend_strength", 12, `EMA9-EMA21 gap: ${(ema9 - ema21).toFixed(5)}`),
    factor("adx_value", Math.min(10, Math.max(0, (adx15m.adx - 20) / 3)), `ADX=${adx15m.adx.toFixed(1)}`),
    factor("pullback_quality", pullbackWithinTol ? 10 : 0, "Anchor retest"),
    factor("rejection", rejectionAligned ? 10 : 0, "Price action"),
    factor("stoch_oversold_bounce", stochAligned ? 8 : 0, `K=${stoch.k.toFixed(0)} D=${stoch.d.toFixed(0)}`),
    factor("rsi_balance", rsiOk ? 5 : -5, `RSI=${rsi5m.toFixed(1)}`),
    factor("vwap_alignment", distToVwap <= distToEma21 ? 4 : 2, "Closer to VWAP")
  ]

  const result = evaluateConfluence(gates, factors, CONFIDENCE_FLOOR)
  if (!result.passed) return null

  // -------- Build signal --------
  const entry = lastPrice
  let sl: number
  let tp: number

  if (bias15m === "LONG") {
    const wickLow = safeNumber(last5m.low)
    sl = wickLow - pips(SL_BUFFER_PIPS)
    const risk = entry - sl
    tp = entry + risk * RR_TARGET
  } else {
    const wickHigh = safeNumber(last5m.high)
    sl = wickHigh + pips(SL_BUFFER_PIPS)
    const risk = sl - entry
    tp = entry - risk * RR_TARGET
  }

  const risk = Math.abs(entry - sl)
  if (!risk) return null

  const breakEvenTrigger =
    bias15m === "LONG"
      ? entry + risk * BE_TRIGGER_FRACTION
      : entry - risk * BE_TRIGGER_FRACTION

  return {
    id: `${symbol}-EURUSD_VWAP_PULLBACK-${bias15m}-${Date.now()}`,
    symbol,
    strategy: "EURUSD_VWAP_PULLBACK",
    direction: bias15m === "LONG" ? "BUY" : "SELL",
    entry: Number(entry.toFixed(5)),
    sl: Number(sl.toFixed(5)),
    tp: Number(tp.toFixed(5)),
    confidence: result.confidence,
    rr: RR_TARGET,
    breakEvenTrigger: Number(breakEvenTrigger.toFixed(5)),
    generatedAt: now.getTime(),
    debug: {
      gates: result.gates,
      factors: result.factors
    }
  }
}
