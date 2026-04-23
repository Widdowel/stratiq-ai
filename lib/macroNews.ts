export type MacroImpact = "LOW" | "MEDIUM" | "HIGH"

export type MacroEvent = {
  id: string
  date: string
  country: string
  currency?: string
  event: string
  category?: string
  actual?: string
  previous?: string
  forecast?: string
  importance: MacroImpact
  source: "finnhub"
}

type FinnhubMacroRow = {
  country?: string
  time?: string
  event?: string
  impact?: string | number
  unit?: string
  actual?: string | number | null
  prev?: string | number | null
  forecast?: string | number | null
}

type FinnhubCalendarResponse = {
  economicCalendar?: unknown
}

function safeArray(value: unknown): FinnhubMacroRow[] {
  return Array.isArray(value) ? (value as FinnhubMacroRow[]) : []
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

function normalizeText(value: string): string {
  return value.toLowerCase().trim()
}

function mapImportance(value?: string | number): MacroImpact {
  const normalized = normalizeText(String(value ?? ""))

  if (
    normalized.includes("high") ||
    normalized === "3" ||
    normalized === "high impact expected"
  ) {
    return "HIGH"
  }

  if (
    normalized.includes("medium") ||
    normalized === "2" ||
    normalized === "medium impact expected"
  ) {
    return "MEDIUM"
  }

  return "LOW"
}

function isTrackedCountry(country: string): boolean {
  const normalized = normalizeText(country)

  return (
    normalized.includes("united states") ||
    normalized.includes("usa") ||
    normalized.includes("euro area") ||
    normalized.includes("eurozone") ||
    normalized.includes("united kingdom") ||
    normalized.includes("uk") ||
    normalized.includes("japan") ||
    normalized.includes("china")
  )
}

function getCurrencyFromCountry(country: string): string | undefined {
  const normalized = normalizeText(country)

  if (normalized.includes("united states") || normalized.includes("usa")) {
    return "USD"
  }

  if (normalized.includes("euro area") || normalized.includes("eurozone")) {
    return "EUR"
  }

  if (normalized.includes("united kingdom") || normalized.includes("uk")) {
    return "GBP"
  }

  if (normalized.includes("japan")) {
    return "JPY"
  }

  if (normalized.includes("china")) {
    return "CNY"
  }

  return undefined
}

function isImportantMacroEvent(eventName: string, category?: string): boolean {
  const text = normalizeText(`${eventName} ${category ?? ""}`)

  return [
    "interest rate",
    "rate decision",
    "fed",
    "fomc",
    "ecb",
    "boe",
    "boj",
    "non farm payrolls",
    "non-farm payrolls",
    "nfp",
    "cpi",
    "inflation",
    "pce",
    "ppi",
    "gdp",
    "pmi",
    "retail sales",
    "unemployment",
    "employment",
    "jobless claims",
    "central bank",
    "powell",
    "lagarde",
    "bailey",
    "minutes",
    "speech"
  ].some((keyword) => text.includes(keyword))
}

function toOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const str = String(value).trim()
  return str ? str : undefined
}

function isValidEventDate(date: string): boolean {
  if (!date) return false
  const timestamp = new Date(date).getTime()
  return Number.isFinite(timestamp)
}

async function safeFetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      cache: "no-store"
    })

    if (!response.ok) {
      return null
    }

    const text = await response.text()

    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  } catch {
    return null
  }
}

function getDateRange() {
  const now = new Date()
  const from = new Date(now)
  const to = new Date(now)

  to.setDate(to.getDate() + 7)

  const format = (date: Date) => date.toISOString().slice(0, 10)

  return {
    from: format(from),
    to: format(to)
  }
}

function dedupeEvents(events: MacroEvent[]) {
  const seen = new Set<string>()

  return events.filter((event) => {
    const key = `${event.date}|${event.country}|${event.event}|${event.currency ?? ""}`

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function getMacroNews(): Promise<MacroEvent[]> {
  const apiKey = process.env.FINNHUB_KEY

  if (!apiKey) {
    console.log("FINNHUB_KEY missing")
    return []
  }

  const { from, to } = getDateRange()

  const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`

  const data = await safeFetchJson(url)

  const calendar =
    data &&
    typeof data === "object" &&
    "economicCalendar" in data
      ? (data as FinnhubCalendarResponse).economicCalendar
      : []

  const rows = safeArray(calendar)

  const filteredRows = rows
    .filter((item) => isTrackedCountry(safeString(item.country)))
    .filter((item) =>
      isImportantMacroEvent(
        safeString(item.event),
        safeString(item.unit)
      )
    )
    .filter((item) => isValidEventDate(safeString(item.time)))

  const events: MacroEvent[] = filteredRows.map((item) => {
    const country = safeString(item.country)
    const event = safeString(item.event)
    const date = safeString(item.time)

    return {
      id: `${date}-${country}-${event}`,
      date,
      country,
      currency: getCurrencyFromCountry(country),
      event,
      category: toOptionalString(item.unit),
      actual: toOptionalString(item.actual),
      previous: toOptionalString(item.prev),
      forecast: toOptionalString(item.forecast),
      importance: mapImportance(item.impact),
      source: "finnhub"
    }
  })

  return dedupeEvents(events).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
}

export async function getHighImpactMacroNews(): Promise<MacroEvent[]> {
  const events = await getMacroNews()
  return events.filter((event) => event.importance === "HIGH")
}