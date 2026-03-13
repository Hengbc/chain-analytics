"use client"

import * as React from "react"
import { translations, type Lang, type Translations } from "@/lib/i18n"

type LangContextValue = {
  lang: Lang
  setLang: (l: Lang) => void
  t: Translations
}

const LangContext = React.createContext<LangContextValue>({
  lang: "en",
  setLang: () => {},
  t: translations.en,
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = React.useState<Lang>("en")
  const t = translations[lang]
  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return React.useContext(LangContext)
}
