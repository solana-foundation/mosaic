import { Button } from '@/components/ui/button';
import { Coins, Shield, Zap } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background py-24 sm:py-32">
      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
            Tokenization Engine
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Create, manage, and deploy stablecoins and tokenized assets on
            Solana with enterprise-grade security and compliance features.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Button size="lg">Create Token</Button>
            <Button variant="outline" size="lg">
              Learn More
            </Button>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Coins className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              Stablecoin Creation
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Deploy regulatory-compliant stablecoins with built-in extensions
              for transfer restrictions and metadata management.
            </p>
          </div>

          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              Security & Compliance
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Advanced allowlist and blocklist management with real-time
              monitoring and audit trails for regulatory compliance.
            </p>
          </div>

          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              Lightning Fast
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Built on Solana for sub-second finality and minimal transaction
              costs, enabling high-frequency trading and real-time settlements.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
