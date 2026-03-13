"use client"

import { useLang } from "@/components/lang-context"
import type { Lang } from "@/lib/i18n"
import { Button } from "@/components/ui/button"

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "zh", label: "中文" },
  { code: "vn", label: "VN" },
]

export function LangSwitcher() {
  const { lang, setLang } = useLang()
  return (
    <div className="flex items-center gap-0.5">
      {LANGS.map(({ code, label }) => (
        <Button
          key={code}
          variant={lang === code ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setLang(code)}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}
