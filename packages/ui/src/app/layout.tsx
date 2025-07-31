import type { Metadata } from 'next';
import { AR_One_Sans } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ChainContextProvider } from '@/context/ChainContextProvider';
import { SelectedWalletAccountContextProvider } from '@/context/SelectedWalletAccountContextProvider';
import { RpcContextProvider } from '@/context/RpcContextProvider';

const ar = AR_One_Sans({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Mosaic - Tokenization Engine',
  description:
    'Create, manage, and deploy stablecoins and tokenized assets on Solana',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={ar.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <ChainContextProvider>
            <SelectedWalletAccountContextProvider>
              <RpcContextProvider>
                <div className="flex min-h-screen flex-col bg-background">
                  <Header />
                  <main className="flex-1">{children}</main>
                  <Footer />
                </div>
              </RpcContextProvider>
            </SelectedWalletAccountContextProvider>
          </ChainContextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
