/* =========================
VOLUME PROFILE

Calculates Point of Control (POC), Value Area High (VAH), and
Value Area Low (VAL) over a sliding window of candles.

Scalpers use these as magnet levels:
 - POC    = price level with the most traded volume (mean reversion target)
 - VAH    = upper bound of the 70% volume area (resistance / profit taking)
 - VAL    = lower bound of the 70% volume area (support / bounce zone)

For FX (no real volume) we approximate volume using range * 1 so the
profile collapses to a range-weighted price distribution.
========================= */

import type { Candle } from "@/lib/providers"

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export type VolumeProfile = {
  poc: number
  vah: number
  val: number
  tickSize: number
  totalVolume: number
}

export type SessionRange = {
  high: number
  low: number
  open: number
  close: number
  startIndex: number
  endIndex: number
}

/**
 * Decide a sensible bin size for the profile based on ATR-ish range.
 * Too fine = noisy POC. Too coarse = useless. We target ~40-60 bins.
 */
function chooseTickSize(candles: Candle[]): number {
  if (!candles.length) return 0

  const highs = candles.map((c) => safeNumber(c.high))
  const lows = candles.map((c) => safeNumber(c.low))
  const maxH = Math.max(...highs)
  const minL = Math.min(...lows.filter((v) => v > 0))

  const range = maxH - minL
  if (range <= 0) return 0

  // Target ~50 bins
  return range / 50
}

/**
 * Build a volume-weighted price histogram over `candles`.
 * Each candle's volume is distributed evenly across the bins
 * that fall within [low, high]. This is the standard TPO-light
 * volume profile implementation.
 */
export function buildVolumeProfile(candles: Candle[]): VolumeProfile {
  if (candles.length < 10) {
    return { poc: 0, vah: 0, val: 0, tickSize: 0, totalVolume: 0 }
  }

  const tickSize = chooseTickSize(candles)
  if (tickSize <= 0) {
    return { poc: 0, vah: 0, val: 0, tickSize: 0, totalVolume: 0 }
  }

  const minPrice = Math.min(...candles.map((c) => safeNumber(c.low)).filter((v) => v > 0))
  const maxPrice = Math.max(...candles.map((c) => safeNumber(c.high)))

  const binCount = Math.ceil((maxPrice - minPrice) / tickSize) + 1
  if (binCount <= 0 || !Number.isFinite(binCount)) {
    return { poc: 0, vah: 0, val: 0, tickSize, totalVolume: 0 }
  }

  const bins = new Array<number>(binCount).fill(0)

  for (const c of candles) {
    const h = safeNumber(c.high)
    const l = safeNumber(c.low)
    if (!h || !l || h < l) continue

    // Fallback for no-volume data (forex): use range as proxy.
    const rawVol = safeNumber(c.volume)
    const vol = rawVol > 0 ? rawVol : (h - l) * 100

    const lowBin = Math.floor((l - minPrice) / tickSize)
    const highBin = Math.floor((h - minPrice) / tickSize)
    const span = Math.max(1, highBin - lowBin + 1)
    const perBin = vol / span

    for (let b = lowBin; b <= highBin; b++) {
      if (b >= 0 && b < binCount) {
        bins[b] += perBin
      }
    }
  }

  const totalVolume = bins.reduce((s, v) => s + v, 0)
  if (totalVolume <= 0) {
    return { poc: 0, vah: 0, val: 0, tickSize, totalVolume: 0 }
  }

  // POC = bin with max volume
  let pocBin = 0
  let pocVol = 0
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] > pocVol) {
      pocVol = bins[i]
      pocBin = i
    }
  }
  const poc = minPrice + pocBin * tickSize + tickSize / 2

  // Value Area = expand from POC until 70% of total volume is included.
  const target = totalVolume * 0.7
  let accumulated = pocVol
  let low = pocBin
  let high = pocBin

  while (accumulated < target && (low > 0 || high < bins.length - 1)) {
    const nextDown = low > 0 ? bins[low - 1] : -1
    const nextUp = high < bins.length - 1 ? bins[high + 1] : -1

    if (nextUp >= nextDown) {
      high += 1
      accumulated += Math.max(0, nextUp)
    } else {
      low -= 1
      accumulated += Math.max(0, nextDown)
    }
  }

  const val = minPrice + low * tickSize
  const vah = minPrice + (high + 1) * tickSize

  return { poc, vah, val, tickSize, totalVolume }
}

/**
 * Is the current price within N ticks of the POC? Used as a
 * confluence factor - price reverting to POC = mean-reversion
 * opportunity, price rejecting from POC = continuation.
 */
export function isPriceNearPOC(
  price: number,
  profile: VolumeProfile,
  tolerance = 3
): boolean {
  if (!profile.poc || !profile.tickSize) return false
  return Math.abs(price - profile.poc) <= profile.tickSize * tolerance
}

/* =========================
SESSION RANGE HELPERS

Used by the XAU sweep strategy - we need the Asian session range
(00:00 - 07:00 UTC) highs and lows to identify liquidity pools.
========================= */

export type CandleWithTime = Candle & { openTime?: number }

export function getSessionRange(
  candles: CandleWithTime[],
  startHourUtc: number,
  endHourUtc: number
): SessionRange | null {
  if (!candles.length) return null

  let startIdx = -1
  let endIdx = -1

  // Find the most recent completed session in the candle window.
  // We walk backwards from the end looking for a candle within the session.
  for (let i = candles.length - 1; i >= 0; i--) {
    const t = candles[i].openTime
    if (!t) continue
    const d = new Date(t)
    const h = d.getUTCHours()
    if (h >= startHourUtc && h < endHourUtc) {
      if (endIdx === -1) endIdx = i
      startIdx = i
    } else if (endIdx !== -1) {
      // We've walked past the session into the prior hours.
      break
    }
  }

  if (startIdx < 0 || endIdx < startIdx) return null

  const slice = candles.slice(startIdx, endIdx + 1)
  const highs = slice.map((c) => safeNumber(c.high)).filter((v) => v > 0)
  const lows = slice.map((c) => safeNumber(c.low)).filter((v) => v > 0)
  if (!highs.length || !lows.length) return null

  return {
    high: Math.max(...highs),
    low: Math.min(...lows),
    open: safeNumber(slice[0].open),
    close: safeNumber(slice[slice.length - 1].close),
    startIndex: startIdx,
    endIndex: endIdx
  }
}

/** 00:00 - 07:00 UTC (Tokyo / Asian session, roughly) */
export function getAsianRange(candles: CandleWithTime[]): SessionRange | null {
  return getSessionRange(candles, 0, 7)
}

/** 07:00 - 16:00 UTC (London) */
export function getLondonRange(candles: CandleWithTime[]): SessionRange | null {
  return getSessionRange(candles, 7, 16)
}

/** 13:00 - 21:00 UTC (NY) */
export function getNYRange(candles: CandleWithTime[]): SessionRange | null {
  return getSessionRange(candles, 13, 21)
}

/* =========================
PRIOR DAY HIGH / LOW

PDH and PDL are major liquidity magnets for all 3 assets. We find
the most recent completed UTC day in the candle array.
========================= */

export type DayRange = {
  high: number
  low: number
  close: number
}

export function getPriorDayRange(candles: CandleWithTime[]): DayRange | null {
  if (!candles.length) return null

  // Find the UTC day of the last candle, then walk back to find the
  // previous day's candles.
  const last = candles[candles.length - 1]
  if (!last.openTime) return null

  const lastDate = new Date(last.openTime)
  const lastDayStart = Date.UTC(
    lastDate.getUTCFullYear(),
    lastDate.getUTCMonth(),
    lastDate.getUTCDate()
  )

  const priorDayStart = lastDayStart - 24 * 3600 * 1000
  const priorDayEnd = lastDayStart

  const priorCandles: CandleWithTime[] = []
  for (const c of candles) {
    if (!c.openTime) continue
    if (c.openTime >= priorDayStart && c.openTime < priorDayEnd) {
      priorCandles.push(c)
    }
  }

  if (!priorCandles.length) return null

  const highs = priorCandles.map((c) => safeNumber(c.high))
  const lows = priorCandles.map((c) => safeNumber(c.low))

  return {
    high: Math.max(...highs),
    low: Math.min(...lows),
    close: safeNumber(priorCandles[priorCandles.length - 1].close)
  }
}
