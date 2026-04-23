/* =========================
LIQUIDITY TYPES
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

export type LiquiditySide = "BUY_SIDE" | "SELL_SIDE"

export type LiquidityZone = {
  price: number
  low: number
  high: number
  touches: number
  startIndex: number
  endIndex: number
  side: LiquiditySide
}

export type LiquiditySweep =
  | "NONE"
  | "BUY_SIDE_SWEEP"
  | "SELL_SIDE_SWEEP"

export type LiquidityAnalysis = {
  buySideZones: LiquidityZone[]
  sellSideZones: LiquidityZone[]
  nearestBuySide: LiquidityZone | null
  nearestSellSide: LiquidityZone | null
  nearBuySideLiquidity: boolean
  nearSellSideLiquidity: boolean
  sweep: LiquiditySweep
  bullishLiquidityConfluence: boolean
  bearishLiquidityConfluence: boolean
  reclaimDetected: boolean
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getLastPrice(candles: Candle[]) {
  return safeNumber(candles[candles.length - 1]?.close)
}

/* =========================
THRESHOLDS
========================= */

function getLiquidityTolerance(symbol: string, timeframe: SignalTimeframe) {
  if (symbol === "XAUUSD" || symbol === "XAUUSDT") {
    return timeframe === "SHORT"
      ? 0.0015
      : timeframe === "MEDIUM"
      ? 0.0025
      : 0.004
  }

  if (symbol === "EURUSD" || symbol === "GBPUSD") {
    return timeframe === "SHORT"
      ? 0.0005
      : timeframe === "MEDIUM"
      ? 0.001
      : 0.0016
  }

  if (symbol.endsWith("USDT")) {
    return timeframe === "SHORT"
      ? 0.002
      : timeframe === "MEDIUM"
      ? 0.004
      : 0.007
  }

  return 0.0012
}

function getNearLiquidityThreshold(symbol: string, timeframe: SignalTimeframe) {
  return getLiquidityTolerance(symbol, timeframe) * 1.15
}

/* =========================
SWING HELPERS
========================= */

function getSwingHighs(candles: Candle[], leftBars = 3, rightBars = 3) {
  const levels: { price: number; index: number }[] = []

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const current = safeNumber(candles[i]?.high)
    if (!current) continue

    let isHigh = true

    for (let l = 1; l <= leftBars; l++) {
      if (safeNumber(candles[i - l]?.high) >= current) {
        isHigh = false
        break
      }
    }

    if (!isHigh) continue

    for (let r = 1; r <= rightBars; r++) {
      if (safeNumber(candles[i + r]?.high) > current) {
        isHigh = false
        break
      }
    }

    if (isHigh) {
      levels.push({
        price: current,
        index: i
      })
    }
  }

  return levels
}

function getSwingLows(candles: Candle[], leftBars = 3, rightBars = 3) {
  const levels: { price: number; index: number }[] = []

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const current = safeNumber(candles[i]?.low)
    if (!current) continue

    let isLow = true

    for (let l = 1; l <= leftBars; l++) {
      const prev = safeNumber(candles[i - l]?.low)
      if (prev !== 0 && prev <= current) {
        isLow = false
        break
      }
    }

    if (!isLow) continue

    for (let r = 1; r <= rightBars; r++) {
      const next = safeNumber(candles[i + r]?.low)
      if (next !== 0 && next < current) {
        isLow = false
        break
      }
    }

    if (isLow) {
      levels.push({
        price: current,
        index: i
      })
    }
  }

  return levels
}

/* =========================
LEVEL CLUSTERING
========================= */

function clusterLiquidityLevels(
  levels: { price: number; index: number }[],
  tolerancePercent: number,
  side: LiquiditySide
): LiquidityZone[] {
  if (!levels.length) return []

  const sorted = [...levels].sort((a, b) => a.price - b.price)
  const zones: LiquidityZone[] = []

  for (const level of sorted) {
    const existing = zones.find((zone) => {
      const tolerance = zone.price * tolerancePercent
      return Math.abs(zone.price - level.price) <= tolerance
    })

    if (!existing) {
      zones.push({
        price: level.price,
        low: level.price,
        high: level.price,
        touches: 1,
        startIndex: level.index,
        endIndex: level.index,
        side
      })
      continue
    }

    existing.low = Math.min(existing.low, level.price)
    existing.high = Math.max(existing.high, level.price)
    existing.touches += 1
    existing.startIndex = Math.min(existing.startIndex, level.index)
    existing.endIndex = Math.max(existing.endIndex, level.index)
    existing.price = avg([existing.low, existing.high])
  }

  return zones
    .filter((zone) => zone.touches >= 1)
    .sort((a, b) => b.touches - a.touches)
    .slice(0, 8)
}

/* =========================
LIQUIDITY ZONES
========================= */

export function getBuySideLiquidityZones(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
) {
  const highs = getSwingHighs(candles)
  return clusterLiquidityLevels(
    highs,
    getLiquidityTolerance(symbol, timeframe),
    "BUY_SIDE"
  )
}

export function getSellSideLiquidityZones(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
) {
  const lows = getSwingLows(candles)
  return clusterLiquidityLevels(
    lows,
    getLiquidityTolerance(symbol, timeframe),
    "SELL_SIDE"
  )
}

/* =========================
ZONE PROXIMITY
========================= */

export function isPriceNearLiquidityZone(
  price: number,
  zone: LiquidityZone | null,
  symbol: string,
  timeframe: SignalTimeframe
) {
  if (!price || !zone) return false

  const threshold = price * getNearLiquidityThreshold(symbol, timeframe)

  if (price >= zone.low && price <= zone.high) return true
  return Math.abs(price - zone.price) <= threshold
}

export function getNearestBuySideLiquidity(
  price: number,
  zones: LiquidityZone[]
) {
  const above = zones
    .filter((zone) => zone.price >= price)
    .sort((a, b) => a.price - b.price)

  return above[0] ?? null
}

export function getNearestSellSideLiquidity(
  price: number,
  zones: LiquidityZone[]
) {
  const below = zones
    .filter((zone) => zone.price <= price)
    .sort((a, b) => b.price - a.price)

  return below[0] ?? null
}

/* =========================
SWEEP DETECTION
========================= */

export function detectLiquiditySweep(
  candles: Candle[],
  nearestBuySide: LiquidityZone | null,
  nearestSellSide: LiquidityZone | null
): LiquiditySweep {
  if (candles.length < 3) return "NONE"

  const last = candles[candles.length - 1]
  const lastHigh = safeNumber(last?.high)
  const lastLow = safeNumber(last?.low)
  const lastClose = safeNumber(last?.close)

  if (!lastHigh || !lastLow || !lastClose) return "NONE"

  if (nearestBuySide) {
    const wickedThrough = lastHigh > nearestBuySide.high
    const closedBackBelow = lastClose <= nearestBuySide.high
    if (wickedThrough && closedBackBelow) {
      return "BUY_SIDE_SWEEP"
    }
  }

  if (nearestSellSide) {
    const wickedThrough = lastLow < nearestSellSide.low
    const closedBackAbove = lastClose >= nearestSellSide.low
    if (wickedThrough && closedBackAbove) {
      return "SELL_SIDE_SWEEP"
    }
  }

  return "NONE"
}

export function hasLiquidityReclaim(
  candles: Candle[],
  sweep: LiquiditySweep,
  zone: LiquidityZone | null
) {
  if (candles.length < 4 || sweep === "NONE" || !zone) return false

  const last = candles[candles.length - 1]
  const lastClose = safeNumber(last?.close)

  if (!lastClose) return false

  if (sweep === "SELL_SIDE_SWEEP") {
    return lastClose >= zone.low
  }

  if (sweep === "BUY_SIDE_SWEEP") {
    return lastClose <= zone.high
  }

  return false
}

/* =========================
CONFLUENCE LOGIC
========================= */

export function hasBullishLiquidityConfluence(
  candles: Candle[],
  nearestSellSide: LiquidityZone | null,
  symbol: string,
  timeframe: SignalTimeframe
) {
  const price = getLastPrice(candles)
  const nearSellSide = isPriceNearLiquidityZone(
    price,
    nearestSellSide,
    symbol,
    timeframe
  )

  if (!nearSellSide) return false

  const sweep = detectLiquiditySweep(candles, null, nearestSellSide)
  const reclaim = hasLiquidityReclaim(candles, sweep, nearestSellSide)

  return sweep === "SELL_SIDE_SWEEP" && reclaim
}

export function hasBearishLiquidityConfluence(
  candles: Candle[],
  nearestBuySide: LiquidityZone | null,
  symbol: string,
  timeframe: SignalTimeframe
) {
  const price = getLastPrice(candles)
  const nearBuySide = isPriceNearLiquidityZone(
    price,
    nearestBuySide,
    symbol,
    timeframe
  )

  if (!nearBuySide) return false

  const sweep = detectLiquiditySweep(candles, nearestBuySide, null)
  const reclaim = hasLiquidityReclaim(candles, sweep, nearestBuySide)

  return sweep === "BUY_SIDE_SWEEP" && reclaim
}

/* =========================
FULL ANALYSIS
========================= */

export function analyzeLiquidity(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
): LiquidityAnalysis {
  const price = getLastPrice(candles)
  let score = 50
  const reasons: string[] = []

  const buySideZones = getBuySideLiquidityZones(symbol, candles, timeframe)
  const sellSideZones = getSellSideLiquidityZones(symbol, candles, timeframe)

  const nearestBuySide = getNearestBuySideLiquidity(price, buySideZones)
  const nearestSellSide = getNearestSellSideLiquidity(price, sellSideZones)

  const nearBuySideLiquidity = isPriceNearLiquidityZone(
    price,
    nearestBuySide,
    symbol,
    timeframe
  )

  const nearSellSideLiquidity = isPriceNearLiquidityZone(
    price,
    nearestSellSide,
    symbol,
    timeframe
  )

  const sweep = detectLiquiditySweep(
    candles,
    nearestBuySide,
    nearestSellSide
  )

  const reclaimDetected =
    hasLiquidityReclaim(candles, sweep, nearestBuySide) ||
    hasLiquidityReclaim(candles, sweep, nearestSellSide)

  const bullishLiquidityConfluence = hasBullishLiquidityConfluence(
    candles,
    nearestSellSide,
    symbol,
    timeframe
  )

  const bearishLiquidityConfluence = hasBearishLiquidityConfluence(
    candles,
    nearestBuySide,
    symbol,
    timeframe
  )

  if (buySideZones.length > 0) {
    score += 4
    reasons.push("BUY_SIDE_LIQUIDITY_DETECTED")
  }

  if (sellSideZones.length > 0) {
    score += 4
    reasons.push("SELL_SIDE_LIQUIDITY_DETECTED")
  }

  if (nearBuySideLiquidity) {
    score += 3
    reasons.push("PRICE_NEAR_BUY_SIDE_LIQUIDITY")
  }

  if (nearSellSideLiquidity) {
    score += 3
    reasons.push("PRICE_NEAR_SELL_SIDE_LIQUIDITY")
  }

  if (sweep === "BUY_SIDE_SWEEP") {
    score += 4
    reasons.push("BUY_SIDE_SWEEP_DETECTED")
  }

  if (sweep === "SELL_SIDE_SWEEP") {
    score += 4
    reasons.push("SELL_SIDE_SWEEP_DETECTED")
  }

  if (reclaimDetected) {
    score += 6
    reasons.push("LIQUIDITY_RECLAIM_DETECTED")
  }

  if (bullishLiquidityConfluence) {
    score += 8
    reasons.push("BULLISH_LIQUIDITY_CONFLUENCE")
  }

  if (bearishLiquidityConfluence) {
    score += 8
    reasons.push("BEARISH_LIQUIDITY_CONFLUENCE")
  }

  if (!bullishLiquidityConfluence && !bearishLiquidityConfluence) {
    score -= 3
  }

  score = clamp(score, 0, 100)

  return {
    buySideZones,
    sellSideZones,
    nearestBuySide,
    nearestSellSide,
    nearBuySideLiquidity,
    nearSellSideLiquidity,
    sweep,
    bullishLiquidityConfluence,
    bearishLiquidityConfluence,
    reclaimDetected,
    score,
    reasons
  }
}