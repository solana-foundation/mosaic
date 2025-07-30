import type { Metadata } from 'next';
import { Inter, Fira_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { SolanaProvider } from '@/components/solana-provider';
import { cn } from '@/lib/utils';

const fontSans = Inter({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-sans',
});
const fontMono = Fira_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
});

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
    <SolanaProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={cn(fontSans.variable, fontMono.variable, 'font-sans antialiased')}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <div className="flex min-h-screen flex-col bg-background">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </ThemeProvider>
        </body>
      </html>
    </SolanaProvider>
  );
}
