"use client"

import { useLanguage } from "@/components/language-provider"

export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage()

  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        background: "#0f172a",
        padding: "4px",
        borderRadius: "999px",
        border: "1px solid #334155"
      }}
    >
      <button
        onClick={() => setLang("fr")}
        style={{
          padding: "6px 12px",
          borderRadius: "999px",
          border: "none",
          background: lang === "fr" ? "#2563eb" : "transparent",
          color: "white"
        }}
      >
        FR
      </button>

      <button
        onClick={() => setLang("en")}
        style={{
          padding: "6px 12px",
          borderRadius: "999px",
          border: "none",
          background: lang === "en" ? "#2563eb" : "transparent",
          color: "white"
        }}
      >
        EN
      </button>
    </div>
  )
}