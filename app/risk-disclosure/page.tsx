"use client"

import Link from "next/link"
import { useLanguage } from "@/components/language-provider"

export default function RiskDisclosurePage() {
  const { lang } = useLanguage()

  return (
    <div className="container-app" style={{ padding: "24px" }}>
      <div className="card-glass" style={{ padding: "24px" }}>
        <h1 style={{ fontSize: "32px", marginBottom: "16px" }}>
          {lang === "fr"
            ? "Notice de responsabilité et avertissement"
            : "Risk disclosure and disclaimer"}
        </h1>

        <div style={{ color: "#cbd5e1", lineHeight: 1.8, display: "grid", gap: "14px" }}>
          <p>
            {lang === "fr"
              ? "STRATIQ‑2 fournit des signaux, analyses et informations de marché à titre informatif uniquement."
              : "STRATIQ‑2 provides signals, analysis and market information for informational purposes only."}
          </p>
          <p>
            {lang === "fr"
              ? "Aucune information affichée sur cette plateforme ne constitue un conseil en investissement ni une garantie de résultat."
              : "Nothing shown on this platform constitutes investment advice or a guarantee of results."}
          </p>
          <p>
            {lang === "fr"
              ? "Le trading à effet de levier peut entraîner des pertes rapides et importantes."
              : "Leveraged trading can lead to rapid and substantial losses."}
          </p>
          <p>
            {lang === "fr"
              ? "Utilisez toujours un money management strict et un capital que vous pouvez vous permettre de perdre."
              : "Always use strict money management and only capital you can afford to lose."}
          </p>
        </div>

        <div style={{ marginTop: "20px" }}>
          <Link
            href="/"
            style={{
              padding: "11px 18px",
              background: "rgba(51, 65, 85, 0.9)",
              color: "white",
              borderRadius: "12px",
              fontWeight: 700
            }}
          >
            {lang === "fr" ? "← RETOUR" : "← BACK"}
          </Link>
        </div>
      </div>
    </div>
  )
}