import {
  markets,
  Market,
  ScanTimeframe,
  getTimeframeContextConfig
} from "./markets"

/* =========================
CANDLE TYPE
========================= */

export type Candle = {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/* =========================
SCAN RESULT TYPE
========================= */

export type ScanResult = {
  symbol: string
  type: string
  timeframe: ScanTimeframe
  trendCandles: Candle[]
  confirmCandles: Candle[]
  entryCandles: Candle[]
  trend: "BULLISH" | "BEARISH" | "NEUTRAL"
  lastPrice: number
}

type ProviderErrorShape = {
  code?: number
  message?: string
  status?: string
}

/* =========================
CACHE
========================= */

const candleCache = new Map<string, { data: Candle[]; time: number }>()
const CANDLE_CACHE_TTL_MS = 60_000

/* =========================
SAFE NUMBER
========================= */

function safeNumber(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/* =========================
SAFE FETCH
========================= */

async function safeFetch(url: string) {
  try {
    const res = await fetch(url, { cache: "no-store" })
    const text = await res.text()

    let data: unknown = null

    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }

    if (!res.ok) {
      console.log("API error:", res.status, url)
      console.log("API body:", data)
      return null
    }

    return data
  } catch (error) {
    console.log("Fetch error:", error)
    return null
  }
}

function isProviderError(data: unknown): data is ProviderErrorShape {
  return (
    !!data &&
    typeof data === "object" &&
    ("code" in data || "message" in data || "status" in data)
  )
}

/* =========================
FORMAT SYMBOL FOR TWELVEDATA
========================= */

function formatForexSymbol(symbol: string) {
  if (symbol === "XAUUSD" || symbol === "XAUUSDT") return "XAU/USD"
  if (symbol === "EURUSD") return "EUR/USD"
  if (symbol === "GBPUSD") return "GBP/USD"

  if (symbol.endsWith("USD")) {
    return symbol.replace("USD", "/USD")
  }

  return symbol
}

/* =========================
MAP INTERVAL FOR PROVIDER
========================= */

function mapIntervalForProvider(type: string, interval: string) {
  if (type === "crypto") {
    if (interval === "5m") return "5m"
    if (interval === "15m") return "15m"
    if (interval === "1h") return "1h"
    if (interval === "4h") return "4h"
    if (interval === "1day") return "1d"
  }

  return interval
}

function getFallbackIntervals(
  type: string,
  timeframe: ScanTimeframe,
  interval: string
) {
  if (timeframe === "SHORT") {
    if (interval === "5m") {
      return type === "crypto" ? ["5m", "15m"] : ["15m", "1h"]
    }

    if (interval === "15m") {
      return ["15m", "1h"]
    }

    if (interval === "1h") {
      return ["1h", "4h"]
    }
  }

  if (timeframe === "MEDIUM") {
    if (interval === "15m") return ["15m", "1h"]
    if (interval === "1h") return ["1h", "4h"]
    if (interval === "4h") return ["4h", "1day"]
  }

  if (timeframe === "LONG") {
    if (interval === "1h") return ["1h", "4h"]
    if (interval === "4h") return ["4h", "1day"]
    if (interval === "1day") return ["1day"]
  }

  return [interval]
}

/* =========================
MARKET THRESHOLDS
========================= */

function getTrendThreshold(symbol: string, timeframe: ScanTimeframe) {
  if (symbol === "XAUUSD" || symbol === "XAUUSDT") {
    return timeframe === "SHORT" ? 0.002 : timeframe === "MEDIUM" ? 0.0035 : 0.005
  }

  if (symbol === "EURUSD" || symbol === "GBPUSD") {
    return timeframe === "SHORT" ? 0.0008 : timeframe === "MEDIUM" ? 0.0014 : 0.0022
  }

  if (symbol.endsWith("USDT")) {
    return timeframe === "SHORT" ? 0.0035 : timeframe === "MEDIUM" ? 0.006 : 0.01
  }

  return 0.0015
}

/* =========================
HELPERS
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

function detectTrend(
  symbol: string,
  candles: Candle[],
  timeframe: ScanTimeframe
): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (!candles.length || candles.length < 20) return "NEUTRAL"

  const move = getMove(candles, 12)
  const momentum = getRecentMomentum(candles)
  const threshold = getTrendThreshold(symbol, timeframe)

  if (move > threshold && momentum > 0) return "BULLISH"
  if (move < -threshold && momentum < 0) return "BEARISH"

  return "NEUTRAL"
}

/* =========================
GET CANDLES
========================= */

async function fetchCandlesFromProvider(
  symbol: string,
  type: string,
  timeframe: ScanTimeframe,
  interval: string
): Promise<Candle[]> {
  if (type === "crypto") {
    const binanceInterval = mapIntervalForProvider(type, interval)

    const data = await safeFetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${binanceInterval}&limit=120`
    )

    if (!Array.isArray(data)) {
      console.log(symbol, timeframe, interval, "⛔ crypto candles missing")
      return []
    }

    return data
      .map((c: any) => ({
        open: safeNumber(c[1]),
        high: safeNumber(c[2]),
        low: safeNumber(c[3]),
        close: safeNumber(c[4]),
        volume: safeNumber(c[5])
      }))
      .filter((c) => c.close > 0 && c.high > 0 && c.low > 0)
  }

  const apiSymbol = formatForexSymbol(symbol)

  const data = await safeFetch(
    `https://api.twelvedata.com/time_series?symbol=${apiSymbol}&interval=${interval}&outputsize=120&apikey=${process.env.TWELVE_KEY}`
  )

  if (
    isProviderError(data) &&
    (data.status === "error" || typeof data.code === "number")
  ) {
    console.log(symbol, timeframe, interval, "⛔ provider error:", data)
    return []
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("values" in data) ||
    !Array.isArray((data as any).values)
  ) {
    console.log(symbol, timeframe, interval, "⛔ forex/gold candles missing:", apiSymbol)
    return []
  }

  return [...(data as any).values]
    .reverse()
    .map((c: any) => ({
      open: safeNumber(c.open),
      high: safeNumber(c.high),
      low: safeNumber(c.low),
      close: safeNumber(c.close),
      volume: c.volume !== undefined ? safeNumber(c.volume) : 0
    }))
    .filter((c) => c.close > 0 && c.high > 0 && c.low > 0)
}

async function getCandles(
  symbol: string,
  type: string,
  timeframe: ScanTimeframe,
  interval: string
): Promise<Candle[]> {
  try {
    const fallbackIntervals = getFallbackIntervals(type, timeframe, interval)

    for (const currentInterval of fallbackIntervals) {
      const cacheKey = `${symbol}-${type}-${timeframe}-${currentInterval}`
      const cached = candleCache.get(cacheKey)
      const now = Date.now()

      if (cached && now - cached.time < CANDLE_CACHE_TTL_MS) {
        if (cached.data.length >= 20) {
          return cached.data
        }
      }

      const candles = await fetchCandlesFromProvider(
        symbol,
        type,
        timeframe,
        currentInterval
      )

      candleCache.set(cacheKey, { data: candles, time: now })

      if (candles.length >= 20) {
        if (currentInterval !== interval) {
          console.log(
            `${symbol} [${timeframe}] fallback interval used: ${interval} -> ${currentInterval}`
          )
        }

        return candles
      }
    }

    return []
  } catch (error) {
    console.log("getCandles error:", symbol, timeframe, interval, error)
    return []
  }
}

/* =========================
SCAN SINGLE MARKET
========================= */

async function scanMarket(
  market: Market,
  timeframe: ScanTimeframe
): Promise<ScanResult | null> {
  const { symbol, type } = market
  const tfConfig = getTimeframeContextConfig(timeframe)

  console.log(`🔍 Scanning: ${symbol} [${timeframe}]`)

  const [trendCandles, confirmCandles, entryCandles] = await Promise.all([
    getCandles(symbol, type, timeframe, tfConfig.trend),
    getCandles(symbol, type, timeframe, tfConfig.confirm),
    getCandles(symbol, type, timeframe, tfConfig.entry)
  ])

  console.log("CTX DEBUG:", symbol, timeframe, {
    trend: trendCandles.length,
    confirm: confirmCandles.length,
    entry: entryCandles.length
  })

  if (
    trendCandles.length < 20 ||
    confirmCandles.length < 20 ||
    entryCandles.length < 20
  ) {
    console.log(symbol, timeframe, "⛔ not enough candles")
    return null
  }

  const trend = detectTrend(symbol, trendCandles, timeframe)
  const lastPrice = safeNumber(entryCandles[entryCandles.length - 1]?.close)

  if (!lastPrice) {
    console.log(symbol, timeframe, "⛔ invalid last price")
    return null
  }

  console.log(symbol, timeframe, "trend:", trend, "lastPrice:", lastPrice)

  return {
    symbol,
    type,
    timeframe,
    trendCandles,
    confirmCandles,
    entryCandles,
    trend,
    lastPrice
  }
}

/* =========================
RUN MARKET SCANNER
========================= */

export async function runMarketScanner(
  timeframe: ScanTimeframe = "SHORT"
) {
  console.log(`🚀 STRATIQ-2 Market Scanner Started [${timeframe}]`)
  console.log("TWELVE_KEY loaded:", !!process.env.TWELVE_KEY)

  const settled = await Promise.allSettled(
    markets.map((market) => scanMarket(market, timeframe))
  )

  const results: ScanResult[] = []

  for (const item of settled) {
    if (item.status === "fulfilled" && item.value) {
      results.push(item.value)
    }

    if (item.status === "rejected") {
      console.log("scanMarket rejected:", item.reason)
    }
  }

  console.log("✅ Markets scanned:", results.length)

  return results
}