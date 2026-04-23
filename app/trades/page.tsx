"use client"

import Link from "next/link"
import { TradeRecord } from "@/lib/tradeTracker"
import { useEffect, useMemo, useState } from "react"
import { useLanguage } from "@/components/language-provider"

type TradeStatus =
  | "SIGNAL"
  | "OPEN"
  | "SL_HIT"
  | "CLOSED"
  | "CANCELLED"

type PerformancePeriod =
  | "ALL"
  | "TODAY"
  | "7D"
  | "30D"
  | "THIS_MONTH"
  | "CUSTOM"

type TradeRecordWithLive = TradeRecord & {
  currentPrice?: number
  floatingPnl?: number
}

type PerformanceSummary = {
  totalTrades: number
  closedTrades: number
  winningTrades: number
  losingTrades: number
  breakEvenTrades: number
  winRate: number
  lossRate: number
  grossProfit: number
  grossLoss: number
  netProfit: number
  averageWin: number
  averageLoss: number
  bestTrade: number
  worstTrade: number
  profitFactor: number
  expectancy: number
  maxDrawdown: number
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
}

type SymbolPerformance = {
  symbol: string
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  grossProfit: number
  grossLoss: number
  netProfit: number
  profitFactor: number
}

type PerformanceResponse = {
  success: boolean
  filter?: {
    period?: PerformancePeriod
    from?: string
    to?: string
  }
  summary: PerformanceSummary
  bySymbol: SymbolPerformance[]
  quickStats: {
    winRate: number
    profitFactor: number
    maxDrawdown: number
    netPnl: number
  }
}

type TradesResponse = {
  success: boolean
  filter?: {
    period?: PerformancePeriod
    from?: string
    to?: string
  }
  all: TradeRecord[]
  signals: TradeRecord[]
  open: TradeRecord[]
  closed: TradeRecord[]
  stats: {
    total: number
    wins: number
    losses: number
    winRate: number
    grossProfit: number
    grossLoss: number
    netPnl: number
    profitFactor: number
  }
}

type LivePriceBook = {
  BINANCE: Record<string, number>
  TWELVEDATA: Record<string, number>
  MT5: Record<string, number>
}

function getCardBorderColor(direction: TradeRecord["direction"]) {
  return direction === "BUY" ? "#22c55e" : "#ef4444"
}

function getDirectionColor(direction: TradeRecord["direction"]) {
  return direction === "BUY" ? "#22c55e" : "#ef4444"
}

function getStatusColor(status: TradeStatus) {
  if (status === "OPEN") return "#22c55e"
  if (status === "SL_HIT") return "#ef4444"
  if (status === "CANCELLED") return "#94a3b8"
  if (status === "CLOSED") return "#a78bfa"
  return "#f59e0b"
}

function getPnlColor(pnl?: number) {
  if ((pnl ?? 0) > 0) return "#22c55e"
  if ((pnl ?? 0) < 0) return "#ef4444"
  return "#cbd5e1"
}

function formatNumber(value: number | undefined, decimals = 4) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-"
  return Number(value).toFixed(decimals)
}

function getPriceChange(trade: TradeRecord, currentPrice?: number) {
  if (currentPrice === undefined) return undefined

  const entry = trade.actualEntry ?? trade.entry

  const diff =
    trade.direction === "BUY"
      ? currentPrice - entry
      : entry - currentPrice

  return Number(diff.toFixed(4))
}

function getFloatingPnl(trade: TradeRecord, currentPrice?: number) {
  if (currentPrice === undefined) return undefined

  const entry = trade.actualEntry ?? trade.entry

  const diff =
    trade.direction === "BUY"
      ? currentPrice - entry
      : entry - currentPrice

  if (trade.symbol.endsWith("USDT")) {
    if (
      typeof trade.marginUsedUsdt === "number" &&
      trade.marginUsedUsdt > 0 &&
      typeof trade.leverage === "number" &&
      trade.leverage > 0 &&
      entry > 0
    ) {
      const estimatedQuantity = (trade.marginUsedUsdt * trade.leverage) / entry
      return Number((diff * estimatedQuantity).toFixed(4))
    }

    if (typeof trade.quantity === "number" && trade.quantity > 0) {
      return Number((diff * trade.quantity).toFixed(4))
    }

    return undefined
  }

  if (trade.symbol === "XAUUSD") {
    if (typeof trade.actualLot === "number" && trade.actualLot > 0) {
      return Number((diff * trade.actualLot * 100).toFixed(4))
    }
    return undefined
  }

  if (trade.symbol.endsWith("USD")) {
    if (typeof trade.actualLot === "number" && trade.actualLot > 0) {
      return Number((diff * trade.actualLot * 100000).toFixed(4))
    }
    return undefined
  }

  return undefined
}

function resolveCurrentPrice(
  trade: TradeRecord,
  livePrices: LivePriceBook
): number | undefined {
  const source = trade.priceSource
  if (!source) return undefined
  return livePrices[source]?.[trade.symbol]
}

function buildPeriodParams(
  performancePeriod: PerformancePeriod,
  customFrom: string,
  customTo: string
) {
  const params = new URLSearchParams()
  params.set("period", performancePeriod)

  if (performancePeriod === "CUSTOM") {
    if (customFrom) params.set("from", customFrom)
    if (customTo) params.set("to", customTo)
  }

  return params
}

function StatCard({
  title,
  value,
  color = "#f8fafc"
}: {
  title: string
  value: string | number
  color?: string
}) {
  return (
    <div className="panel" style={{ padding: "14px" }}>
      <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
        {title}
      </div>
      <div style={{ fontSize: "22px", fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function TradeCard({
  trade,
  lang
}: {
  trade: TradeRecordWithLive
  lang: "fr" | "en"
}) {
  const isOpenLike = trade.status === "OPEN"
  const priceChange = getPriceChange(trade, trade.currentPrice)

  return (
    <div
      className="card-glass"
      style={{
        padding: "14px",
        borderLeft: `4px solid ${getCardBorderColor(trade.direction)}`,
        marginBottom: "10px"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "8px"
        }}
      >
        <div>
          <b style={{ color: getDirectionColor(trade.direction) }}>
            {trade.symbol}
          </b>{" "}
          — {trade.direction} ({trade.timeframe})
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap"
          }}
        >
          <span
            className="badge"
            style={{
              color: getStatusColor(trade.status as TradeStatus),
              borderColor: getStatusColor(trade.status as TradeStatus)
            }}
          >
            {trade.status}
          </span>

          <span className="badge">
            {lang === "fr" ? "Lot" : "Lot"}: {trade.actualLot ?? "-"}
          </span>

          <span
            className="badge"
            style={{
              color: getPnlColor(isOpenLike ? trade.floatingPnl : trade.pnl),
              borderColor: getPnlColor(isOpenLike ? trade.floatingPnl : trade.pnl)
            }}
          >
            {isOpenLike
              ? `${lang === "fr" ? "Flottant" : "Floating"}: ${trade.floatingPnl ?? "-"}`
              : `${lang === "fr" ? "Réalisé" : "Realized"}: ${trade.pnl ?? "-"}`
            }
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: "4px",
          color: "#cbd5e1",
          fontSize: "14px"
        }}
      >
        <div>{lang === "fr" ? "Entrée" : "Entry"}: {formatNumber(trade.entry, 4)}</div>
        <div>
          {lang === "fr" ? "Entrée réelle" : "Actual Entry"}:{" "}
          {trade.actualEntry !== undefined
            ? formatNumber(trade.actualEntry, 4)
            : "-"}
        </div>
        <div>{lang === "fr" ? "Plateforme d'exécution" : "Execution Venue"}: {trade.executionVenue ?? "-"}</div>
        <div>{lang === "fr" ? "Source prix" : "Price Source"}: {trade.priceSource ?? "-"}</div>
        <div>
          {lang === "fr" ? "Quantité" : "Quantity"}:{" "}
          {trade.quantity !== undefined ? formatNumber(trade.quantity, 4) : "-"}
        </div>
        <div>
          {lang === "fr" ? "Marge utilisée" : "Margin Used"}:{" "}
          {trade.marginUsedUsdt !== undefined
            ? formatNumber(trade.marginUsedUsdt, 2)
            : "-"}
        </div>
        <div>{lang === "fr" ? "Levier" : "Leverage"}: {trade.leverage ?? "-"}</div>
        <div>{lang === "fr" ? "Mode marge" : "Margin Mode"}: {trade.marginMode ?? "-"}</div>
        <div>{lang === "fr" ? "Devise du compte" : "Account Currency"}: {trade.accountCurrency ?? "-"}</div>
        <div>
          {lang === "fr" ? "Prix actuel" : "Current Price"}:{" "}
          {trade.currentPrice !== undefined
            ? formatNumber(trade.currentPrice, 4)
            : "-"}
        </div>
        <div>
          {lang === "fr" ? "Variation prix" : "Price Change"}:{" "}
          <span style={{ color: getPnlColor(priceChange) }}>
            {priceChange !== undefined ? formatNumber(priceChange, 4) : "-"}
          </span>
        </div>
        <div>
          {lang === "fr" ? "PnL flottant" : "Floating PnL"}:{" "}
          <span style={{ color: getPnlColor(trade.floatingPnl) }}>
            {trade.floatingPnl !== undefined
              ? formatNumber(trade.floatingPnl, 4)
              : "-"}
          </span>
        </div>
        <div>
          {lang === "fr" ? "PnL réalisé" : "Realized PnL"}:{" "}
          <span style={{ color: getPnlColor(trade.pnl) }}>
            {trade.pnl !== undefined ? formatNumber(trade.pnl, 4) : "-"}
          </span>
        </div>
        <div>
          TP: {formatNumber(trade.tp, 4)} | SL: {formatNumber(trade.sl, 4)}
        </div>
        <div>
          {lang === "fr" ? "Confiance" : "Confidence"}: {trade.confidence}% |{" "}
          {lang === "fr" ? "Taille position" : "Position Size"}: {trade.positionSize}
        </div>
        <div>{lang === "fr" ? "Ouvert" : "Opened"}: {trade.openedAt ?? "-"}</div>
        <div>{lang === "fr" ? "Fermé" : "Closed"}: {trade.closedAt ?? "-"}</div>
        <div>
          {lang === "fr" ? "Prix de clôture" : "Close Price"}:{" "}
          {trade.closePrice !== undefined
            ? formatNumber(trade.closePrice, 4)
            : "-"}
        </div>
        <div>{lang === "fr" ? "Raison" : "Reason"}: {trade.closeReason ?? "-"}</div>
        {trade.notes && <div>{lang === "fr" ? "Notes" : "Notes"}: {trade.notes}</div>}
      </div>
    </div>
  )
}

export default function TradesPage() {
  const { lang, t } = useLanguage()

  const [tradesLoading, setTradesLoading] = useState(false)
  const [performanceLoading, setPerformanceLoading] = useState(false)
  const [livePricesLoading, setLivePricesLoading] = useState(false)

  const [tradesData, setTradesData] = useState<TradesResponse | null>(null)
  const [performanceData, setPerformanceData] =
    useState<PerformanceResponse | null>(null)

  const [performancePeriod, setPerformancePeriod] =
    useState<PerformancePeriod>("ALL")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const [livePrices, setLivePrices] = useState<LivePriceBook>({
    BINANCE: {},
    TWELVEDATA: {},
    MT5: {}
  })

  const openTradesWithLive = useMemo<TradeRecordWithLive[]>(() => {
    if (!tradesData?.open) return []

    return tradesData.open.map((trade) => {
      const currentPrice = resolveCurrentPrice(trade, livePrices)
      const floatingPnl = getFloatingPnl(trade, currentPrice)

      return {
        ...trade,
        currentPrice,
        floatingPnl
      }
    })
  }, [tradesData?.open, livePrices])

  const closedTradesWithLive = useMemo<TradeRecordWithLive[]>(() => {
    if (!tradesData?.closed) return []
    return tradesData.closed.map((trade) => ({ ...trade }))
  }, [tradesData?.closed])

  async function loadTrades() {
    try {
      setTradesLoading(true)

      const params = buildPeriodParams(
        performancePeriod,
        customFrom,
        customTo
      )

      const res = await fetch(`/api/trades?${params.toString()}`, {
        cache: "no-store"
      })

      const text = await res.text()
      let data: any = null

      try {
        data = JSON.parse(text)
      } catch {
        console.error("Trades API returned non-JSON:", text)
        setTradesData(null)
        return
      }

      if (res.ok && data?.success) {
        setTradesData(data)
      } else {
        console.error("Trades API error:", data)
        setTradesData(null)
      }
    } catch (err) {
      console.error("Trades load error:", err)
      setTradesData(null)
    } finally {
      setTradesLoading(false)
    }
  }

  async function loadPerformance() {
    try {
      setPerformanceLoading(true)

      const params = buildPeriodParams(
        performancePeriod,
        customFrom,
        customTo
      )

      const res = await fetch(`/api/performance?${params.toString()}`, {
        cache: "no-store"
      })

      const text = await res.text()
      let data: any = null

      try {
        data = JSON.parse(text)
      } catch {
        console.error("Performance API returned non-JSON:", text)
        setPerformanceData(null)
        return
      }

      if (res.ok && data?.success) {
        setPerformanceData(data)
      } else {
        console.error("Performance API error:", data)
        setPerformanceData(null)
      }
    } catch (err) {
      console.error("Performance load error:", err)
      setPerformanceData(null)
    } finally {
      setPerformanceLoading(false)
    }
  }

  async function loadLivePrices() {
    try {
      setLivePricesLoading(true)

      const res = await fetch("/api/live-prices?timeframe=SHORT", {
        cache: "no-store"
      })

      const text = await res.text()
      let data: any = null

      try {
        data = JSON.parse(text)
      } catch {
        console.error("Live prices API returned non-JSON:", text)
        return
      }

      if (res.ok && data?.success && data?.prices) {
        setLivePrices(data.prices)
      } else {
        console.error("Live prices API error:", data)
      }
    } catch (err) {
      console.error("Live prices load error:", err)
    } finally {
      setLivePricesLoading(false)
    }
  }

  async function refreshDashboard() {
    await Promise.all([
      loadTrades(),
      loadPerformance(),
      loadLivePrices()
    ])
  }

  useEffect(() => {
    refreshDashboard()

    const interval = setInterval(() => {
      refreshDashboard()
    }, 60000)

    return () => clearInterval(interval)
  }, [performancePeriod, customFrom, customTo])

  return (
    <div className="container-app" style={{ padding: "24px" }}>
      <div
        className="card-glass"
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
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "20px"
          }}
        >
          <h1 style={{ fontSize: "28px", margin: 0 }}>
            {t("trades.title")}
          </h1>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              href="/"
              style={{
                padding: "10px 18px",
                background: "#334155",
                color: "white",
                textDecoration: "none",
                borderRadius: "8px",
                fontWeight: 600
              }}
            >
              {lang === "fr" ? "← RETOUR AU SCANNER" : "← BACK TO SCANNER"}
            </Link>

            <button
              onClick={refreshDashboard}
              style={{
                padding: "10px 18px",
                background: "#0f766e",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600
              }}
            >
              {lang === "fr" ? "ACTUALISER LE TRACKER" : "REFRESH TRACKER"}
            </button>
          </div>
        </div>

        {livePricesLoading && (
          <div style={{ marginBottom: "12px", color: "#94a3b8" }}>
            {lang === "fr" ? "Mise à jour des prix live..." : "Updating live prices..."}
          </div>
        )}

        <div style={{ marginBottom: "10px" }}>
          <h2 style={{ fontSize: "20px", marginBottom: "14px", color: "#f8fafc" }}>
            {t("trades.performance")}
          </h2>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "16px"
            }}
          >
            <select
              value={performancePeriod}
              onChange={(e) =>
                setPerformancePeriod(e.target.value as PerformancePeriod)
              }
              style={{
                padding: "10px",
                background: "#1e293b",
                color: "white",
                border: "1px solid #334155",
                borderRadius: "8px"
              }}
            >
              <option value="ALL">ALL</option>
              <option value="TODAY">{lang === "fr" ? "AUJOURD'HUI" : "TODAY"}</option>
              <option value="7D">7D</option>
              <option value="30D">30D</option>
              <option value="THIS_MONTH">{lang === "fr" ? "CE MOIS" : "THIS_MONTH"}</option>
              <option value="CUSTOM">{lang === "fr" ? "PERSONNALISÉ" : "CUSTOM"}</option>
            </select>

            {performancePeriod === "CUSTOM" && (
              <>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{
                    padding: "10px",
                    background: "#1e293b",
                    color: "white",
                    border: "1px solid #334155",
                    borderRadius: "8px"
                  }}
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={{
                    padding: "10px",
                    background: "#1e293b",
                    color: "white",
                    border: "1px solid #334155",
                    borderRadius: "8px"
                  }}
                />
              </>
            )}
          </div>

          {performanceData?.filter && (
            <div
              style={{
                marginBottom: "14px",
                color: "#94a3b8",
                fontSize: "14px"
              }}
            >
              {lang === "fr" ? "Filtre actif" : "Active filter"}:{" "}
              {performanceData.filter.period || performancePeriod}
              {performanceData.filter.from
                ? ` | ${lang === "fr" ? "Du" : "From"}: ${performanceData.filter.from}`
                : ""}
              {performanceData.filter.to
                ? ` | ${lang === "fr" ? "Au" : "To"}: ${performanceData.filter.to}`
                : ""}
            </div>
          )}

          {performanceLoading ? (
            <div style={{ color: "#cbd5e1" }}>
              {lang === "fr" ? "Chargement performance..." : "Loading performance..."}
            </div>
          ) : performanceData?.summary ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "12px",
                  marginBottom: "18px"
                }}
              >
                <StatCard
                  title={lang === "fr" ? "PnL période" : "Period Net PnL"}
                  value={performanceData.quickStats.netPnl}
                  color={
                    performanceData.quickStats.netPnl >= 0 ? "#22c55e" : "#ef4444"
                  }
                />
                <StatCard
                  title={lang === "fr" ? "Taux de réussite" : "Win Rate"}
                  value={`${performanceData.summary.winRate}%`}
                  color="#22c55e"
                />
                <StatCard
                  title="Profit Factor"
                  value={performanceData.summary.profitFactor}
                  color="#38bdf8"
                />
                <StatCard
                  title={lang === "fr" ? "Profit net" : "Net Profit"}
                  value={performanceData.summary.netProfit}
                  color={
                    performanceData.summary.netProfit >= 0 ? "#22c55e" : "#ef4444"
                  }
                />
                <StatCard
                  title="Max Drawdown"
                  value={performanceData.summary.maxDrawdown}
                  color="#f59e0b"
                />
                <StatCard
                  title={lang === "fr" ? "Trades fermés" : "Closed Trades"}
                  value={performanceData.summary.closedTrades}
                />
              </div>

              {!!performanceData.bySymbol?.length && (
                <div
                  className="panel"
                  style={{
                    padding: "16px"
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: "12px", color: "#93c5fd" }}>
                    {lang === "fr" ? "Performance par symbole" : "Performance by Symbol"}
                  </h3>

                  <div style={{ display: "grid", gap: "10px" }}>
                    {performanceData.bySymbol.map((item) => (
                      <div
                        key={item.symbol}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(120px, 1fr))",
                          gap: "8px",
                          background: "#0f172a",
                          borderRadius: "8px",
                          padding: "12px",
                          border: "1px solid #334155"
                        }}
                      >
                        <div><b>{item.symbol}</b></div>
                        <div>{lang === "fr" ? "Trades" : "Trades"}: {item.totalTrades}</div>
                        <div>{lang === "fr" ? "Win Rate" : "Win Rate"}: {item.winRate}%</div>
                        <div>
                          Net:{" "}
                          <span
                            style={{
                              color: item.netProfit >= 0 ? "#22c55e" : "#ef4444"
                            }}
                          >
                            {item.netProfit}
                          </span>
                        </div>
                        <div>PF: {item.profitFactor}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: "#cbd5e1" }}>
              {lang === "fr" ? "Aucune donnée de performance" : "No performance data yet"}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: "28px" }}>
        <section>
          <h2 style={{ fontSize: "20px", marginBottom: "14px", color: "#93c5fd" }}>
            {t("trades.openTrades")}
          </h2>

          {tradesLoading ? (
            <div style={{ color: "#cbd5e1" }}>
              {lang === "fr" ? "Chargement des trades ouverts..." : "Loading open trades..."}
            </div>
          ) : openTradesWithLive.length ? (
            openTradesWithLive.map((trade) => (
              <TradeCard key={trade.id} trade={trade} lang={lang} />
            ))
          ) : (
            <div style={{ color: "#cbd5e1" }}>{t("trades.noOpenTrades")}</div>
          )}
        </section>

        <section>
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
            <h2 style={{ fontSize: "20px", margin: 0, color: "#93c5fd" }}>
              {t("trades.closedTrades")}
            </h2>

            <span className="badge">
              {lang === "fr" ? "Période" : "Period"}: {tradesData?.filter?.period || performancePeriod}
            </span>
          </div>

          {tradesLoading ? (
            <div style={{ color: "#cbd5e1" }}>
              {lang === "fr" ? "Chargement des trades fermés..." : "Loading closed trades..."}
            </div>
          ) : closedTradesWithLive.length ? (
            closedTradesWithLive.map((trade) => (
              <TradeCard key={trade.id} trade={trade} lang={lang} />
            ))
          ) : (
            <div style={{ color: "#cbd5e1" }}>
              {lang === "fr"
                ? "Aucun trade fermé pour la période sélectionnée"
                : "No closed trades for selected period"}
            </div>
          )}
        </section>

        <section>
          <h2 style={{ fontSize: "20px", marginBottom: "14px", color: "#93c5fd" }}>
            {t("trades.signals")}
          </h2>

          {tradesLoading ? (
            <div style={{ color: "#cbd5e1" }}>
              {lang === "fr" ? "Chargement des signaux..." : "Loading signals..."}
            </div>
          ) : tradesData?.signals?.length ? (
            tradesData.signals.map((trade) => (
              <TradeCard key={trade.id} trade={trade as TradeRecordWithLive} lang={lang} />
            ))
          ) : (
            <div style={{ color: "#cbd5e1" }}>{t("trades.noSignals")}</div>
          )}
        </section>
      </div>
    </div>
  )
}