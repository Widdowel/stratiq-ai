/* =========================
STRUCTURE TYPES
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

export type StructureLevelType =
  | "SUPPORT"
  | "RESISTANCE"
  | "LIQUIDITY_HIGH"
  | "LIQUIDITY_LOW"

export type StructureLevel = {
  price: number
  touches: number
  index: number
  type: StructureLevelType
}

export type StructureZone = {
  low: number
  high: number
  mid: number
  touches: number
  type: "SUPPORT" | "RESISTANCE"
}

export type StructureAnalysis = {
  supports: StructureZone[]
  resistances: StructureZone[]
  nearestSupport: StructureZone | null
  nearestResistance: StructureZone | null
  nearSupport: boolean
  nearResistance: boolean
  validBuyZone: boolean
  validSellZone: boolean
  pullbackValid: boolean
  breakoutState: "NONE" | "BULLISH_BREAKOUT" | "BEARISH_BREAKOUT"
  retestValid: boolean
  cleanStructure: boolean
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

function getZoneTolerance(symbol: string, timeframe: SignalTimeframe) {
  if (symbol === "XAUUSD" || symbol === "XAUUSDT") {
    return timeframe === "SHORT"
      ? 0.002
      : timeframe === "MEDIUM"
      ? 0.003
      : 0.0045
  }

  if (symbol === "EURUSD" || symbol === "GBPUSD") {
    return timeframe === "SHORT"
      ? 0.0007
      : timeframe === "MEDIUM"
      ? 0.0012
      : 0.0018
  }

  if (symbol.endsWith("USDT")) {
    return timeframe === "SHORT"
      ? 0.003
      : timeframe === "MEDIUM"
      ? 0.005
      : 0.008
  }

  return 0.0015
}

function getNearZoneThreshold(symbol: string, timeframe: SignalTimeframe) {
  return getZoneTolerance(symbol, timeframe) * 1.15
}

/* =========================
SWING DETECTION
========================= */

export function getSwingHighs(
  candles: Candle[],
  leftBars = 3,
  rightBars = 3
): StructureLevel[] {
  const swings: StructureLevel[] = []

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const current = safeNumber(candles[i]?.high)
    if (!current) continue

    let isSwingHigh = true

    for (let l = 1; l <= leftBars; l++) {
      if (safeNumber(candles[i - l]?.high) >= current) {
        isSwingHigh = false
        break
      }
    }

    if (!isSwingHigh) continue

    for (let r = 1; r <= rightBars; r++) {
      if (safeNumber(candles[i + r]?.high) > current) {
        isSwingHigh = false
        break
      }
    }

    if (!isSwingHigh) continue

    swings.push({
      price: current,
      touches: 1,
      index: i,
      type: "RESISTANCE"
    })
  }

  return swings
}

export function getSwingLows(
  candles: Candle[],
  leftBars = 3,
  rightBars = 3
): StructureLevel[] {
  const swings: StructureLevel[] = []

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const current = safeNumber(candles[i]?.low)
    if (!current) continue

    let isSwingLow = true

    for (let l = 1; l <= leftBars; l++) {
      const prev = safeNumber(candles[i - l]?.low)
      if (prev !== 0 && prev <= current) {
        isSwingLow = false
        break
      }
    }

    if (!isSwingLow) continue

    for (let r = 1; r <= rightBars; r++) {
      const next = safeNumber(candles[i + r]?.low)
      if (next !== 0 && next < current) {
        isSwingLow = false
        break
      }
    }

    if (!isSwingLow) continue

    swings.push({
      price: current,
      touches: 1,
      index: i,
      type: "SUPPORT"
    })
  }

  return swings
}

/* =========================
LEVEL CLUSTERING
========================= */

function clusterLevels(
  levels: StructureLevel[],
  tolerancePercent: number,
  zoneType: "SUPPORT" | "RESISTANCE"
): StructureZone[] {
  if (!levels.length) return []

  const sorted = [...levels].sort((a, b) => a.price - b.price)
  const clusters: StructureZone[] = []

  for (const level of sorted) {
    const matchingCluster = clusters.find((cluster) => {
      const tolerance = cluster.mid * tolerancePercent
      return Math.abs(cluster.mid - level.price) <= tolerance
    })

    if (!matchingCluster) {
      clusters.push({
        low: level.price,
        high: level.price,
        mid: level.price,
        touches: 1,
        type: zoneType
      })
      continue
    }

    matchingCluster.low = Math.min(matchingCluster.low, level.price)
    matchingCluster.high = Math.max(matchingCluster.high, level.price)
    matchingCluster.touches += 1
    matchingCluster.mid = avg([matchingCluster.low, matchingCluster.high])
  }

  return clusters
    .filter((cluster) => cluster.touches >= 1)
    .sort((a, b) => b.touches - a.touches)
    .slice(0, 8)
}

/* =========================
SUPPORT / RESISTANCE ZONES
========================= */

export function getSupportZones(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
): StructureZone[] {
  const lows = getSwingLows(candles)
  return clusterLevels(lows, getZoneTolerance(symbol, timeframe), "SUPPORT")
}

export function getResistanceZones(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe
): StructureZone[] {
  const highs = getSwingHighs(candles)
  return clusterLevels(highs, getZoneTolerance(symbol, timeframe), "RESISTANCE")
}

/* =========================
ZONE PROXIMITY
========================= */

export function isPriceNearZone(
  price: number,
  zone: StructureZone | null,
  symbol: string,
  timeframe: SignalTimeframe
) {
  if (!price || !zone) return false

  const threshold = price * getNearZoneThreshold(symbol, timeframe)

  if (price >= zone.low && price <= zone.high) return true
  return Math.abs(price - zone.mid) <= threshold
}

export function getNearestSupport(
  price: number,
  supports: StructureZone[]
): StructureZone | null {
  const below = supports
    .filter((zone) => zone.mid <= price)
    .sort((a, b) => b.mid - a.mid)

  return below[0] ?? null
}

export function getNearestResistance(
  price: number,
  resistances: StructureZone[]
): StructureZone | null {
  const above = resistances
    .filter((zone) => zone.mid >= price)
    .sort((a, b) => a.mid - b.mid)

  return above[0] ?? null
}

/* =========================
PULLBACK / STRUCTURE
========================= */

export function hasPullbackStructure(
  candles: Candle[],
  direction: SignalDirection,
  lookback = 8
) {
  if (candles.length < lookback) return false

  const closes = candles.slice(-lookback).map((c) => safeNumber(c.close))
  if (closes.some((value) => !value)) return false

  let hadPullback = false
  let resumed = false

  for (let i = 1; i < closes.length; i++) {
    const move = closes[i] - closes[i - 1]

    if (direction === "BUY") {
      if (move < 0) hadPullback = true
      if (hadPullback && move > 0) resumed = true
    }

    if (direction === "SELL") {
      if (move > 0) hadPullback = true
      if (hadPullback && move < 0) resumed = true
    }
  }

  return hadPullback && resumed
}

export function hasCleanRecentStructure(
  candles: Candle[],
  direction: SignalDirection,
  lookback = 6
) {
  if (candles.length < lookback) return false

  const closes = candles.slice(-lookback).map((c) => safeNumber(c.close))
  if (closes.some((value) => !value)) return false

  let alignedMoves = 0

  for (let i = 1; i < closes.length; i++) {
    const move = closes[i] - closes[i - 1]

    if (direction === "BUY" && move > 0) alignedMoves++
    if (direction === "SELL" && move < 0) alignedMoves++
  }

  return alignedMoves >= 3
}

/* =========================
BREAKOUT / RETEST
========================= */

export function detectBreakoutState(
  candles: Candle[],
  nearestSupport: StructureZone | null,
  nearestResistance: StructureZone | null
): "NONE" | "BULLISH_BREAKOUT" | "BEARISH_BREAKOUT" {
  if (candles.length < 3) return "NONE"

  const lastClose = safeNumber(candles[candles.length - 1]?.close)
  const lastHigh = safeNumber(candles[candles.length - 1]?.high)
  const lastLow = safeNumber(candles[candles.length - 1]?.low)
  const prevClose = safeNumber(candles[candles.length - 2]?.close)

  if (!lastClose || !lastHigh || !lastLow || !prevClose) return "NONE"

  if (nearestResistance) {
    if (prevClose <= nearestResistance.high && lastClose > nearestResistance.high) {
      return "BULLISH_BREAKOUT"
    }
  }

  if (nearestSupport) {
    if (prevClose >= nearestSupport.low && lastClose < nearestSupport.low) {
      return "BEARISH_BREAKOUT"
    }
  }

  return "NONE"
}

export function hasValidRetest(
  candles: Candle[],
  breakoutState: "NONE" | "BULLISH_BREAKOUT" | "BEARISH_BREAKOUT",
  zone: StructureZone | null,
  symbol: string,
  timeframe: SignalTimeframe
) {
  if (candles.length < 4 || breakoutState === "NONE" || !zone) return false

  const closes = candles.slice(-4).map((c) => safeNumber(c.close))
  if (closes.some((value) => !value)) return false

  const last = closes[closes.length - 1]
  const previous = closes[closes.length - 2]
  const threshold = last * getNearZoneThreshold(symbol, timeframe)

  if (breakoutState === "BULLISH_BREAKOUT") {
    const touchedZone = Math.abs(previous - zone.high) <= threshold
    return touchedZone && last >= zone.high
  }

  if (breakoutState === "BEARISH_BREAKOUT") {
    const touchedZone = Math.abs(previous - zone.low) <= threshold
    return touchedZone && last <= zone.low
  }

  return false
}

/* =========================
VALID ZONE LOGIC
========================= */

export function isValidBuyZone(
  price: number,
  support: StructureZone | null,
  resistance: StructureZone | null,
  symbol: string,
  timeframe: SignalTimeframe
) {
  const nearSupport = isPriceNearZone(price, support, symbol, timeframe)

  if (!nearSupport) return false
  if (!resistance) return true

  const roomToResistance = (resistance.mid - price) / price
  return roomToResistance > getNearZoneThreshold(symbol, timeframe) * 1.2
}

export function isValidSellZone(
  price: number,
  support: StructureZone | null,
  resistance: StructureZone | null,
  symbol: string,
  timeframe: SignalTimeframe
) {
  const nearResistance = isPriceNearZone(price, resistance, symbol, timeframe)

  if (!nearResistance) return false
  if (!support) return true

  const roomToSupport = (price - support.mid) / price
  return roomToSupport > getNearZoneThreshold(symbol, timeframe) * 1.2
}

/* =========================
FULL STRUCTURE ANALYSIS
========================= */

export function analyzeStructure(
  symbol: string,
  candles: Candle[],
  timeframe: SignalTimeframe,
  direction?: SignalDirection
): StructureAnalysis {
  const price = getLastPrice(candles)
  const reasons: string[] = []
  let score = 50

  const supports = getSupportZones(symbol, candles, timeframe)
  const resistances = getResistanceZones(symbol, candles, timeframe)

  const nearestSupport = getNearestSupport(price, supports)
  const nearestResistance = getNearestResistance(price, resistances)

  const nearSupport = isPriceNearZone(
    price,
    nearestSupport,
    symbol,
    timeframe
  )

  const nearResistance = isPriceNearZone(
    price,
    nearestResistance,
    symbol,
    timeframe
  )

  const breakoutState = detectBreakoutState(
    candles,
    nearestSupport,
    nearestResistance
  )

  const retestZone =
    breakoutState === "BULLISH_BREAKOUT"
      ? nearestResistance
      : breakoutState === "BEARISH_BREAKOUT"
      ? nearestSupport
      : null

  const retestValid = hasValidRetest(
    candles,
    breakoutState,
    retestZone,
    symbol,
    timeframe
  )

  const pullbackValid = direction
    ? hasPullbackStructure(candles, direction)
    : false

  const cleanStructure = direction
    ? hasCleanRecentStructure(candles, direction)
    : false

  const validBuyZone = isValidBuyZone(
    price,
    nearestSupport,
    nearestResistance,
    symbol,
    timeframe
  )

  const validSellZone = isValidSellZone(
    price,
    nearestSupport,
    nearestResistance,
    symbol,
    timeframe
  )

  if (supports.length > 0) {
    score += 4
    reasons.push("SUPPORTS_DETECTED")
  }

  if (resistances.length > 0) {
    score += 4
    reasons.push("RESISTANCES_DETECTED")
  }

  if (nearSupport) {
    score += 4
    reasons.push("PRICE_NEAR_SUPPORT")
  }

  if (nearResistance) {
    score += 4
    reasons.push("PRICE_NEAR_RESISTANCE")
  }

  if (validBuyZone) {
    score += 8
    reasons.push("VALID_BUY_ZONE")
  }

  if (validSellZone) {
    score += 8
    reasons.push("VALID_SELL_ZONE")
  }

  if (pullbackValid) {
    score += 5
    reasons.push("PULLBACK_VALID")
  } else if (direction) {
    score -= 2
  }

  if (cleanStructure) {
    score += 6
    reasons.push("CLEAN_RECENT_STRUCTURE")
  } else if (direction) {
    score -= 4
  }

  if (breakoutState === "BULLISH_BREAKOUT") {
    score += 4
    reasons.push("BULLISH_BREAKOUT")
  }

  if (breakoutState === "BEARISH_BREAKOUT") {
    score += 4
    reasons.push("BEARISH_BREAKOUT")
  }

  if (retestValid) {
    score += 6
    reasons.push("VALID_RETEST")
  }

  score = clamp(score, 0, 100)

  return {
    supports,
    resistances,
    nearestSupport,
    nearestResistance,
    nearSupport,
    nearResistance,
    validBuyZone,
    validSellZone,
    pullbackValid,
    breakoutState,
    retestValid,
    cleanStructure,
    score,
    reasons
  }
}