import type { Metadata } from 'next';
import localFont from 'next/font/local';
// Import globals.css before any other components to avoid FOUC during HMR
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { cn } from '@/lib/utils';
import { ChainContextProvider } from '@/context/ChainContextProvider';
import { SolanaConnectorProvider } from '@/components/solana-connector-provider';
import { RpcContextProvider } from '@/context/RpcContextProvider';

// Inter Variable font for body text with weights: 450, 550, 600
const inter = localFont({
    src: '../fonts/InterVariable.woff2',
    variable: '--font-inter',
    display: 'swap',
});

// ABC Diatype fonts
const abcDiatype = localFont({
    src: [
        {
            path: '../fonts/ABCDiatype-Regular.woff2',
            weight: '400',
            style: 'normal',
        },
        {
            path: '../fonts/ABCDiatype-Medium.woff2',
            weight: '500',
            style: 'normal',
        },
        {
            path: '../fonts/ABCDiatype-Bold.woff2',
            weight: '700',
            style: 'normal',
        },
    ],
    variable: '--font-abc-diatype',
    display: 'swap',
});

// Berkeley Mono fonts
const berkeleyMono = localFont({
    src: [
        {
            path: '../fonts/BerkeleyMono-Regular.otf',
            weight: '400',
            style: 'normal',
        },
        {
            path: '../fonts/BerkeleyMono-Oblique.otf',
            weight: '400',
            style: 'italic',
        },
        {
            path: '../fonts/BerkeleyMono-Bold.otf',
            weight: '700',
            style: 'normal',
        },
        {
            path: '../fonts/BerkeleyMono-Bold-Oblique.otf',
            weight: '700',
            style: 'italic',
        },
    ],
    variable: '--font-berkeley-mono',
    display: 'swap',
});

export const metadata: Metadata = {
    title: 'Mosaic - Tokenization Engine',
    description: 'Create, manage, and deploy stablecoins and tokenized assets on Solana',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={cn(inter.variable, abcDiatype.variable, berkeleyMono.variable, 'antialiased')}>
                <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
                    <ChainContextProvider>
                        <SolanaConnectorProvider>
                            <RpcContextProvider>
                                <div className="flex min-h-screen flex-col bg-background">
                                    <Header />
                                    <main className="flex-1">{children}</main>
                                    <Footer />
                                </div>
                            </RpcContextProvider>
                        </SolanaConnectorProvider>
                    </ChainContextProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
