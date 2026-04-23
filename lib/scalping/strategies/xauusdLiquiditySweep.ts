/* =========================
XAUUSD - LIQUIDITY SWEEP + RECLAIM STRATEGY

Hypothesis:
  Gold famously stop-hunts the Asian session's highs and lows during
  London open, then reverses violently. Catching the sweep + reclaim
  is a classic high-RR scalp setup.

Setup:
  1. Session: 07:00 - 11:00 UTC (London only - NY too whippy).
  2. Compute Asian range (00:00 - 07:00 UTC) high + low.
  3. 5m: price WICKS through the Asian high or low (sweep).
  4. 5m: same candle CLOSES back inside the range (reclaim).
  5. Optional confluence: price also rejected from a volume profile
     POC / VAH / VAL level, or from a prior day's high/low.
  6. ATR(14) on 5m < $2.50 (skip insane-vol days where spread kills).

Invalidation:
  SL beyond the sweep wick + $0.80 buffer (gold needs air).

Target:
  Fixed RR 1.5:1. Adaptive RR bumps this up for 90+ confidence signals.

Session:
  07:00 - 11:00 UTC strictly.
========================= */

import type { Candle } from "@/lib/providers"
import {
  atr,
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
import {
  buildVolumeProfile,
  isPriceNearPOC,
  getAsianRange,
  getPriorDayRange,
  type CandleWithTime
} from "@/lib/scalping/shared/volumeProfile"
import { isInScalpWindow } from "@/lib/scalping/shared/scalpSessions"
import type { ScalpSignal } from "@/lib/scalping/types"

const CONFIDENCE_FLOOR = 80
const SL_BUFFER_USD = 0.8
const RR_TARGET = 1.5
const BE_TRIGGER_FRACTION = 0.5
const MAX_ATR_USD = 2.5

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * XAU liquidity sweep detection. Unlike the FX VWAP strategy, this
 * relies on wicks not closes - which is only reliable now that Phase 1
 * restored OHLC data across the pipeline.
 */
export function runXauusdLiquiditySweep(
  symbol: string,
  candles1h: CandleWithTime[],
  candles15m: CandleWithTime[],
  candles5m: CandleWithTime[],
  now: Date = new Date()
): ScalpSignal | null {
  if (candles1h.length < 40 || candles15m.length < 40 || candles5m.length < 50) {
    return null
  }

  const last5m = candles5m[candles5m.length - 1]
  const lastClose = safeNumber(last5m.close)
  const lastHigh = safeNumber(last5m.high)
  const lastLow = safeNumber(last5m.low)

  if (!lastClose || !lastHigh || !lastLow) return null

  // -------- Session gate --------
  const inWindow = isInScalpWindow(symbol, now)

  // -------- Asian range --------
  const asian = getAsianRange(candles5m)

  // If we don't have openTime metadata, fall back to a simpler
  // "previous 48 bars" range (approx 4 hours on 5m).
  let asianHigh = asian?.high ?? 0
  let asianLow = asian?.low ?? 0

  if (!asianHigh || !asianLow) {
    const fallback = candles5m.slice(-96, -36) // ~3 hours ending 3 hours ago
    if (fallback.length >= 30) {
      asianHigh = Math.max(...fallback.map((c) => safeNumber(c.high)))
      asianLow = Math.min(...fallback.map((c) => safeNumber(c.low)).filter((v) => v > 0))
    }
  }

  if (!asianHigh || !asianLow) return null

  // -------- Sweep + reclaim detection --------
  const sweepHigh = lastHigh > asianHigh && lastClose <= asianHigh
  const sweepLow = lastLow < asianLow && lastClose >= asianLow

  const sweepDirection: "LONG" | "SHORT" | null = sweepLow
    ? "LONG"
    : sweepHigh
    ? "SHORT"
    : null

  if (!sweepDirection) return null

  // -------- Rejection pattern confirms --------
  const bullishRejection =
    isBullishPinBar(candles5m) || isBullishEngulfing(candles5m)
  const bearishRejection =
    isBearishPinBar(candles5m) || isBearishEngulfing(candles5m)
  const rejectionAligned = sweepDirection === "LONG" ? bullishRejection : bearishRejection

  // -------- ATR filter (volatility too extreme = skip) --------
  const atr5m = atr(candles5m, 14)
  const atrOk = atr5m > 0 && atr5m <= MAX_ATR_USD

  // -------- Volume profile confluence --------
  const vp = buildVolumeProfile(candles5m.slice(-96)) // ~8 hours
  const nearPOC = isPriceNearPOC(lastClose, vp, 3)

  // -------- Prior day H/L confluence --------
  const pdr = getPriorDayRange(candles5m)
  let pdrConfluence = false
  if (pdr) {
    const distPDH = Math.abs(lastHigh - pdr.high)
    const distPDL = Math.abs(lastLow - pdr.low)
    pdrConfluence = distPDH <= 1.0 || distPDL <= 1.0 // within $1 of PDH or PDL
  }

  // -------- Gates --------
  const gates = [
    gate("session_window", inWindow, "XAU scalp window 07-11 UTC only"),
    gate("asian_range_found", asianHigh > 0 && asianLow > 0, "Could not compute Asian range"),
    gate("sweep_detected", !!sweepDirection, "Price must wick through Asian high/low"),
    gate("rejection_pattern", rejectionAligned, "Pin bar or engulfing on sweep bar"),
    gate("atr_not_extreme", atrOk, `ATR=${atr5m.toFixed(2)} > ${MAX_ATR_USD}`),
    gate("same_bar_reclaim", sweepDirection === "LONG" ? lastClose > asianLow : lastClose < asianHigh, "Close must be back inside range")
  ]

  // -------- Factors --------
  const sweepDepth =
    sweepDirection === "LONG"
      ? asianLow - lastLow
      : lastHigh - asianHigh

  const factors = [
    factor("sweep_depth", Math.min(15, Math.max(0, sweepDepth / 0.3 * 5)), `Depth=$${sweepDepth.toFixed(2)}`),
    factor("reclaim_strength", sweepDirection === "LONG" ? Math.min(10, (lastClose - asianLow) / 0.5 * 3) : Math.min(10, (asianHigh - lastClose) / 0.5 * 3), "How deeply price closed back in range"),
    factor("rejection_pattern", rejectionAligned ? 12 : 0, "PA confirmation"),
    factor("vp_poc_nearby", nearPOC ? 6 : 0, `POC=${vp.poc.toFixed(2)}`),
    factor("pdr_confluence", pdrConfluence ? 5 : 0, pdr ? `PDH=${pdr.high.toFixed(2)} PDL=${pdr.low.toFixed(2)}` : "No PDR"),
    factor("atr_healthy", atrOk ? 5 : -5, `ATR=${atr5m.toFixed(2)}`),
    factor("vp_context", vp.poc > 0 ? 3 : 0, `VAH=${vp.vah.toFixed(2)} VAL=${vp.val.toFixed(2)}`)
  ]

  const result = evaluateConfluence(gates, factors, CONFIDENCE_FLOOR)
  if (!result.passed) return null

  // -------- Build signal --------
  const entry = lastClose
  let sl: number
  let tp: number

  if (sweepDirection === "LONG") {
    sl = lastLow - SL_BUFFER_USD
    const risk = entry - sl
    tp = entry + risk * RR_TARGET
  } else {
    sl = lastHigh + SL_BUFFER_USD
    const risk = sl - entry
    tp = entry - risk * RR_TARGET
  }

  const risk = Math.abs(entry - sl)
  if (!risk) return null

  const breakEvenTrigger =
    sweepDirection === "LONG"
      ? entry + risk * BE_TRIGGER_FRACTION
      : entry - risk * BE_TRIGGER_FRACTION

  return {
    id: `${symbol}-XAUUSD_LIQUIDITY_SWEEP-${sweepDirection}-${Date.now()}`,
    symbol,
    strategy: "XAUUSD_LIQUIDITY_SWEEP",
    direction: sweepDirection === "LONG" ? "BUY" : "SELL",
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
}
