import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Header } from '@/components/layout/header';
// import { Footer } from '@/components/layout/footer';
import { cn } from '@/lib/utils';
import { Providers } from './providers';
import { Toaster } from '@/components/ui/sonner';

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
                <Providers>
                    <div className="flex bg-bg1/50 dark:bg-background mx-auto min-h-screen flex-col">
                        <Header />
                        <main className="flex-1">{children}</main>
                        {/* <Footer /> */}
                    </div>
                    <Toaster position="bottom-center" />
                </Providers>
            </body>
        </html>
    );
}
