import {
  getTimeframeContextConfig,
  type Market,
  type MarketType,
  type ScanTimeframe
} from "@/lib/markets"

export type Candle = {
  close: number
  volume?: number
}

export type PriceSource = "BINANCE" | "TWELVEDATA" | "MT5"

export type ProviderIssue = {
  source: "BINANCE" | "TWELVEDATA"
  symbol: string
  timeframe?: ScanTimeframe
  interval?: string
  code?: number
  message: string
}

export type LivePriceBook = {
  BINANCE: Record<string, number>
  TWELVEDATA: Record<string, number>
  MT5: Record<string, number>
}

export type MarketContext = {
  trendCandles: Candle[]
  confirmCandles: Candle[]
  entryCandles: Candle[]
}

export type BuildMarketContextResult = {
  context: MarketContext | null
  latestPrice?: number
}

type TwelveDataError = {
  code?: number
  message?: string
  status?: string
}

const candleCache = new Map<string, { data: Candle[]; time: number }>()
const priceCache = new Map<string, { price: number; time: number }>()

const CANDLE_CACHE_TTL_MS = 60_000
const PRICE_CACHE_TTL_MS = 15_000

/* =========================
UTILS
========================= */

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function makeCandleCacheKey(
  symbol: string,
  type: MarketType,
  timeframe: ScanTimeframe,
  interval: string
) {
  return `${symbol}-${type}-${timeframe}-${interval}`
}

function makePriceCacheKey(symbol: string, source: PriceSource) {
  return `${source}-${symbol}`
}

function pruneCacheMap<T extends { time: number }>(
  map: Map<string, T>,
  ttlMs: number
) {
  const now = Date.now()

  for (const [key, value] of map.entries()) {
    if (now - value.time > ttlMs * 3) {
      map.delete(key)
    }
  }
}

export function pruneProviderCaches() {
  pruneCacheMap(candleCache, CANDLE_CACHE_TTL_MS)
  pruneCacheMap(priceCache, PRICE_CACHE_TTL_MS)
}

/* =========================
FETCH
========================= */

async function safeFetch(url: string) {
  const isBinance = url.includes("binance.com")
  const isTwelveData = url.includes("twelvedata.com")

  const timeoutMs =
    isBinance ? 8000 :
    isTwelveData ? 8000 :
    8000

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    })

    const text = await response.text()
    let data: unknown = null

    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }

    if (!response.ok) {
      console.log("Provider HTTP error:", response.status, url)
      console.log("Provider body:", data)
      return null
    }

    return data
  } catch (error: any) {
    if (error?.name === "AbortError") {
      console.log(`Provider fetch aborted after ${timeoutMs}ms: ${url}`)
      return null
    }

    console.log("Provider fetch error:", error)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function isTwelveDataError(data: unknown): data is TwelveDataError {
  return (
    !!data &&
    typeof data === "object" &&
    ("code" in data || "status" in data || "message" in data)
  )
}

/* =========================
SYMBOL / PROVIDER HELPERS
========================= */

export function getMarketPriceSource(
  market: Pick<Market, "type">
): PriceSource {
  if (market.type === "crypto") return "BINANCE"
  return "TWELVEDATA"
}

export function formatForexSymbol(symbol: string) {
  if (symbol === "XAUUSD" || symbol === "XAUUSDT") return "XAU/USD"
  if (symbol === "EURUSD") return "EUR/USD"
  if (symbol === "GBPUSD") return "GBP/USD"

  if (symbol.endsWith("USD") && !symbol.includes("/")) {
    return symbol.replace("USD", "/USD")
  }

  return symbol
}

export function mapIntervalForProvider(type: MarketType, interval: string) {
  if (type === "crypto") {
    if (interval === "5m") return "5m"
    if (interval === "15m") return "15m"
    if (interval === "1h") return "1h"
    if (interval === "4h") return "4h"
    if (interval === "1day") return "1d"
  }

  return interval
}

export function getFallbackIntervals(
  type: MarketType,
  timeframe: ScanTimeframe,
  interval: string
) {
  if (timeframe === "SHORT") {
    if (type === "crypto") {
      if (interval === "5m") return ["5m", "15m"]
      if (interval === "15m") return ["15m"]
      if (interval === "1h") return ["1h"]
    }

    if (type === "forex") {
      if (interval === "5m") return ["15m"]
      if (interval === "15m") return ["1h"]
      if (interval === "1h") return ["1h"]
    }

    if (type === "gold") {
      if (interval === "5m") return ["1h"]
      if (interval === "15m") return ["1h"]
      if (interval === "1h") return ["1h"]
    }
  }

  if (timeframe === "MEDIUM") {
    if (type === "gold") {
      if (interval === "15m") return ["1h"]
      if (interval === "1h") return ["4h"]
      if (interval === "4h") return ["1day"]
    }

    if (interval === "15m") return ["15m", "1h"]
    if (interval === "1h") return ["1h"]
    if (interval === "4h") return ["4h"]
  }

  if (timeframe === "LONG") {
    if (type === "gold") {
      if (interval === "1h") return ["4h"]
      if (interval === "4h") return ["1day"]
      if (interval === "1day") return ["1day"]
    }

    if (interval === "1h") return ["1h"]
    if (interval === "4h") return ["4h"]
    if (interval === "1day") return ["1day"]
  }

  return [interval]
}

/* =========================
PROVIDER ISSUES
========================= */

function pushProviderIssue(
  providerIssues: ProviderIssue[],
  issue: ProviderIssue
) {
  const exists = providerIssues.some(
    (item) =>
      item.source === issue.source &&
      item.symbol === issue.symbol &&
      item.timeframe === issue.timeframe &&
      item.interval === issue.interval &&
      item.code === issue.code &&
      item.message === issue.message
  )

  if (!exists) {
    providerIssues.push(issue)
  }
}

/* =========================
CANDLE FETCHERS
========================= */

async function fetchBinanceCandles(
  symbol: string,
  timeframe: ScanTimeframe,
  interval: string,
  providerIssues: ProviderIssue[]
): Promise<Candle[]> {
  const data = await safeFetch(
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=120`
  )

  if (!Array.isArray(data)) {
    pushProviderIssue(providerIssues, {
      source: "BINANCE",
      symbol,
      timeframe,
      interval,
      message: "BINANCE returned no candles"
    })
    return []
  }

  return data
    .map((row: any) => ({
      close: safeNumber(row?.[4]),
      volume: safeNumber(row?.[5])
    }))
    .filter((candle) => candle.close > 0)
}

async function fetchTwelveDataCandles(
  symbol: string,
  timeframe: ScanTimeframe,
  interval: string,
  providerIssues: ProviderIssue[]
): Promise<Candle[]> {
  const apiSymbol = formatForexSymbol(symbol)

  const data = await safeFetch(
    `https://api.twelvedata.com/time_series?symbol=${apiSymbol}&interval=${interval}&outputsize=120&apikey=${process.env.TWELVE_KEY}`
  )

  if (
    isTwelveDataError(data) &&
    (data.status === "error" || typeof data.code === "number")
  ) {
    pushProviderIssue(providerIssues, {
      source: "TWELVEDATA",
      symbol,
      timeframe,
      interval,
      code: typeof data.code === "number" ? data.code : undefined,
      message:
        typeof data.message === "string"
          ? data.message
          : "Unknown TwelveData error"
    })

    return []
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("values" in data) ||
    !Array.isArray((data as any).values)
  ) {
    pushProviderIssue(providerIssues, {
      source: "TWELVEDATA",
      symbol,
      timeframe,
      interval,
      message: "TWELVEDATA returned no candles"
    })

    return []
  }

  return [...(data as any).values]
    .reverse()
    .map((row: any) => ({
      close: safeNumber(row?.close),
      volume: safeNumber(row?.volume || 1000)
    }))
    .filter((candle) => candle.close > 0)
}

export async function fetchCandlesFromProvider(
  symbol: string,
  type: MarketType,
  timeframe: ScanTimeframe,
  interval: string,
  providerIssues: ProviderIssue[]
): Promise<Candle[]> {
  if (type === "crypto") {
    const mappedInterval = mapIntervalForProvider(type, interval)
    return fetchBinanceCandles(
      symbol,
      timeframe,
      mappedInterval,
      providerIssues
    )
  }

  return fetchTwelveDataCandles(
    symbol,
    timeframe,
    interval,
    providerIssues
  )
}

/* =========================
PUBLIC CANDLE API
========================= */

export async function getCandles(
  symbol: string,
  type: MarketType,
  timeframe: ScanTimeframe,
  interval: string,
  providerIssues: ProviderIssue[]
): Promise<Candle[]> {
  try {
    const fallbackIntervals = getFallbackIntervals(type, timeframe, interval)

    for (const currentInterval of fallbackIntervals) {
      const cacheKey = makeCandleCacheKey(
        symbol,
        type,
        timeframe,
        currentInterval
      )
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
        currentInterval,
        providerIssues
      )

      candleCache.set(cacheKey, {
        data: candles,
        time: now
      })

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
LIVE PRICE FETCHERS
========================= */

async function fetchBinanceLivePrice(symbol: string): Promise<number | null> {
  const data = await safeFetch(
    `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`
  )

  if (!data || typeof data !== "object") return null

  const price = safeNumber((data as any).price)
  return price > 0 ? price : null
}

async function fetchTwelveDataLivePrice(
  symbol: string
): Promise<number | null> {
  const apiSymbol = formatForexSymbol(symbol)

  const data = await safeFetch(
    `https://api.twelvedata.com/price?symbol=${apiSymbol}&apikey=${process.env.TWELVE_KEY}`
  )

  if (
    isTwelveDataError(data) &&
    (data.status === "error" || typeof data.code === "number")
  ) {
    return null
  }

  if (!data || typeof data !== "object") return null

  const price = safeNumber((data as any).price)
  return price > 0 ? price : null
}

export async function getLivePrice(
  symbol: string,
  type: MarketType
): Promise<{ source: PriceSource; price?: number }> {
  const source: PriceSource = type === "crypto" ? "BINANCE" : "TWELVEDATA"
  const cacheKey = makePriceCacheKey(symbol, source)
  const cached = priceCache.get(cacheKey)
  const now = Date.now()

  if (cached && now - cached.time < PRICE_CACHE_TTL_MS) {
    return {
      source,
      price: cached.price
    }
  }

  const price =
    type === "crypto"
      ? await fetchBinanceLivePrice(symbol)
      : await fetchTwelveDataLivePrice(symbol)

  if (price && price > 0) {
    priceCache.set(cacheKey, {
      price,
      time: now
    })
  }

  return {
    source,
    price: price ?? undefined
  }
}

/* =========================
MARKET CONTEXT
========================= */

export async function buildMarketContext(
  market: Pick<Market, "symbol" | "type">,
  timeframe: ScanTimeframe,
  providerIssues: ProviderIssue[]
): Promise<BuildMarketContextResult> {
  const tfConfig = getTimeframeContextConfig(timeframe)

  const [trendCandles, confirmCandles, entryCandles] = await Promise.all([
    getCandles(
      market.symbol,
      market.type,
      timeframe,
      tfConfig.trend,
      providerIssues
    ),
    getCandles(
      market.symbol,
      market.type,
      timeframe,
      tfConfig.confirm,
      providerIssues
    ),
    getCandles(
      market.symbol,
      market.type,
      timeframe,
      tfConfig.entry,
      providerIssues
    )
  ])

  console.log("CTX DEBUG:", market.symbol, timeframe, {
    trend: trendCandles.length,
    confirm: confirmCandles.length,
    entry: entryCandles.length
  })

  if (
    trendCandles.length < 20 ||
    confirmCandles.length < 20 ||
    entryCandles.length < 20
  ) {
    return {
      context: null,
      latestPrice: entryCandles[entryCandles.length - 1]?.close
    }
  }

  return {
    context: {
      trendCandles,
      confirmCandles,
      entryCandles
    },
    latestPrice: entryCandles[entryCandles.length - 1]?.close
  }
}

/* =========================
LIVE PRICE BOOK
========================= */

export async function buildLivePriceBook(markets: Market[]) {
  const livePrices: LivePriceBook = {
    BINANCE: {},
    TWELVEDATA: {},
    MT5: {}
  }

  const settledResults: {
    symbol: string
    source: PriceSource
    price?: number
  }[] = []

  for (const market of markets) {
    try {
      const result = await getLivePrice(market.symbol, market.type)
      settledResults.push({
        symbol: market.symbol,
        source: result.source,
        price: result.price
      })
    } catch (error) {
      console.log("getLivePrice failed:", market.symbol, error)
    }
  }

  for (const item of settledResults) {
    const { symbol, source, price } = item

    if (!isNonEmptyString(symbol) || !price || price <= 0) {
      continue
    }

    livePrices[source][symbol] = price
  }

  return livePrices
}