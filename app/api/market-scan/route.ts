import { NextResponse } from "next/server"

import { markets, type ScanTimeframe } from "@/lib/markets"
import { generateSignals } from "@/lib/signalEngine"
import { evaluateRisk } from "@/lib/riskEngine"
import { getMacroNews } from "@/lib/macroNews"
import { evaluateMacroRisk } from "@/lib/macroFilter"
import { monitorOpenTrades, type LivePriceBook } from "@/lib/tradeMonitor"
import {
  buildMarketContext,
  buildLivePriceBook,
  getMarketPriceSource,
  pruneProviderCaches,
  type ProviderIssue
} from "@/lib/providers"

type ScannedSignal = {
  id: string
  symbol: string
  timeframe: ScanTimeframe
  direction: "BUY" | "SELL"
  entry: number
  tp: number
  sl: number
  confidence: number
  positionSize: number
  macroRisk: "LOW" | "MEDIUM" | "HIGH"
  macroNote: string
  macroEvents: unknown[]
}

type ProviderSummary = {
  ok: boolean
  blocked?: boolean
  message: string | null
}

type ScanResponse = {
  success: boolean
  timeframe: ScanTimeframe
  signals: ScannedSignal[]
  total: number
  scannedMarkets: number
  macroEventsCount: number
  updatedTradesCount: number
  providerIssues: ProviderIssue[]
  cached: boolean
  debug: {
    scannedContexts: number
    rawSignals: number
    acceptedSignals: number
    finalSignals: number
  }
  providers: {
    twelveData: ProviderSummary
    binance: ProviderSummary
  }
}

type CachedScanResult = {
  time: number
  response: ScanResponse
}

type ScanMarketResult = {
  signals: ReturnType<typeof generateSignals>
  latestPrice?: number
  hasContext: boolean
}

const scanResponseCache = new Map<string, CachedScanResult>()
const pendingScans = new Map<ScanTimeframe, Promise<ScanResponse>>()

const SCAN_TTL: Record<ScanTimeframe, number> = {
  SHORT: 60 * 60_000,
  MEDIUM: 4 * 60 * 60_000,
  LONG: 12 * 60 * 60_000
}

const MIN_RR: Record<ScanTimeframe, number> = {
  SHORT: 1.35,
  MEDIUM: 1.5,
  LONG: 1.7
}

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function createSignalId(
  symbol: string,
  timeframe: ScanTimeframe,
  direction: "BUY" | "SELL",
  entry: number
) {
  return `${symbol}-${timeframe}-${direction}-${entry.toFixed(4)}`
}

function getRiskReward(signal: {
  direction: "BUY" | "SELL"
  entry: number
  tp: number
  sl: number
}) {
  const reward =
    signal.direction === "BUY"
      ? signal.tp - signal.entry
      : signal.entry - signal.tp

  const risk =
    signal.direction === "BUY"
      ? signal.entry - signal.sl
      : signal.sl - signal.entry

  if (!Number.isFinite(reward) || !Number.isFinite(risk) || risk <= 0) {
    return 0
  }

  return reward / risk
}

function isTradableSignal(
  signal: {
    direction: "BUY" | "SELL"
    entry: number
    tp: number
    sl: number
    confidence: number
  },
  timeframe: ScanTimeframe
) {
  if (
    signal.entry <= 0 ||
    signal.tp <= 0 ||
    signal.sl <= 0 ||
    !Number.isFinite(signal.entry) ||
    !Number.isFinite(signal.tp) ||
    !Number.isFinite(signal.sl)
  ) {
    return false
  }

  const rr = getRiskReward(signal)
  if (rr < MIN_RR[timeframe]) return false

  if (signal.direction === "BUY") {
    if (!(signal.tp > signal.entry && signal.sl < signal.entry)) return false
  } else {
    if (!(signal.tp < signal.entry && signal.sl > signal.entry)) return false
  }

  return true
}

function dedupeSignals(signals: ScannedSignal[]) {
  return signals.filter((signal, index, arr) => {
    const firstIndex = arr.findIndex(
      (s) =>
        s.symbol === signal.symbol &&
        s.timeframe === signal.timeframe &&
        s.direction === signal.direction &&
        Math.abs(s.entry - signal.entry) <
          Math.max(signal.entry * 0.001, 0.0005)
    )

    return firstIndex === index
  })
}

function pruneScanResponseCache() {
  const now = Date.now()

  for (const [key, value] of scanResponseCache.entries()) {
    const ttl = SCAN_TTL[key as ScanTimeframe] ?? 60_000

    if (now - value.time > ttl * 3) {
      scanResponseCache.delete(key)
    }
  }
}

function getTimeframeFromBody(body: any): ScanTimeframe {
  if (body?.timeframe === "MEDIUM") return "MEDIUM"
  if (body?.timeframe === "LONG") return "LONG"
  return "SHORT"
}

function buildProviderSummary(providerIssues: ProviderIssue[]) {
  const twelveDataIssues = providerIssues.filter(
    (issue) => issue.source === "TWELVEDATA"
  )

  const binanceIssues = providerIssues.filter(
    (issue) => issue.source === "BINANCE"
  )

  return {
    twelveData: {
      ok: twelveDataIssues.length === 0,
      blocked: twelveDataIssues.some((issue) => issue.code === 429),
      message: twelveDataIssues[0]?.message ?? null
    },
    binance: {
      ok: binanceIssues.length === 0,
      message: binanceIssues[0]?.message ?? null
    }
  }
}

function createEmptyLivePriceBook(): LivePriceBook {
  return {
    BINANCE: {},
    TWELVEDATA: {},
    MT5: {}
  }
}

function mergeLivePriceBooks(
  base: LivePriceBook,
  extra: LivePriceBook
): LivePriceBook {
  return {
    BINANCE: {
      ...extra.BINANCE,
      ...base.BINANCE
    },
    TWELVEDATA: {
      ...extra.TWELVEDATA,
      ...base.TWELVEDATA
    },
    MT5: {
      ...extra.MT5,
      ...base.MT5
    }
  }
}

async function scanMarket(
  market: (typeof markets)[number],
  timeframe: ScanTimeframe,
  providerIssues: ProviderIssue[]
): Promise<ScanMarketResult> {
  const { context, latestPrice } = await buildMarketContext(
    market,
    timeframe,
    providerIssues
  )

  if (!context) {
    return {
      signals: [],
      latestPrice,
      hasContext: false
    }
  }

  const rawSignals = generateSignals(market.symbol, context, timeframe)

  console.log("SIGNAL DEBUG:", market.symbol, timeframe, {
    rawSignals: rawSignals.length,
    latestPrice
  })

  const signals = rawSignals.filter((signal) =>
    isTradableSignal(signal, timeframe)
  )

  console.log("FILTER DEBUG:", market.symbol, timeframe, {
    keptSignals: signals.length
  })

  return {
    signals,
    latestPrice,
    hasContext: true
  }
}

function shouldBlockByMarketBucket(
  acceptedSignals: ScannedSignal[],
  signal: ReturnType<typeof generateSignals>[number]
) {
  const cryptoCount = acceptedSignals.filter(
    (s) => s.symbol.endsWith("USDT") && s.symbol !== "XAUUSDT"
  ).length

  const forexCount = acceptedSignals.filter(
    (s) => s.symbol === "EURUSD" || s.symbol === "GBPUSD"
  ).length

  const goldCount = acceptedSignals.filter(
    (s) => s.symbol === "XAUUSD" || s.symbol === "XAUUSDT"
  ).length

  if (
    signal.symbol.endsWith("USDT") &&
    signal.symbol !== "XAUUSDT" &&
    cryptoCount >= 2
  ) {
    return "CRYPTO_LIMIT"
  }

  if (
    (signal.symbol === "EURUSD" || signal.symbol === "GBPUSD") &&
    forexCount >= 1
  ) {
    return "FOREX_LIMIT"
  }

  if (
    (signal.symbol === "XAUUSD" || signal.symbol === "XAUUSDT") &&
    goldCount >= 1
  ) {
    return "GOLD_LIMIT"
  }

  return null
}

export async function POST(request: Request) {
  try {
    pruneProviderCaches()
    pruneScanResponseCache()

    const body = await request.json().catch(() => ({}))
    const timeframe = getTimeframeFromBody(body)

    const cachedScan = scanResponseCache.get(timeframe)
    const now = Date.now()

    if (cachedScan && now - cachedScan.time < SCAN_TTL[timeframe]) {
      return NextResponse.json({
        ...cachedScan.response,
        cached: true
      })
    }

    const existingPending = pendingScans.get(timeframe)
    if (existingPending) {
      const response = await existingPending
      return NextResponse.json({
        ...response,
        cached: true
      })
    }

    const scanPromise = (async (): Promise<ScanResponse> => {
      const macroEvents = await getMacroNews()
      const providerIssues: ProviderIssue[] = []

      const scanResults: ScanMarketResult[] = []

      for (const market of markets) {
        try {
          const result = await scanMarket(market, timeframe, providerIssues)
          scanResults.push(result)
        } catch (error) {
          console.log("scanMarket rejected:", market.symbol, error)
          scanResults.push({
            signals: [],
            latestPrice: undefined,
            hasContext: false
          })
        }
      }

      const allSignals: ReturnType<typeof generateSignals>[number][] = []
      let scannedContexts = 0

      const scanLivePrices = createEmptyLivePriceBook()

      for (let i = 0; i < scanResults.length; i++) {
        const result = scanResults[i]
        const market = markets[i]

        if (result.hasContext) {
          scannedContexts += 1
        }

        if (result.latestPrice !== undefined && result.latestPrice > 0) {
          const source = getMarketPriceSource(market)
          scanLivePrices[source][market.symbol] = result.latestPrice
        }

        if (result.signals.length > 0) {
          allSignals.push(...result.signals)
        }
      }

      const acceptedSignals: ScannedSignal[] = []

      for (const signal of allSignals) {
        const marketBucketBlock = shouldBlockByMarketBucket(
          acceptedSignals,
          signal
        )

        if (marketBucketBlock) {
          console.log("LIMIT BLOCK:", signal.symbol, timeframe, marketBucketBlock)
          continue
        }

        const risk = evaluateRisk(acceptedSignals, signal as any)

        if (!risk.allowed) {
          console.log("RISK BLOCK:", signal.symbol, timeframe, risk.reason)
          continue
        }

        const macro = evaluateMacroRisk(
          {
            ...signal,
            positionSize: risk.positionSize
          },
          macroEvents
        )

        if (macro.blocked || macro.riskLevel === "HIGH") {
          console.log("MACRO BLOCK:", signal.symbol, timeframe, {
            blocked: macro.blocked,
            riskLevel: macro.riskLevel,
            reason: macro.reason
          })
          continue
        }

        acceptedSignals.push({
          id: createSignalId(
            signal.symbol,
            signal.timeframe,
            signal.direction,
            safeNumber(signal.entry)
          ),
          ...signal,
          positionSize: Math.min(risk.positionSize, macro.positionSize),
          macroRisk: macro.riskLevel,
          macroNote: macro.reason,
          macroEvents: macro.matchedEvents
        })
      }

      const uniqueSignals = dedupeSignals(acceptedSignals).sort(
        (a, b) => b.confidence - a.confidence
      )

      const fallbackLivePrices = await buildLivePriceBook(
        markets.filter((market) => market.type !== "crypto")
      )

      const livePrices = mergeLivePriceBooks(scanLivePrices, fallbackLivePrices)
      const updatedTrades = monitorOpenTrades(livePrices)
      const providers = buildProviderSummary(providerIssues)

      const response: ScanResponse = {
        success: true,
        timeframe,
        signals: uniqueSignals,
        total: uniqueSignals.length,
        scannedMarkets: markets.length,
        macroEventsCount: macroEvents.length,
        updatedTradesCount: updatedTrades.length,
        providerIssues,
        cached: false,
        debug: {
          scannedContexts,
          rawSignals: allSignals.length,
          acceptedSignals: acceptedSignals.length,
          finalSignals: uniqueSignals.length
        },
        providers
      }

      scanResponseCache.set(timeframe, {
        time: Date.now(),
        response
      })

      return response
    })()

    pendingScans.set(timeframe, scanPromise)

    try {
      const response = await scanPromise
      return NextResponse.json(response)
    } finally {
      pendingScans.delete(timeframe)
    }
  } catch (error) {
    console.error("Scanner error:", error)

    return NextResponse.json(
      {
        success: false,
        message: "Market scan failed"
      },
      { status: 500 }
    )
  }
}