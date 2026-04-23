"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/components/language-provider"
import { LanguageSwitcher } from "@/components/language-switcher"

export function AppHeader() {
  const { lang } = useLanguage()
  const supabase = createClient()

  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user }
      } = await supabase.auth.getUser()

      setUser(user)
    }

    loadUser()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <div
      style={{
        padding: "20px 40px",
        borderBottom: "1px solid #1e293b",
        background: "rgba(2, 6, 23, 0.95)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        backdropFilter: "blur(8px)"
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap"
        }}
      >
        {/* LEFT */}
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: 700,
              color: "#f8fafc"
            }}
          >
            🚀 STRATIQ‑2
          </h1>

          <div
            style={{
              fontSize: "13px",
              color: "#94a3b8",
              marginTop: "4px"
            }}
          >
            {lang === "fr"
              ? "Moteur IA de signaux trading"
              : "AI Trading Signal Engine"}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <LanguageSwitcher />

          {!user ? (
            <>
              <Link
                href="/login"
                style={{
                  padding: "8px 14px",
                  background: "#334155",
                  borderRadius: "8px",
                  fontWeight: 600
                }}
              >
                Login
              </Link>

              <Link
                href="/signup"
                style={{
                  padding: "8px 14px",
                  background: "#22c55e",
                  borderRadius: "8px",
                  fontWeight: 600
                }}
              >
                Sign up
              </Link>
            </>
          ) : (
            <>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                {user.email}
              </span>

              <button
                onClick={handleLogout}
                style={{
                  padding: "8px 14px",
                  background: "#ef4444",
                  borderRadius: "8px",
                  border: "none",
                  color: "white",
                  fontWeight: 600
                }}
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}