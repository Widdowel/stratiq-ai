"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useLanguage } from "@/components/language-provider"

const STORAGE_KEY = "stratiq-risk-last-accepted-at"
const REMINDER_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000 // 48h

function shouldShowRiskNotice(savedValue: string | null) {
  if (!savedValue) return true

  const lastAcceptedAt = Number(savedValue)
  if (!Number.isFinite(lastAcceptedAt)) return true

  return Date.now() - lastAcceptedAt >= REMINDER_INTERVAL_MS
}

export function RiskNoticeGate({
  children
}: {
  children: React.ReactNode
}) {
  const { lang } = useLanguage()
  const [mounted, setMounted] = useState(false)
  const [showNotice, setShowNotice] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem(STORAGE_KEY)
    setShowNotice(shouldShowRiskNotice(saved))
  }, [])

  function acceptRisk() {
    localStorage.setItem(STORAGE_KEY, String(Date.now()))
    setShowNotice(false)
  }

  if (!mounted) return null

  return (
    <>
      {showNotice && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 9999
          }}
        >
          <div
            className="card-glass"
            style={{
              width: "100%",
              maxWidth: "760px",
              padding: "24px",
              border: "1px solid rgba(239, 68, 68, 0.35)"
            }}
          >
            <div
              style={{
                color: "#f59e0b",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                marginBottom: "10px"
              }}
            >
              {lang === "fr" ? "AVERTISSEMENT IMPORTANT" : "IMPORTANT WARNING"}
            </div>

            <h2 style={{ fontSize: "28px", marginBottom: "12px" }}>
              {lang === "fr"
                ? "Notice de responsabilité et risque de trading"
                : "Trading risk and responsibility notice"}
            </h2>

            <div
              style={{
                color: "#cbd5e1",
                lineHeight: 1.7,
                display: "grid",
                gap: "10px",
                marginBottom: "18px"
              }}
            >
              <p>
                {lang === "fr"
                  ? "Le trading de crypto, forex et or comporte un risque élevé de perte de capital."
                  : "Trading crypto, forex and gold involves a high risk of capital loss."}
              </p>

              <p>
                {lang === "fr"
                  ? "Vous êtes seul responsable de vos décisions et de votre gestion du risque."
                  : "You are solely responsible for your decisions and your risk management."}
              </p>

              <p>
                {lang === "fr"
                  ? "Ce rappel sera affiché à nouveau tous les 2 jours."
                  : "This reminder will be shown again every 2 days."}
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={acceptRisk}
                style={{
                  padding: "12px 18px",
                  border: "none",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #22c55e, #16a34a)",
                  color: "white",
                  fontWeight: 700
                }}
              >
                {lang === "fr"
                  ? "J'AI LU ET J'ACCEPTE"
                  : "I HAVE READ AND ACCEPT"}
              </button>

              <Link
                href="/risk-disclosure"
                style={{
                  padding: "12px 18px",
                  borderRadius: "12px",
                  background: "rgba(51, 65, 85, 0.9)",
                  color: "white",
                  fontWeight: 700
                }}
              >
                {lang === "fr" ? "LIRE LA NOTICE" : "READ DISCLOSURE"}
              </Link>
            </div>
          </div>
        </div>
      )}

      {children}
    </>
  )
}