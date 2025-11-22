import { GithubIcon, TwitterIcon } from 'lucide-react';
import Image from 'next/image';

export function Footer() {
    return (
        <footer className="border-t bg-bg1">
            <div className="max-w-6xl mx-auto flex h-16 items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    <a
                        href="https://github.com/solana-foundation/mosaic/blob/main/LICENSE"
                        className="underline hover:text-primary"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        MIT License
                    </a>
                </p>
                <div className="flex gap-4 text-muted-foreground">
                    <a
                        href="https://github.com/solana-foundation/mosaic"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="GitHub"
                        className="hover:text-primary"
                    >
                        <GithubIcon className="w-5 h-5" />
                    </a>
                    <a
                        href="https://x.com/solana_devs"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Twitter"
                        className="hover:text-primary"
                    >
                        <TwitterIcon className="w-5 h-5" />
                    </a>
                    <a
                        href="https://solana.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Solana"
                        className="hover:text-primary"
                    >
                        <Image src="/solanaLogoMark.svg" alt="Solana" width={20} height={20} />
                    </a>
                </div>
            </div>
        </footer>
    );
}
