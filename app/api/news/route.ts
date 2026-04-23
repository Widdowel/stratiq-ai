import { NextResponse } from "next/server"
import { getMacroNews } from "@/lib/macroNews"

type MacroImpact = "LOW" | "MEDIUM" | "HIGH"

type MacroEvent = {
  id?: string
  title?: string
  event?: string
  description?: string
  country?: string
  currency?: string
  time?: string
  impact?: string
  actual?: string | number | null
  forecast?: string | number | null
  previous?: string | number | null
}

function normalizeImpact(value?: string): MacroImpact {
  const impact = String(value || "").toUpperCase()

  if (impact.includes("HIGH")) return "HIGH"
  if (impact.includes("MEDIUM")) return "MEDIUM"
  return "LOW"
}

function extractTitle(event: MacroEvent) {
  return event.title || event.event || "Macro Event"
}

function buildDescription(event: MacroEvent) {
  if (event.description && event.description.trim()) {
    return event.description
  }

  const title = extractTitle(event)
  const currency = event.currency || "market"
  const country = event.country || "global"

  return `${title} may create volatility on ${currency}-related markets and can influence trading conditions across ${country}.`
}

function scoreImpact(impact: MacroImpact) {
  if (impact === "HIGH") return 3
  if (impact === "MEDIUM") return 2
  return 1
}

function sortEvents(events: MacroEvent[]) {
  return [...events].sort((a, b) => {
    const impactDiff =
      scoreImpact(normalizeImpact(b.impact)) - scoreImpact(normalizeImpact(a.impact))

    if (impactDiff !== 0) return impactDiff

    return String(a.time || "").localeCompare(String(b.time || ""))
  })
}

function computeRiskLevel(events: MacroEvent[]): MacroImpact {
  const highCount = events.filter(
    (event) => normalizeImpact(event.impact) === "HIGH"
  ).length

  const mediumCount = events.filter(
    (event) => normalizeImpact(event.impact) === "MEDIUM"
  ).length

  if (highCount >= 2) return "HIGH"
  if (highCount >= 1) return "HIGH"
  if (mediumCount >= 2) return "MEDIUM"
  if (mediumCount >= 1) return "MEDIUM"
  return "LOW"
}

function buildHeadline(riskLevel: MacroImpact, events: MacroEvent[]) {
  if (!events.length) {
    return "No major macro events detected for today"
  }

  const mainEvent = extractTitle(events[0])

  if (riskLevel === "HIGH") {
    return `High-volatility session expected: ${mainEvent}`
  }

  if (riskLevel === "MEDIUM") {
    return `Moderate macro risk today: ${mainEvent}`
  }

  return `Relatively calm session, monitor: ${mainEvent}`
}

function buildSummaryDescription(riskLevel: MacroImpact, events: MacroEvent[]) {
  if (!events.length) {
    return "The calendar looks relatively light today. Traders should still stay disciplined and follow proper risk management."
  }

  const impactedCurrencies = Array.from(
    new Set(events.map((event) => event.currency).filter(Boolean))
  )

  const currenciesText = impactedCurrencies.length
    ? impactedCurrencies.join(", ")
    : "major markets"

  if (riskLevel === "HIGH") {
    return `Today carries elevated macro risk. High-impact releases may create sharp moves across ${currenciesText}. Reduce exposure, avoid impulsive entries, and wait for confirmation around key news windows.`
  }

  if (riskLevel === "MEDIUM") {
    return `Today has moderate macro risk. Some scheduled events may affect ${currenciesText}. Keep position sizing controlled and avoid forcing trades during uncertain volatility.`
  }

  return `Today appears relatively stable, but traders should still respect stop-loss discipline and avoid overexposure across ${currenciesText}.`
}

function buildRecommendations(riskLevel: MacroImpact, events: MacroEvent[]) {
  const hasHighImpact = events.some(
    (event) => normalizeImpact(event.impact) === "HIGH"
  )

  if (riskLevel === "HIGH") {
    return [
      "Reduce position size and avoid overleveraging today.",
      "Avoid entering trades just before high-impact macro releases.",
      "Wait for post-news confirmation before taking breakout entries.",
      "Protect capital first: use clear stop-loss levels and avoid revenge trading.",
      "If volatility spikes abnormally, it may be better to stay flat than to force setups."
    ]
  }

  if (riskLevel === "MEDIUM") {
    return [
      "Trade with controlled risk and slightly smaller size if volatility expands.",
      "Be selective and prefer high-quality setups only.",
      "Avoid opening multiple correlated positions at the same time.",
      "Watch scheduled event times closely and manage open trades before the release.",
      hasHighImpact
        ? "Because at least one high-impact event is on the calendar, stay alert around the announcement window."
        : "Market conditions can still shift quickly, so keep execution disciplined."
    ]
  }

  return [
    "Normal risk conditions, but keep strict money management.",
    "Do not increase size unnecessarily just because volatility looks calm.",
    "Focus on clean setups with favorable risk-to-reward.",
    "Respect daily loss limits and avoid overtrading.",
    "Stay aware of any surprise headlines even on lower-risk days."
  ]
}

function normalizeEvents(rawEvents: unknown): MacroEvent[] {
  if (!Array.isArray(rawEvents)) return []

  return rawEvents.map((item: any, index) => ({
    id: item?.id ? String(item.id) : `macro-${index}`,
    title: item?.title || item?.event || "Macro Event",
    event: item?.event || item?.title || "Macro Event",
    description: buildDescription(item || {}),
    country: item?.country || item?.country_code || "-",
    currency: item?.currency || item?.symbol || "-",
    time: item?.time || item?.date || "-",
    impact: normalizeImpact(item?.impact),
    actual: item?.actual ?? null,
    forecast: item?.forecast ?? null,
    previous: item?.previous ?? null
  }))
}

export async function GET() {
  try {
    const rawEvents = await getMacroNews()
    const normalizedEvents = normalizeEvents(rawEvents)
    const sortedEvents = sortEvents(normalizedEvents)
    const riskLevel = computeRiskLevel(sortedEvents)

    return NextResponse.json({
      success: true,
      date: new Date().toISOString(),
      summary: {
        riskLevel,
        headline: buildHeadline(riskLevel, sortedEvents),
        description: buildSummaryDescription(riskLevel, sortedEvents)
      },
      recommendations: buildRecommendations(riskLevel, sortedEvents),
      events: sortedEvents
    })
  } catch (error) {
    console.error("News API error:", error)

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load macro news",
        summary: {
          riskLevel: "LOW",
          headline: "Macro news unavailable",
          description:
            "The news service is temporarily unavailable. Trade cautiously and keep risk controlled."
        },
        recommendations: [
          "Reduce risk until macro data becomes available again.",
          "Avoid oversized positions during uncertain data conditions.",
          "Focus on capital preservation first."
        ],
        events: []
      },
      { status: 500 }
    )
  }
}