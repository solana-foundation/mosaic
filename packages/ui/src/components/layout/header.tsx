"use client"

import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center space-x-2">
          <h1 className="text-2xl font-bold">Mosaic</h1>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="outline">Get Started</Button>
          <ModeToggle />
        </div>
      </div>
    </header>
  )
} 