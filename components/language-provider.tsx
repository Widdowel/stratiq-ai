"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react"
import { AppLanguage, createTranslator } from "@/lib/i18n"

type LanguageContextType = {
  lang: AppLanguage
  setLang: (lang: AppLanguage) => void
  t: (path: string) => string
}

const LanguageContext = createContext<LanguageContextType | null>(null)

export function LanguageProvider({
  children
}: {
  children: React.ReactNode
}) {
  const [lang, setLangState] = useState<AppLanguage>("fr")

  useEffect(() => {
    const saved = localStorage.getItem("app-language") as AppLanguage | null
    if (saved === "fr" || saved === "en") {
      setLangState(saved)
    }
  }, [])

  function setLang(value: AppLanguage) {
    setLangState(value)
    localStorage.setItem("app-language", value)
  }

  const t = useMemo(() => createTranslator(lang), [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error("useLanguage must be used inside LanguageProvider")
  }
  return ctx
}