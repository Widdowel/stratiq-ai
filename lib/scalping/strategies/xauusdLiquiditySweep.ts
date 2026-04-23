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
const RR_TARGET = 0.6 // scalp - XAU MFE p50 = 0.98R so 0.6R captures reliably
const BE_TRIGGER_FRACTION = 0.3
const MAX_ATR_USD = 4.0 // raised from 2.5 - v6 diagnostic showed atr_not_extreme
                        // blocking 349/380 post-preflight bars (92%). London XAU
                        // regularly runs 3-4 ATR on good setup days.

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export type XauusdEvalResult = {
  signal: ScalpSignal | null
  passed: boolean
  confidence: number
  failedGates: string[]
  prefligthFailed?: string
}

function xauPreflightFail(reason: string): XauusdEvalResult {
  return {
    signal: null,
    passed: false,
    confidence: 0,
    failedGates: [],
    prefligthFailed: reason
  }
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
  return evaluateXauusd(symbol, candles1h, candles15m, candles5m, now).signal
}

export function runXauusdLiquiditySweepDebug(
  symbol: string,
  candles1h: CandleWithTime[],
  candles15m: CandleWithTime[],
  candles5m: CandleWithTime[],
  now: Date = new Date()
): XauusdEvalResult {
  return evaluateXauusd(symbol, candles1h, candles15m, candles5m, now)
}

function evaluateXauusd(
  symbol: string,
  candles1h: CandleWithTime[],
  candles15m: CandleWithTime[],
  candles5m: CandleWithTime[],
  now: Date
): XauusdEvalResult {
  if (candles1h.length < 40 || candles15m.length < 40 || candles5m.length < 50) {
    return xauPreflightFail("INSUFFICIENT_CANDLES")
  }

  const last5m = candles5m[candles5m.length - 1]
  const lastClose = safeNumber(last5m.close)
  const lastHigh = safeNumber(last5m.high)
  const lastLow = safeNumber(last5m.low)

  if (!lastClose || !lastHigh || !lastLow) return xauPreflightFail("INVALID_OHLC")

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

  // XAU sweeps target multiple liquidity magnets, not just the Asian range:
  // - Asian H/L (overnight consolidation)
  // - Prior Day H/L (daily liquidity pool)
  // - Recent 1h-level highs/lows over the last 4 hours (session's own extremes)
  const pdrEarly = getPriorDayRange(candles5m)
  const pdh = pdrEarly?.high ?? 0
  const pdl = pdrEarly?.low ?? 0

  // Last 4h of 5m candles = 48 bars. Find the extremes we haven't swept yet.
  const recentSlice = candles5m.slice(-48, -6)
  const recentH =
    recentSlice.length >= 20
      ? Math.max(...recentSlice.map((c) => safeNumber(c.high)))
      : 0
  const recentL =
    recentSlice.length >= 20
      ? Math.min(...recentSlice.map((c) => safeNumber(c.low)).filter((v) => v > 0))
      : 0

  if (!asianHigh || !asianLow) return xauPreflightFail("NO_ASIAN_RANGE")

  // -------- Sweep + reclaim detection --------
  // We look at the last SWEEP_LOOKBACK bars for any wick that pierced
  // either the Asian range OR yesterday's high/low, and require the
  // current close to be back inside. This captures "sweep then reverse"
  // patterns that complete over 2-6 bars (10-30 min on 5m).
  const SWEEP_LOOKBACK = 10 // bumped from 6 - still only 7 signals over 920 bars at 6

  let sweepDirection: "LONG" | "SHORT" | null = null
  let sweepWickLow = lastLow
  let sweepWickHigh = lastHigh
  let sweepLevel = 0
  let sweepSource: "ASIAN" | "PDH_PDL" = "ASIAN"
  let sweepBarIdx = candles5m.length - 1

  const lowLevels = [
    { level: asianLow, source: "ASIAN" as const },
    ...(pdl > 0 ? [{ level: pdl, source: "PDH_PDL" as const }] : []),
    ...(recentL > 0 ? [{ level: recentL, source: "PDH_PDL" as const }] : [])
  ]
  const highLevels = [
    { level: asianHigh, source: "ASIAN" as const },
    ...(pdh > 0 ? [{ level: pdh, source: "PDH_PDL" as const }] : []),
    ...(recentH > 0 ? [{ level: recentH, source: "PDH_PDL" as const }] : [])
  ]

  for (let i = candles5m.length - SWEEP_LOOKBACK; i < candles5m.length; i++) {
    if (i < 0) continue
    const bar = candles5m[i]
    const h = safeNumber(bar.high)
    const l = safeNumber(bar.low)

    for (const { level, source } of lowLevels) {
      if (!level) continue
      if (l < level && lastClose >= level) {
        if (!sweepDirection || l < sweepWickLow) {
          sweepDirection = "LONG"
          sweepWickLow = l
          sweepLevel = level
          sweepSource = source
          sweepBarIdx = i
        }
      }
    }

    for (const { level, source } of highLevels) {
      if (!level) continue
      if (h > level && lastClose <= level) {
        if (!sweepDirection || h > sweepWickHigh) {
          sweepDirection = "SHORT"
          sweepWickHigh = h
          sweepLevel = level
          sweepSource = source
          sweepBarIdx = i
        }
      }
    }
  }

  if (!sweepDirection) return xauPreflightFail("NO_SWEEP_DETECTED")

  // -------- Rejection pattern confirms --------
  // Tier 1: strong rejection = pin bar or engulfing (classic reversal)
  // Tier 2: weak rejection = the reclaim bar closed in the sweep direction
  //   (e.g. for LONG sweep: current close > current open)
  // Gate passes for either tier; factor bonus differentiates.
  const lastBar = candles5m[candles5m.length - 1]
  const strongBullish =
    isBullishPinBar(candles5m) || isBullishEngulfing(candles5m)
  const strongBearish =
    isBearishPinBar(candles5m) || isBearishEngulfing(candles5m)
  const weakBullish = lastBar.close > lastBar.open
  const weakBearish = lastBar.close < lastBar.open

  const rejectionAligned =
    sweepDirection === "LONG"
      ? strongBullish || weakBullish
      : strongBearish || weakBearish
  const strongRejectionAligned =
    sweepDirection === "LONG" ? strongBullish : strongBearish

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
    gate("atr_not_extreme", atrOk, `ATR=${atr5m.toFixed(2)} > ${MAX_ATR_USD}`)
  ]

  // -------- Factors --------
  const sweepDepth =
    sweepDirection === "LONG"
      ? asianLow - sweepWickLow
      : sweepWickHigh - asianHigh

  const sweepFreshness = candles5m.length - 1 - sweepBarIdx // 0 = current bar, 5 = 6 bars ago
  const factors = [
    factor("sweep_depth", Math.min(15, Math.max(0, sweepDepth / 0.3 * 5)), `Depth=$${sweepDepth.toFixed(2)} (${sweepSource} ${sweepLevel.toFixed(2)})`),
    factor("sweep_fresh", sweepFreshness === 0 ? 5 : sweepFreshness <= 2 ? 3 : 1, `Bar ${sweepFreshness} ago`),
    factor("reclaim_strength", sweepDirection === "LONG" ? Math.min(10, (lastClose - asianLow) / 0.5 * 3) : Math.min(10, (asianHigh - lastClose) / 0.5 * 3), "How deeply price closed back in range"),
    factor("rejection_strength", strongRejectionAligned ? 12 : rejectionAligned ? 5 : 0, strongRejectionAligned ? "Strong (pin/engulf)" : rejectionAligned ? "Weak (directional close)" : "None"),
    factor("vp_poc_nearby", nearPOC ? 6 : 0, `POC=${vp.poc.toFixed(2)}`),
    factor("pdr_confluence", pdrConfluence ? 5 : 0, pdr ? `PDH=${pdr.high.toFixed(2)} PDL=${pdr.low.toFixed(2)}` : "No PDR"),
    factor("atr_healthy", atrOk ? 5 : -5, `ATR=${atr5m.toFixed(2)}`),
    factor("vp_context", vp.poc > 0 ? 3 : 0, `VAH=${vp.vah.toFixed(2)} VAL=${vp.val.toFixed(2)}`)
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

  // Early exit: no sweep = no trade (type-narrowing)
  if (!sweepDirection) return xauPreflightFail("NO_SWEEP_DIRECTION")

  // -------- Build signal --------
  const entry = lastClose
  let sl: number
  let tp: number

  // SL goes beyond the sweep wick, not the current bar. When the sweep is
  // from a prior bar, using lastLow/lastHigh would set too tight an SL.
  if (sweepDirection === "LONG") {
    sl = sweepWickLow - SL_BUFFER_USD
    const risk = entry - sl
    tp = entry + risk * RR_TARGET
  } else {
    sl = sweepWickHigh + SL_BUFFER_USD
    const risk = sl - entry
    tp = entry - risk * RR_TARGET
  }

  const risk = Math.abs(entry - sl)
  if (!risk) return xauPreflightFail("ZERO_RISK")

  const breakEvenTrigger =
    sweepDirection === "LONG"
      ? entry + risk * BE_TRIGGER_FRACTION
      : entry - risk * BE_TRIGGER_FRACTION

  const signal: ScalpSignal = {
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

  return {
    signal,
    passed: true,
    confidence: result.confidence,
    failedGates: []
  }
}
