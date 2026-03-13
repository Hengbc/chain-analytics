"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { MoonIcon, SunIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = mounted && (theme === "light" || theme === "dark") ? theme : "dark"

  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-background/80 p-1 backdrop-blur-sm">
      <Button
        type="button"
        variant={currentTheme === "light" ? "default" : "ghost"}
        size="sm"
        className={cn("h-7 rounded-full px-2.5", currentTheme !== "light" && "text-muted-foreground")}
        onClick={() => setTheme("light")}
        aria-label="Switch to light mode"
        title="Light mode"
      >
        <SunIcon className="size-4" />
        <span>Light</span>
      </Button>
      <Button
        type="button"
        variant={currentTheme === "dark" ? "default" : "ghost"}
        size="sm"
        className={cn("h-7 rounded-full px-2.5", currentTheme !== "dark" && "text-muted-foreground")}
        onClick={() => setTheme("dark")}
        aria-label="Switch to dark mode"
        title="Dark mode"
      >
        <MoonIcon className="size-4" />
        <span>Dark</span>
      </Button>
    </div>
  )
}
