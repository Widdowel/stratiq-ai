/* =========================
SCALPING INDICATORS

Clean, OHLC-aware implementations of the indicators we actually use.
All functions assume candles have real open/high/low/close/volume
(Phase 1 already fixed that across the codebase).

Every function is a pure computation - no side effects, no I/O.
========================= */

import type { Candle } from "@/lib/providers"

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function avg(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0
  const m = avg(values)
  const variance =
    values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/* =========================
EMA
========================= */

export function ema(values: number[], period: number): number {
  if (values.length < period) return 0

  const k = 2 / (period + 1)
  let v = avg(values.slice(0, period))

  for (let i = period; i < values.length; i++) {
    v = values[i] * k + v * (1 - k)
  }

  return v
}

export function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return []

  const k = 2 / (period + 1)
  const result: number[] = []

  let v = avg(values.slice(0, period))
  result.push(v)

  for (let i = period; i < values.length; i++) {
    v = values[i] * k + v * (1 - k)
    result.push(v)
  }

  return result
}

/* =========================
RSI (Wilder smoothing)
========================= */

export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50

  let gains = 0
  let losses = 0

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses += -diff
  }

  let avgGain = gains / period
  let avgLoss = losses / period

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const g = diff > 0 ? diff : 0
    const l = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/* =========================
STOCHASTIC
========================= */

export type StochValue = { k: number; d: number }

export function stochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3
): StochValue {
  if (candles.length < kPeriod + dPeriod) return { k: 50, d: 50 }

  const kValues: number[] = []

  for (let i = candles.length - kPeriod - dPeriod + 1; i < candles.length; i++) {
    if (i < kPeriod - 1) continue
    const window = candles.slice(i - kPeriod + 1, i + 1)
    const highs = window.map((c) => safeNumber(c.high))
    const lows = window.map((c) => safeNumber(c.low))
    const closes = candles[i].close

    const hh = Math.max(...highs)
    const ll = Math.min(...lows)

    if (hh === ll) {
      kValues.push(50)
    } else {
      kValues.push(((closes - ll) / (hh - ll)) * 100)
    }
  }

  if (!kValues.length) return { k: 50, d: 50 }

  const k = kValues[kValues.length - 1]
  const d = avg(kValues.slice(-dPeriod))

  return { k, d }
}

/* =========================
TRUE-RANGE ATR (period-based)
========================= */

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0

  const trs: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const p = candles[i - 1]
    const h = safeNumber(c.high)
    const l = safeNumber(c.low)
    const pc = safeNumber(p.close)

    if (!h || !l || !pc) continue

    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }

  if (trs.length < period) return 0

  // Wilder smoothing
  let a = avg(trs.slice(0, period))
  for (let i = period; i < trs.length; i++) {
    a = (a * (period - 1) + trs[i]) / period
  }

  return a
}

export function atrPercent(candles: Candle[], period = 14): number {
  const a = atr(candles, period)
  const last = safeNumber(candles[candles.length - 1]?.close)
  if (!last) return 0
  return a / last
}

/* =========================
BOLLINGER BANDS
========================= */

export type BollingerBands = {
  upper: number
  middle: number
  lower: number
  bandwidth: number // (upper - lower) / middle
}

export function bollinger(
  closes: number[],
  period = 20,
  stddev = 2
): BollingerBands {
  if (closes.length < period) {
    return { upper: 0, middle: 0, lower: 0, bandwidth: 0 }
  }

  const slice = closes.slice(-period)
  const middle = avg(slice)
  const sd = stdev(slice)

  const upper = middle + stddev * sd
  const lower = middle - stddev * sd
  const bandwidth = middle > 0 ? (upper - lower) / middle : 0

  return { upper, middle, lower, bandwidth }
}

/**
 * Rolling bandwidth series so we can detect "squeeze" (contraction)
 * vs "expansion" regimes for breakout setups.
 */
export function bollingerBandwidthSeries(
  closes: number[],
  period = 20,
  stddev = 2,
  lookback = 50
): number[] {
  if (closes.length < period + lookback) return []

  const series: number[] = []

  for (let i = closes.length - lookback; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1)
    const middle = avg(slice)
    const sd = stdev(slice)
    const bw = middle > 0 ? ((middle + stddev * sd) - (middle - stddev * sd)) / middle : 0
    series.push(bw)
  }

  return series
}

/**
 * True if the current bandwidth is below the `quantile` of the
 * rolling `lookback` window (default: bottom 20% = squeeze).
 */
export function isBollingerSqueeze(
  closes: number[],
  period = 20,
  stddev = 2,
  lookback = 50,
  quantile = 0.2
): boolean {
  const series = bollingerBandwidthSeries(closes, period, stddev, lookback)
  if (series.length < lookback) return false

  const current = series[series.length - 1]
  const sorted = [...series].sort((a, b) => a - b)
  const idx = Math.floor(sorted.length * quantile)
  const threshold = sorted[idx]

  return current <= threshold
}

/* =========================
ADX (directional index)
========================= */

export type AdxValue = {
  adx: number
  plusDI: number
  minusDI: number
}

export function adx(candles: Candle[], period = 14): AdxValue {
  if (candles.length < period * 2 + 1) return { adx: 0, plusDI: 0, minusDI: 0 }

  const plusDM: number[] = []
  const minusDM: number[] = []
  const trs: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const p = candles[i - 1]

    const up = safeNumber(c.high) - safeNumber(p.high)
    const down = safeNumber(p.low) - safeNumber(c.low)

    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)

    const hl = safeNumber(c.high) - safeNumber(c.low)
    const hpc = Math.abs(safeNumber(c.high) - safeNumber(p.close))
    const lpc = Math.abs(safeNumber(c.low) - safeNumber(p.close))
    trs.push(Math.max(hl, hpc, lpc))
  }

  // Wilder smoothing
  const smoothed = (arr: number[]): number[] => {
    const out: number[] = []
    let sum = arr.slice(0, period).reduce((s, v) => s + v, 0)
    out.push(sum)
    for (let i = period; i < arr.length; i++) {
      sum = sum - sum / period + arr[i]
      out.push(sum)
    }
    return out
  }

  const smTr = smoothed(trs)
  const smPlus = smoothed(plusDM)
  const smMinus = smoothed(minusDM)

  const plusDI: number[] = []
  const minusDI: number[] = []
  const dx: number[] = []

  for (let i = 0; i < smTr.length; i++) {
    const tr = smTr[i]
    if (!tr) {
      plusDI.push(0)
      minusDI.push(0)
      dx.push(0)
      continue
    }
    const p = (smPlus[i] / tr) * 100
    const m = (smMinus[i] / tr) * 100
    plusDI.push(p)
    minusDI.push(m)
    dx.push(p + m === 0 ? 0 : (Math.abs(p - m) / (p + m)) * 100)
  }

  if (dx.length < period) {
    return {
      adx: 0,
      plusDI: plusDI[plusDI.length - 1] ?? 0,
      minusDI: minusDI[minusDI.length - 1] ?? 0
    }
  }

  let adxVal = avg(dx.slice(0, period))
  for (let i = period; i < dx.length; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period
  }

  return {
    adx: adxVal,
    plusDI: plusDI[plusDI.length - 1] ?? 0,
    minusDI: minusDI[minusDI.length - 1] ?? 0
  }
}

/* =========================
VWAP (session-based)

Resets at the given UTC hour (default 00:00 UTC). Scalpers often use
a session VWAP reset at London (07:00) or NY (13:00). For simplicity
we default to the start of the latest day in the candle array.
========================= */

export type CandleWithTime = Candle & { openTime?: number }

export function vwap(
  candles: CandleWithTime[],
  sessionStartUtcHour = 0
): number {
  if (!candles.length) return 0

  // Find the last occurrence of hour == sessionStartUtcHour
  let start = 0
  for (let i = candles.length - 1; i >= 0; i--) {
    const t = candles[i].openTime
    if (!t) continue
    const date = new Date(t)
    if (
      date.getUTCHours() === sessionStartUtcHour &&
      date.getUTCMinutes() < 10
    ) {
      start = i
      break
    }
  }

  let pvSum = 0
  let volSum = 0

  for (let i = start; i < candles.length; i++) {
    const c = candles[i]
    const typical =
      (safeNumber(c.high) + safeNumber(c.low) + safeNumber(c.close)) / 3
    const v = safeNumber(c.volume)
    if (!typical || !v) continue

    pvSum += typical * v
    volSum += v
  }

  if (volSum === 0) return 0
  return pvSum / volSum
}

/**
 * Simple rolling VWAP for cases where we don't have openTime or for
 * instruments with no volume (forex). Falls back to a typical-price
 * moving average weighted by 1 when volume is missing.
 */
export function rollingVwap(candles: Candle[], lookback = 48): number {
  if (candles.length < lookback) return 0

  const slice = candles.slice(-lookback)
  let pvSum = 0
  let volSum = 0

  for (const c of slice) {
    const typical =
      (safeNumber(c.high) + safeNumber(c.low) + safeNumber(c.close)) / 3
    const v = safeNumber(c.volume) || 1 // fallback for forex no-volume
    pvSum += typical * v
    volSum += v
  }

  if (volSum === 0) return 0
  return pvSum / volSum
}

/* =========================
CANDLE PATTERNS
========================= */

export function isBullishEngulfing(candles: Candle[]): boolean {
  if (candles.length < 2) return false
  const prev = candles[candles.length - 2]
  const last = candles[candles.length - 1]

  const prevBear = prev.close < prev.open
  const lastBull = last.close > last.open
  const engulfs = last.open <= prev.close && last.close >= prev.open

  return prevBear && lastBull && engulfs
}

export function isBearishEngulfing(candles: Candle[]): boolean {
  if (candles.length < 2) return false
  const prev = candles[candles.length - 2]
  const last = candles[candles.length - 1]

  const prevBull = prev.close > prev.open
  const lastBear = last.close < last.open
  const engulfs = last.open >= prev.close && last.close <= prev.open

  return prevBull && lastBear && engulfs
}

export function isBullishPinBar(candles: Candle[]): boolean {
  if (!candles.length) return false
  const c = candles[candles.length - 1]
  const body = Math.abs(c.close - c.open)
  const range = c.high - c.low
  if (range <= 0) return false

  const lowerWick = Math.min(c.close, c.open) - c.low
  return lowerWick >= body * 2 && body <= range * 0.3 && c.close > c.open
}

export function isBearishPinBar(candles: Candle[]): boolean {
  if (!candles.length) return false
  const c = candles[candles.length - 1]
  const body = Math.abs(c.close - c.open)
  const range = c.high - c.low
  if (range <= 0) return false

  const upperWick = c.high - Math.max(c.close, c.open)
  return upperWick >= body * 2 && body <= range * 0.3 && c.close < c.open
}

export function isBullishRejection(candles: Candle[]): boolean {
  return isBullishPinBar(candles) || isBullishEngulfing(candles)
}

export function isBearishRejection(candles: Candle[]): boolean {
  return isBearishPinBar(candles) || isBearishEngulfing(candles)
}

/* =========================
VOLUME HELPERS
========================= */

export function volumeSpike(
  candles: Candle[],
  lookback = 20,
  multiplier = 1.5
): boolean {
  if (candles.length < lookback + 1) return false

  const recent = safeNumber(candles[candles.length - 1].volume)
  if (!recent) return false

  const prior = candles.slice(-lookback - 1, -1).map((c) => safeNumber(c.volume))
  const mean = avg(prior)
  if (mean <= 0) return false

  return recent >= mean * multiplier
}

export function relativeVolume(candles: Candle[], lookback = 20): number {
  if (candles.length < lookback + 1) return 1

  const recent = safeNumber(candles[candles.length - 1].volume)
  const prior = candles.slice(-lookback - 1, -1).map((c) => safeNumber(c.volume))
  const mean = avg(prior)
  if (mean <= 0) return 1

  return recent / mean
}
