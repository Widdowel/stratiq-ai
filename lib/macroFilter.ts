import type { MacroEvent, MacroImpact } from "./macroNews"

export type MacroRiskLevel = "LOW" | "MEDIUM" | "HIGH"

export type MacroDecision = {
  blocked: boolean
  riskLevel: MacroRiskLevel
  positionSize: number
  reason: string
  matchedEvents: MacroEvent[]
}

type SignalLike = {
  symbol: string
  direction: "BUY" | "SELL"
  confidence: number
  positionSize?: number
}

function getHoursFromEvent(date: string) {
  const eventTime = new Date(date).getTime()
  const now = Date.now()

  if (!eventTime || Number.isNaN(eventTime)) {
    return Number.POSITIVE_INFINITY
  }

  return (eventTime - now) / (1000 * 60 * 60)
}

function isUsdSensitive(symbol: string) {
  return [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "EURUSD",
    "GBPUSD",
    "XAUUSD",
    "XAUUSDT"
  ].includes(symbol)
}

function isEurSensitive(symbol: string) {
  return symbol === "EURUSD"
}

function isGbpSensitive(symbol: string) {
  return symbol === "GBPUSD"
}

function isGoldSensitive(symbol: string) {
  return symbol === "XAUUSD" || symbol === "XAUUSDT"
}

function normalizeText(event: MacroEvent) {
  return `${event.event} ${event.category ?? ""} ${event.country} ${event.currency ?? ""}`.toLowerCase()
}

function isUsdEvent(event: MacroEvent) {
  const country = event.country.toLowerCase()
  const currency = (event.currency ?? "").toUpperCase()
  const text = normalizeText(event)

  return (
    currency === "USD" ||
    country.includes("united states") ||
    text.includes("fed") ||
    text.includes("fomc") ||
    text.includes("powell") ||
    text.includes("cpi") ||
    text.includes("inflation") ||
    text.includes("pce") ||
    text.includes("ppi") ||
    text.includes("non farm payrolls") ||
    text.includes("non-farm payrolls") ||
    text.includes("nfp") ||
    text.includes("jobless claims") ||
    text.includes("retail sales") ||
    text.includes("gdp") ||
    text.includes("unemployment") ||
    text.includes("interest rate") ||
    text.includes("rate decision")
  )
}

function isEurEvent(event: MacroEvent) {
  const country = event.country.toLowerCase()
  const currency = (event.currency ?? "").toUpperCase()
  const text = normalizeText(event)

  return (
    currency === "EUR" ||
    country.includes("euro area") ||
    country.includes("eurozone") ||
    text.includes("ecb") ||
    text.includes("lagarde")
  )
}

function isGbpEvent(event: MacroEvent) {
  const country = event.country.toLowerCase()
  const currency = (event.currency ?? "").toUpperCase()
  const text = normalizeText(event)

  return (
    currency === "GBP" ||
    country.includes("united kingdom") ||
    country.includes("britain") ||
    text.includes("boe") ||
    text.includes("bank of england") ||
    text.includes("bailey")
  )
}

function eventAffectsSymbol(symbol: string, event: MacroEvent) {
  if (isUsdEvent(event) && isUsdSensitive(symbol)) return true
  if (isEurEvent(event) && isEurSensitive(symbol)) return true
  if (isGbpEvent(event) && isGbpSensitive(symbol)) return true

  if (isGoldSensitive(symbol) && isUsdEvent(event)) {
    return true
  }

  return false
}

function getBaseRiskLevel(
  event: MacroEvent,
  hoursFromEvent: number
): MacroRiskLevel {
  const absHours = Math.abs(hoursFromEvent)

  if (event.importance === "HIGH") {
    if (absHours <= 2) return "HIGH"
    if (absHours <= 8) return "MEDIUM"
    return "LOW"
  }

  if (event.importance === "MEDIUM") {
    if (absHours <= 1.5) return "MEDIUM"
    if (absHours <= 6) return "LOW"
    return "LOW"
  }

  return "LOW"
}

function getWorstRiskLevel(
  current: MacroRiskLevel,
  next: MacroRiskLevel
): MacroRiskLevel {
  const rank = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3
  }

  return rank[next] > rank[current] ? next : current
}

function getAdjustedPositionSize(
  signal: SignalLike,
  riskLevel: MacroRiskLevel
) {
  const baseSize = signal.positionSize ?? 1

  if (riskLevel === "HIGH") return 0
  if (riskLevel === "MEDIUM") return Number((baseSize * 0.6).toFixed(2))
  return Number(baseSize.toFixed(2))
}

function getRiskReason(riskLevel: MacroRiskLevel, matchedEvents: MacroEvent[]) {
  const nearestEvent = matchedEvents
    .map((event) => ({
      event,
      hours: Math.abs(getHoursFromEvent(event.date))
    }))
    .sort((a, b) => a.hours - b.hours)[0]?.event

  const eventName = nearestEvent?.event ?? "macro event"

  if (riskLevel === "HIGH") {
    return `High-impact macro risk detected near trade window: ${eventName}`
  }

  if (riskLevel === "MEDIUM") {
    return `Macro risk elevated, reduce exposure: ${eventName}`
  }

  return "Macro conditions acceptable"
}

export function evaluateMacroRisk(
  signal: SignalLike,
  events: MacroEvent[]
): MacroDecision {
  const matchedEvents = events.filter((event) => {
    const hoursFromEvent = getHoursFromEvent(event.date)

    return (
      hoursFromEvent >= -2 &&
      hoursFromEvent <= 24 &&
      eventAffectsSymbol(signal.symbol, event)
    )
  })

  if (!matchedEvents.length) {
    return {
      blocked: false,
      riskLevel: "LOW",
      positionSize: Number((signal.positionSize ?? 1).toFixed(2)),
      reason: "No relevant macro event detected",
      matchedEvents: []
    }
  }

  let riskLevel: MacroRiskLevel = "LOW"

  for (const event of matchedEvents) {
    const hoursFromEvent = getHoursFromEvent(event.date)
    const eventRisk = getBaseRiskLevel(event, hoursFromEvent)
    riskLevel = getWorstRiskLevel(riskLevel, eventRisk)
  }

  const adjustedPositionSize = getAdjustedPositionSize(signal, riskLevel)

  if (riskLevel === "HIGH") {
    return {
      blocked: true,
      riskLevel,
      positionSize: 0,
      reason: getRiskReason(riskLevel, matchedEvents),
      matchedEvents
    }
  }

  if (riskLevel === "MEDIUM") {
    return {
      blocked: false,
      riskLevel,
      positionSize: adjustedPositionSize,
      reason: getRiskReason(riskLevel, matchedEvents),
      matchedEvents
    }
  }

  return {
    blocked: false,
    riskLevel: "LOW",
    positionSize: adjustedPositionSize,
    reason: getRiskReason("LOW", matchedEvents),
    matchedEvents
  }
}

export function summarizeMacroRisk(
  events: MacroEvent[]
): {
  riskLevel: MacroImpact | "NONE"
  total: number
} {
  if (!events.length) {
    return {
      riskLevel: "NONE",
      total: 0
    }
  }

  const hasHigh = events.some((event) => event.importance === "HIGH")
  const hasMedium = events.some((event) => event.importance === "MEDIUM")

  if (hasHigh) {
    return {
      riskLevel: "HIGH",
      total: events.length
    }
  }

  if (hasMedium) {
    return {
      riskLevel: "MEDIUM",
      total: events.length
    }
  }

  return {
    riskLevel: "LOW",
    total: events.length
  }
}