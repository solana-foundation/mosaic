import { GithubIcon, TwitterIcon } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container flex h-16 items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <a
            href="https://github.com/YOUR_ORG/mosaic/blob/main/LICENSE"
            className="underline hover:text-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            MIT License
          </a>
        </p>
        <div className="flex gap-4 text-muted-foreground">
          <a
            href="https://github.com/gitteri/mosaic"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="hover:text-primary"
          >
            <GithubIcon className="w-5 h-5" />
          </a>
          <a
            href="https://x.com/solana"
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
            <img src="/solanaLogoMark.svg" alt="Solana" className="w-5 h-5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
