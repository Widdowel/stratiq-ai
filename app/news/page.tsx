"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useLanguage } from "@/components/language-provider"

type MacroImpact = "LOW" | "MEDIUM" | "HIGH"

type MacroEvent = {
  id?: string
  title?: string
  event?: string
  description?: string
  country?: string
  currency?: string
  time?: string
  impact?: MacroImpact | string
  actual?: string | number | null
  forecast?: string | number | null
  previous?: string | number | null
}

type NewsResponse = {
  success: boolean
  date?: string
  summary?: {
    riskLevel: MacroImpact
    headline: string
    description: string
  }
  recommendations?: string[]
  events?: MacroEvent[]
  message?: string
}

function normalizeImpact(impact?: string): MacroImpact {
  if (impact === "HIGH") return "HIGH"
  if (impact === "MEDIUM") return "MEDIUM"
  return "LOW"
}

function getImpactColor(impact?: string) {
  const value = normalizeImpact(impact)

  if (value === "HIGH") return "#ef4444"
  if (value === "MEDIUM") return "#f59e0b"
  return "#22c55e"
}

function getRiskBg(risk?: string) {
  const value = normalizeImpact(risk)

  if (value === "HIGH") return "rgba(127, 29, 29, 0.35)"
  if (value === "MEDIUM") return "rgba(120, 53, 15, 0.35)"
  return "rgba(5, 46, 22, 0.35)"
}

function getRiskBorder(risk?: string) {
  const value = normalizeImpact(risk)

  if (value === "HIGH") return "#ef4444"
  if (value === "MEDIUM") return "#f59e0b"
  return "#22c55e"
}

function formatValue(value: string | number | null | undefined) {
  if (value === undefined || value === null || value === "") return "-"
  return String(value)
}

function NewsCard({
  event,
  lang
}: {
  event: MacroEvent
  lang: "fr" | "en"
}) {
  const title = event.title || event.event || "Macro Event"
  const impact = normalizeImpact(event.impact)

  return (
    <div
      className="card-glass fade-up"
      style={{
        padding: "18px",
        borderLeft: `4px solid ${getImpactColor(impact)}`
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "14px",
          alignItems: "center"
        }}
      >
        <div style={{ color: "#f8fafc", fontWeight: 700, fontSize: "18px" }}>
          {title}
        </div>

        <span
          className="badge"
          style={{
            color: getImpactColor(impact),
            borderColor: getImpactColor(impact)
          }}
        >
          {impact} {lang === "fr" ? "IMPACT" : "IMPACT"}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "10px",
          marginBottom: "14px"
        }}
      >
        <div className="panel" style={{ padding: "12px" }}>
          <div className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>
            {lang === "fr" ? "PAYS" : "COUNTRY"}
          </div>
          <div style={{ fontWeight: 700 }}>{event.country || "-"}</div>
        </div>

        <div className="panel" style={{ padding: "12px" }}>
          <div className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>
            {lang === "fr" ? "DEVISE" : "CURRENCY"}
          </div>
          <div style={{ fontWeight: 700 }}>{event.currency || "-"}</div>
        </div>

        <div className="panel" style={{ padding: "12px" }}>
          <div className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>
            {lang === "fr" ? "HEURE" : "TIME"}
          </div>
          <div style={{ fontWeight: 700 }}>{event.time || "-"}</div>
        </div>

        <div className="panel" style={{ padding: "12px" }}>
          <div className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>
            {lang === "fr" ? "ACTUEL" : "ACTUAL"}
          </div>
          <div style={{ fontWeight: 700 }}>{formatValue(event.actual)}</div>
        </div>

        <div className="panel" style={{ padding: "12px" }}>
          <div className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>
            {lang === "fr" ? "PRÉVISION" : "FORECAST"}
          </div>
          <div style={{ fontWeight: 700 }}>{formatValue(event.forecast)}</div>
        </div>

        <div className="panel" style={{ padding: "12px" }}>
          <div className="text-muted" style={{ fontSize: "12px", marginBottom: "4px" }}>
            {lang === "fr" ? "PRÉCÉDENT" : "PREVIOUS"}
          </div>
          <div style={{ fontWeight: 700 }}>{formatValue(event.previous)}</div>
        </div>
      </div>

      <div
        className="panel"
        style={{
          padding: "14px",
          color: "#cbd5e1",
          lineHeight: 1.7,
          fontSize: "14px"
        }}
      >
        {event.description ||
          (lang === "fr"
            ? "Aucune description disponible pour cet événement."
            : "No description available for this event.")}
      </div>
    </div>
  )
}

export default function NewsPage() {
  const { lang, t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<NewsResponse | null>(null)

  async function loadNews() {
    try {
      setLoading(true)

      const res = await fetch("/api/news", {
        cache: "no-store"
      })

      const text = await res.text()
      let parsed: NewsResponse | null = null

      try {
        parsed = JSON.parse(text)
      } catch {
        console.error("News API returned non-JSON:", text)
        setData({
          success: false,
          events: [],
          recommendations: [],
          message: lang === "fr" ? "Réponse API invalide" : "Invalid API response"
        })
        return
      }

      setData(parsed)
    } catch (error) {
      console.error("News load error:", error)
      setData({
        success: false,
        events: [],
        recommendations: [],
        message: lang === "fr" ? "Impossible de charger les news" : "Unable to load news"
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNews()

    const interval = setInterval(() => {
      loadNews()
    }, 180000)

    return () => clearInterval(interval)
  }, [lang])

  const riskLevel = useMemo(
    () => normalizeImpact(data?.summary?.riskLevel),
    [data?.summary?.riskLevel]
  )

  const events = data?.events || []
  const recommendations = data?.recommendations || []

  return (
    <div className="container-app" style={{ padding: "24px" }}>
      <div
        className="card-glass fade-up"
        style={{
          padding: "24px",
          marginBottom: "22px"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: "14px"
          }}
        >
          <div>
            <div
              style={{
                color: "#f59e0b",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.12em",
                marginBottom: "8px"
              }}
            >
              {lang === "fr" ? "NEWS & INTELLIGENCE MACRO" : "NEWS & MACRO INTELLIGENCE"}
            </div>

            <h1 style={{ fontSize: "32px", margin: 0, color: "#f8fafc" }}>
              {t("news.title")}
            </h1>

            <p style={{ marginTop: "8px", maxWidth: "760px" }}>
              {lang === "fr"
                ? "Surveille les événements macro-économiques, le risque du jour et les recommandations trading avant d'entrer sur le marché."
                : "Monitor macro-economic events, daily risk conditions and trading recommendations before entering the market."}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              href="/"
              style={{
                padding: "11px 18px",
                background: "rgba(51, 65, 85, 0.9)",
                color: "white",
                borderRadius: "12px",
                fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.08)"
              }}
            >
              {t("common.backHome")}
            </Link>

            <button
              onClick={loadNews}
              style={{
                padding: "11px 18px",
                background: "linear-gradient(135deg, #0f766e, #0d9488)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px",
                fontWeight: 700,
                boxShadow: "var(--shadow-soft)"
              }}
            >
              {t("news.refreshNews")}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div
          className="panel fade-up"
          style={{
            padding: "16px",
            color: "#cbd5e1"
          }}
        >
          {lang === "fr" ? "Chargement des news macro..." : "Loading macro news..."}
        </div>
      ) : (
        <>
          <div
            className="fade-up"
            style={{
              background: getRiskBg(riskLevel),
              border: `1px solid ${getRiskBorder(riskLevel)}`,
              borderRadius: "18px",
              padding: "22px",
              marginBottom: "24px",
              boxShadow: "var(--shadow-soft)"
            }}
          >
            <div
              style={{
                color: getRiskBorder(riskLevel),
                fontSize: "13px",
                fontWeight: 800,
                marginBottom: "8px",
                letterSpacing: "0.08em"
              }}
            >
              {t("news.todayRisk")}: {riskLevel}
            </div>

            <div
              style={{
                color: "#f8fafc",
                fontSize: "24px",
                fontWeight: 800,
                marginBottom: "10px"
              }}
            >
              {data?.summary?.headline ||
                (lang === "fr" ? "Vue d'ensemble du risque macro" : "Macro risk overview")}
            </div>

            <div
              style={{
                color: "#cbd5e1",
                lineHeight: 1.7,
                maxWidth: "900px"
              }}
            >
              {data?.summary?.description ||
                (lang === "fr"
                  ? "Aucun résumé macro disponible pour le moment."
                  : "No macro summary available for now.")}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
              gap: "20px",
              alignItems: "start"
            }}
          >
            <section>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "14px",
                  flexWrap: "wrap"
                }}
              >
                <h2
                  style={{
                    fontSize: "21px",
                    color: "#93c5fd"
                  }}
                >
                  {t("news.macroEvents")}
                </h2>
                <span className="badge">
                  {events.length} {lang === "fr" ? "événements" : "events"}
                </span>
              </div>

              {events.length ? (
                <div style={{ display: "grid", gap: "14px" }}>
                  {events.map((event, index) => (
                    <NewsCard
                      key={event.id || `${event.title || event.event}-${index}`}
                      event={event}
                      lang={lang}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="panel"
                  style={{
                    padding: "18px",
                    color: "#cbd5e1"
                  }}
                >
                  {data?.message ||
                    (lang === "fr"
                      ? "Aucun événement macro disponible aujourd'hui."
                      : "No macro events available today.")}
                </div>
              )}
            </section>

            <section>
              <h2
                style={{
                  fontSize: "21px",
                  marginBottom: "14px",
                  color: "#93c5fd"
                }}
              >
                {t("news.recommendations")}
              </h2>

              <div
                className="card-glass"
                style={{
                  padding: "18px"
                }}
              >
                {recommendations.length ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {recommendations.map((item, index) => (
                      <div
                        key={`${item}-${index}`}
                        className="panel"
                        style={{
                          padding: "14px",
                          color: "#cbd5e1",
                          lineHeight: 1.7
                        }}
                      >
                        <span
                          style={{
                            color: "#22c55e",
                            fontWeight: 800,
                            marginRight: "8px"
                          }}
                        >
                          #{index + 1}
                        </span>
                        {item}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: "#cbd5e1" }}>
                    {lang === "fr"
                      ? "Aucune recommandation disponible pour le moment."
                      : "No recommendations available yet."}
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}