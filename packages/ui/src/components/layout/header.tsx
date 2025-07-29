"use client"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { useRouter, usePathname } from "next/navigation"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import Link from "next/link"

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-20 items-center justify-between">
        <Link className="flex items-center space-x-2" href={"/"}>
          <h1 className="text-3xl font-bold">Mosaic</h1>
        </Link>
        <div className="flex items-center space-x-4">
          {pathname === "/" ? (
            <Button variant="outline" onClick={() => router.push("/dashboard")} className="p-6 text-lg">
              Get Started
            </Button>
          ) : (
            <WalletMultiButton/>
          )}
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
