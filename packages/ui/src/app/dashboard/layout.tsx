"use client"

import type { Metadata } from "next"
import { Inter, AR_One_Sans } from "next/font/google"
import "../globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { FC, useMemo } from "react"
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { UnsafeBurnerWalletAdapter } from "@solana/wallet-adapter-wallets"
import {
  WalletModalProvider,
} from '@solana/wallet-adapter-react-ui'
import { createSolanaClient } from 'gill'

import '@solana/wallet-adapter-react-ui/styles.css'

const ar = AR_One_Sans({ subsets: ["latin"] })

// export const metadata: Metadata = {
//   title: "Mosaic Dashboard",
//   description: "Create, manage, and deploy stablecoins and tokenized assets on Solana",
// }

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const network = WalletAdapterNetwork.Devnet;

  const endpoint = 'https://api.devnet.solana.com'

  const wallets = useMemo(
    () => [
      new UnsafeBurnerWalletAdapter(),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <html lang="en" suppressHydrationWarning>
            <body className={ar.className}>
              <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem
                disableTransitionOnChange
              >
                <div className="flex min-h-screen flex-col bg-background">
                  <Header />
                  <main className="flex-1">
                    {children}
                  </main>
                  <Footer />
                </div>
              </ThemeProvider>
            </body>
          </html>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
} 