import type { Metadata } from "next"
import "./globals.css"

import { LanguageProvider } from "@/components/language-provider"
import { AppHeader } from "@/components/app-header"
import { RiskNoticeGate } from "../components/risk-notice-gate"

export const metadata: Metadata = {
  title: "STRATIQ‑2",
  description: "AI Trading Signal Engine"
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#020617",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: 0,
          minHeight: "100vh"
        }}
      >
        <LanguageProvider>
          <RiskNoticeGate>
            <AppHeader />

            <main
              style={{
                padding: "40px 20px",
                maxWidth: "1100px",
                margin: "0 auto"
              }}
            >
              {children}
            </main>
          </RiskNoticeGate>
        </LanguageProvider>
      </body>
    </html>
  )
}