"use client"

import { ExecutionVenue, MarginMode, PriceSource } from "@/lib/tradeTracker"
import { useLanguage } from "@/components/language-provider"
import Link from "next/link"
import { useMemo, useState } from "react"

type Timeframe = "SHORT" | "MEDIUM" | "LONG"

type MacroEvent = {
  id: string
  date: string
  country: string
  currency?: string
  event: string
  category?: string
  actual?: string
  previous?: string
  forecast?: string
  importance: "LOW" | "MEDIUM" | "HIGH"
  source: "finnhub"
}

type Signal = {
  id?: string
  symbol: string
  timeframe: Timeframe
  direction: "BUY" | "SELL"
  entry: number
  tp: number
  sl: number
  confidence: number
  positionSize?: number
  macroRisk?: "LOW" | "MEDIUM" | "HIGH"
  macroNote?: string
  macroEvents?: MacroEvent[]
}

type TradesResponse = {
  success: boolean
  all: Array<{
    symbol: string
    direction: "BUY" | "SELL"
    timeframe: Timeframe
    entry: number
    status: string
  }>
  open: Array<{
    symbol: string
    direction: "BUY" | "SELL"
    timeframe: Timeframe
    entry: number
    status: string
  }>
}

function getCardBorderColor(direction: Signal["direction"]) {
  return direction === "BUY" ? "#22c55e" : "#ef4444"
}

function getDirectionColor(direction: Signal["direction"]) {
  return direction === "BUY" ? "#22c55e" : "#ef4444"
}

function getMacroRiskColor(risk?: Signal["macroRisk"]) {
  if (risk === "HIGH") return "#ef4444"
  if (risk === "MEDIUM") return "#f59e0b"
  return "#22c55e"
}

function getMarketGroup(symbol: string) {
  if (symbol.endsWith("USDT")) return "CRYPTO"
  if (symbol === "XAUUSD") return "GOLD"
  return "FOREX"
}

function formatNumber(value: number | undefined, decimals = 4) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-"
  return Number(value).toFixed(decimals)
}

function getDefaultVenueAndSource(
  symbol: string
): {
  executionVenue: ExecutionVenue
  priceSource: PriceSource
} {
  if (symbol.endsWith("USDT")) {
    return {
      executionVenue: "BINANCE_FUTURES",
      priceSource: "BINANCE"
    }
  }

  return {
    executionVenue: "EXNESS_MT5",
    priceSource: "TWELVEDATA"
  }
}

export default function Home() {
  const { lang, t } = useLanguage()

  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTf, setActiveTf] = useState<Timeframe>("SHORT")
  const [error, setError] = useState("")
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [tradesData, setTradesData] = useState<TradesResponse | null>(null)

  async function loadTrades() {
    try {
      const res = await fetch("/api/trades", {
        cache: "no-store"
      })

      const text = await res.text()
      let data: any = null

      try {
        data = JSON.parse(text)
      } catch {
        return
      }

      if (res.ok && data?.success) {
        setTradesData(data)
      }
    } catch (err) {
      console.error("Trades load error:", err)
    }
  }

  async function scanMarket(timeframe: Timeframe) {
    try {
      setLoading(true)
      setError("")
      setActiveTf(timeframe)

      const res = await fetch("/api/market-scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ timeframe })
      })

      const text = await res.text()
      let data: any = null

      try {
        data = JSON.parse(text)
      } catch {
        console.error("Market scan returned non-JSON:", text)
        setSignals([])
        setError(
          lang === "fr" ? "Réponse scanner invalide" : "Invalid scanner response"
        )
        return
      }

      if (!res.ok || !data?.success) {
        setSignals([])
        setError(
          data?.message || (lang === "fr" ? "Scan impossible" : "Scan failed")
        )
        return
      }

      setSignals(
        (data.signals || []).sort(
          (a: Signal, b: Signal) => b.confidence - a.confidence
        )
      )

      await loadTrades()
    } catch (err) {
      console.error(err)
      setSignals([])
      setError(
        lang === "fr"
          ? "Impossible de scanner les marchés"
          : "Unable to scan markets"
      )
    } finally {
      setLoading(false)
    }
  }

  function isSignalAlreadyExecuted(signal: Signal) {
    if (!tradesData?.open?.length) return false

    return tradesData.open.some(
      (trade) =>
        trade.symbol === signal.symbol &&
        trade.direction === signal.direction &&
        trade.timeframe === signal.timeframe &&
        Math.abs(trade.entry - signal.entry) < 0.0001
    )
  }

  async function executeSignal(signal: Signal) {
    try {
      const defaults = getDefaultVenueAndSource(signal.symbol)

      const executionVenueText = window.prompt(
        lang === "fr"
          ? `Venue pour ${signal.symbol} ?\nTape BINANCE_FUTURES ou EXNESS_MT5`
          : `Venue for ${signal.symbol}?\nType BINANCE_FUTURES or EXNESS_MT5`,
        defaults.executionVenue
      )

      if (executionVenueText === null) return

      const executionVenue = executionVenueText.trim() as ExecutionVenue

      let priceSource: PriceSource
      let actualLot: number | undefined
      let marginUsedUsdt: number | undefined
      let leverage: number | undefined
      let marginMode: MarginMode | undefined
      let accountCurrency: "USDT" | "USD" | undefined

      if (executionVenue === "BINANCE_FUTURES") {
        priceSource = "BINANCE"

        const actualEntryText = window.prompt(
          lang === "fr"
            ? `Prix réel d'entrée pour ${signal.symbol} (USDT) ?`
            : `Actual entry price for ${signal.symbol} (USDT)?`,
          String(signal.entry)
        )
        if (actualEntryText === null) return

        const marginText = window.prompt(
          lang === "fr"
            ? `Capital engagé pour ${signal.symbol} (USDT) ?\n= montant réel utilisé sans levier`
            : `Capital used for ${signal.symbol} (USDT)?\n= real margin used without leverage`,
          "100"
        )
        if (marginText === null) return

        const leverageText = window.prompt(
          lang === "fr"
            ? `Levier pour ${signal.symbol} ?`
            : `Leverage for ${signal.symbol}?`,
          "10"
        )
        if (leverageText === null) return

        const marginModeText = window.prompt(
          lang === "fr"
            ? `Mode marge pour ${signal.symbol} ?\nTape ISOLATED ou CROSSED`
            : `Margin mode for ${signal.symbol}?\nType ISOLATED or CROSSED`,
          "ISOLATED"
        )
        if (marginModeText === null) return

        const notes =
          window.prompt(
            lang === "fr" ? "Notes optionnelles ?" : "Optional notes?",
            ""
          ) ?? ""

        marginUsedUsdt = Number(marginText)
        leverage = Number(leverageText)
        marginMode = marginModeText.trim() as MarginMode
        accountCurrency = "USDT"

        setActionLoadingId(
          `${signal.symbol}-${signal.timeframe}-${signal.direction}-${signal.entry}`
        )

        const res = await fetch("/api/trades/open", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id: signal.id ?? crypto.randomUUID(),
            symbol: signal.symbol,
            direction: signal.direction,
            timeframe: signal.timeframe,
            entry: signal.entry,
            tp: signal.tp,
            sl: signal.sl,
            confidence: signal.confidence,
            positionSize: signal.positionSize ?? 1,
            executionVenue,
            priceSource,
            actualEntry: Number(actualEntryText),
            marginUsedUsdt,
            leverage,
            marginMode,
            accountCurrency,
            notes
          })
        })

        const text = await res.text()
        let data: any = null

        try {
          data = JSON.parse(text)
        } catch {
          console.error("Open trade API returned non-JSON:", text)
          alert(
            lang === "fr"
              ? "API /api/trades/open a retourné une réponse invalide"
              : "API /api/trades/open returned invalid response"
          )
          return
        }

        if (!res.ok || !data?.success) {
          alert(
            data?.message ||
              data?.errors?.join(", ") ||
              (lang === "fr"
                ? "Impossible d'exécuter le signal"
                : "Unable to execute signal")
          )
          return
        }

        await loadTrades()
        alert(
          lang === "fr"
            ? `Trade ${signal.symbol} exécuté.`
            : `${signal.symbol} trade executed.`
        )
        return
      }

      if (executionVenue === "EXNESS_MT5") {
        const priceSourceText = window.prompt(
          lang === "fr"
            ? `Price source pour ${signal.symbol} ?\nTape TWELVEDATA ou MT5`
            : `Price source for ${signal.symbol}?\nType TWELVEDATA or MT5`,
          defaults.priceSource
        )
        if (priceSourceText === null) return

        priceSource = priceSourceText.trim() as PriceSource

        const actualEntryText = window.prompt(
          lang === "fr"
            ? `Prix réel d'entrée pour ${signal.symbol} ?`
            : `Actual entry price for ${signal.symbol}?`,
          String(signal.entry)
        )
        if (actualEntryText === null) return

        const actualLotText = window.prompt(
          lang === "fr"
            ? `Lot réel pour ${signal.symbol} ?`
            : `Actual lot size for ${signal.symbol}?`,
          "0.01"
        )
        if (actualLotText === null) return

        const notes =
          window.prompt(
            lang === "fr" ? "Notes optionnelles ?" : "Optional notes?",
            ""
          ) ?? ""

        actualLot = Number(actualLotText)
        accountCurrency = "USD"

        setActionLoadingId(
          `${signal.symbol}-${signal.timeframe}-${signal.direction}-${signal.entry}`
        )

        const res = await fetch("/api/trades/open", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id: signal.id ?? crypto.randomUUID(),
            symbol: signal.symbol,
            direction: signal.direction,
            timeframe: signal.timeframe,
            entry: signal.entry,
            tp: signal.tp,
            sl: signal.sl,
            confidence: signal.confidence,
            positionSize: signal.positionSize ?? 1,
            executionVenue,
            priceSource,
            actualLot,
            actualEntry: Number(actualEntryText),
            accountCurrency,
            notes
          })
        })

        const text = await res.text()
        let data: any = null

        try {
          data = JSON.parse(text)
        } catch {
          console.error("Open trade API returned non-JSON:", text)
          alert(
            lang === "fr"
              ? "API /api/trades/open a retourné une réponse invalide"
              : "API /api/trades/open returned invalid response"
          )
          return
        }

        if (!res.ok || !data?.success) {
          alert(
            data?.message ||
              data?.errors?.join(", ") ||
              (lang === "fr"
                ? "Impossible d'exécuter le signal"
                : "Unable to execute signal")
          )
          return
        }

        await loadTrades()
        alert(
          lang === "fr"
            ? `Trade ${signal.symbol} exécuté.`
            : `${signal.symbol} trade executed.`
        )
        return
      }

      alert(lang === "fr" ? "Venue invalide" : "Invalid execution venue")
    } catch (err) {
      console.error("Execute signal error:", err)
      alert(
        lang === "fr"
          ? "Impossible d'exécuter le signal"
          : "Unable to execute signal"
      )
    } finally {
      setActionLoadingId(null)
    }
  }

  const groupedSignals = useMemo(() => {
    return {
      CRYPTO: signals.filter((s) => getMarketGroup(s.symbol) === "CRYPTO"),
      FOREX: signals.filter((s) => getMarketGroup(s.symbol) === "FOREX"),
      GOLD: signals.filter((s) => getMarketGroup(s.symbol) === "GOLD")
    }
  }, [signals])

  function renderSignalCard(s: Signal, i: number) {
    const alreadyExecuted = isSignalAlreadyExecuted(s)
    const signalKey = `${s.symbol}-${s.timeframe}-${s.direction}-${s.entry}`
    const isExecuting = actionLoadingId === signalKey

    return (
      <div
        key={`${s.symbol}-${s.timeframe}-${i}`}
        className="card-glass fade-up"
        style={{
          padding: "18px",
          marginBottom: "14px",
          color: "white",
          borderLeft: `4px solid ${getCardBorderColor(s.direction)}`
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "14px"
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap"
              }}
            >
              <b style={{ color: getDirectionColor(s.direction), fontSize: "20px" }}>
                {s.symbol}
              </b>
              <span className="badge">{s.direction}</span>
              <span className="badge">{s.timeframe}</span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              alignItems: "center"
            }}
          >
            <span className="badge">
              {lang === "fr" ? "Confiance" : "Confidence"}: {s.confidence}%
            </span>
            <span className="badge">
              {lang === "fr" ? "Position" : "Position"}: {s.positionSize ?? 1}
            </span>

            <span
              className="badge"
              style={{
                color: getMacroRiskColor(s.macroRisk),
                borderColor: getMacroRiskColor(s.macroRisk)
              }}
            >
              {lang === "fr" ? "Risque Macro" : "Macro Risk"}:{" "}
              {s.macroRisk ?? "LOW"}
            </span>

            {alreadyExecuted && (
              <span
                className="badge"
                style={{
                  color: "#22c55e",
                  borderColor: "#22c55e"
                }}
              >
                {t("common.executed").toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px"
          }}
        >
          <div className="panel" style={{ padding: "12px" }}>
            <div className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>
              {lang === "fr" ? "ENTRÉE" : "ENTRY"}
            </div>
            <div style={{ fontWeight: 700, fontSize: "16px" }}>
              {formatNumber(s.entry)}
            </div>
          </div>

          <div className="panel" style={{ padding: "12px" }}>
            <div className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>
              {lang === "fr" ? "TAKE PROFIT" : "TAKE PROFIT"}
            </div>
            <div style={{ fontWeight: 700, fontSize: "16px", color: "#22c55e" }}>
              {formatNumber(s.tp)}
            </div>
          </div>

          <div className="panel" style={{ padding: "12px" }}>
            <div className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>
              {lang === "fr" ? "STOP LOSS" : "STOP LOSS"}
            </div>
            <div style={{ fontWeight: 700, fontSize: "16px", color: "#ef4444" }}>
              {formatNumber(s.sl)}
            </div>
          </div>
        </div>

        {s.macroNote && (
          <div
            className="panel"
            style={{
              marginTop: "14px",
              padding: "12px",
              color: "#cbd5e1",
              fontSize: "14px"
            }}
          >
            <b style={{ color: "#93c5fd" }}>
              {lang === "fr" ? "Note Macro" : "Macro Note"}:
            </b>{" "}
            {s.macroNote}
          </div>
        )}

        {Boolean(s.macroEvents?.length) && (
          <div style={{ marginTop: "14px" }}>
            <div
              style={{
                fontWeight: 700,
                marginBottom: "10px",
                color: "#93c5fd"
              }}
            >
              {lang === "fr" ? "Événements Macro Liés" : "Related Macro Events"}
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              {s.macroEvents?.map((event) => (
                <div
                  key={event.id}
                  className="panel"
                  style={{
                    padding: "12px"
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{event.event}</div>
                  <div
                    className="text-muted"
                    style={{
                      fontSize: "13px",
                      marginTop: "6px"
                    }}
                  >
                    {event.country} {event.currency ? `(${event.currency})` : ""} —{" "}
                    {event.date}
                  </div>
                  <div
                    className="text-muted"
                    style={{
                      fontSize: "13px",
                      marginTop: "6px"
                    }}
                  >
                    {lang === "fr" ? "Importance" : "Importance"}:{" "}
                    {event.importance}
                  </div>
                  {(event.forecast || event.previous || event.actual) && (
                    <div
                      className="text-muted"
                      style={{
                        fontSize: "13px",
                        marginTop: "6px"
                      }}
                    >
                      {lang === "fr" ? "Prévision" : "Forecast"}:{" "}
                      {event.forecast ?? "-"} |{" "}
                      {lang === "fr" ? "Précédent" : "Previous"}:{" "}
                      {event.previous ?? "-"} |{" "}
                      {lang === "fr" ? "Actuel" : "Actual"}:{" "}
                      {event.actual ?? "-"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginTop: "16px"
          }}
        >
          <button
            onClick={() => executeSignal(s)}
            disabled={alreadyExecuted || isExecuting}
            className={alreadyExecuted ? "" : !isExecuting ? "pulse-soft" : ""}
            style={{
              padding: "11px 18px",
              background: alreadyExecuted
                ? "#475569"
                : "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px",
              cursor: alreadyExecuted ? "not-allowed" : "pointer",
              opacity: isExecuting ? 0.7 : 1,
              boxShadow: "var(--shadow-soft)"
            }}
          >
            {alreadyExecuted
              ? t("common.executed").toUpperCase()
              : isExecuting
              ? lang === "fr"
                ? "EXÉCUTION..."
                : "EXECUTING..."
              : t("common.execute").toUpperCase()}
          </button>
        </div>
      </div>
    )
  }

  function renderSection(title: string, items: Signal[]) {
    if (!items.length) return null

    return (
      <section style={{ marginBottom: "32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "14px"
          }}
        >
          <h2
            style={{
              fontSize: "20px",
              color: "#93c5fd"
            }}
          >
            {title}
          </h2>
          <span className="badge">{items.length} signals</span>
        </div>

        {items.map(renderSignalCard)}
      </section>
    )
  }

  return (
    <div className="container-app" style={{ padding: "24px" }}>
      <div
        className="card-glass fade-up"
        style={{
          padding: "24px",
          marginBottom: "20px"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: "18px"
          }}
        >
          <div>
            <div
              style={{
                color: "#22c55e",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.12em",
                marginBottom: "8px"
              }}
            >
              {lang === "fr" ? "DASHBOARD TRADING IA" : "AI TRADING DASHBOARD"}
            </div>
            <h1 style={{ fontSize: "32px", margin: 0 }}>
              {t("home.title")}
            </h1>
            <p style={{ marginTop: "8px", maxWidth: "720px" }}>
              {t("home.subtitle")}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              href="/news"
              style={{
                padding: "11px 18px",
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                color: "white",
                borderRadius: "12px",
                fontWeight: 700,
                boxShadow: "var(--shadow-soft)"
              }}
            >
              {t("home.newsAlerts")}
            </Link>

            <Link
              href="/trades"
              style={{
                padding: "11px 18px",
                background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                color: "white",
                borderRadius: "12px",
                fontWeight: 700,
                boxShadow: "var(--shadow-soft)"
              }}
            >
              {t("home.openTradesTracker")}
            </Link>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap"
          }}
        >
          <button
            onClick={() => scanMarket("SHORT")}
            style={{
              padding: "11px 18px",
              background:
                activeTf === "SHORT"
                  ? "linear-gradient(135deg, #22c55e, #16a34a)"
                  : "rgba(51, 65, 85, 0.9)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px"
            }}
          >
            {t("home.shortScan")}
          </button>

          <button
            onClick={() => scanMarket("MEDIUM")}
            style={{
              padding: "11px 18px",
              background:
                activeTf === "MEDIUM"
                  ? "linear-gradient(135deg, #22c55e, #16a34a)"
                  : "rgba(51, 65, 85, 0.9)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px"
            }}
          >
            {t("home.mediumScan")}
          </button>

          <button
            onClick={() => scanMarket("LONG")}
            style={{
              padding: "11px 18px",
              background:
                activeTf === "LONG"
                  ? "linear-gradient(135deg, #22c55e, #16a34a)"
                  : "rgba(51, 65, 85, 0.9)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px"
            }}
          >
            {t("home.longScan")}
          </button>
        </div>
      </div>

      {loading && (
        <div
          className="panel fade-up"
          style={{
            marginTop: "20px",
            padding: "14px",
            color: "#cbd5e1"
          }}
        >
          {lang === "fr" ? `Scan ${activeTf}...` : `Scanning ${activeTf}...`}
        </div>
      )}

      {!!error && (
        <div
          className="fade-up"
          style={{
            marginTop: "20px",
            background: "rgba(127, 29, 29, 0.9)",
            color: "#fecaca",
            padding: "14px",
            borderRadius: "14px",
            border: "1px solid rgba(239, 68, 68, 0.4)"
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: "34px" }}>
        {!loading && !error && signals.length === 0 && (
          <div
            className="panel fade-up"
            style={{
              padding: "18px",
              color: "#cbd5e1"
            }}
          >
            {t("home.noSignals")}
          </div>
        )}

        {renderSection("CRYPTO", groupedSignals.CRYPTO)}
        {renderSection("FOREX", groupedSignals.FOREX)}
        {renderSection("GOLD", groupedSignals.GOLD)}
      </div>
    </div>
  )
}