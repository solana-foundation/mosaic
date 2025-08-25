export default function DocsWebsitePage() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1>About the App</h1>
      <p>
        Mosaic UI is a Next.js app that uses <code>gill</code>,{' '}
        <code>@solana/kit</code>, and <code>@mosaic/sdk</code> for on-chain
        operations.
      </p>
      <h2>Architecture</h2>
      <ul>
        <li>Providers: wallet, theme, cluster (devnet/testnet/mainnet), RPC</li>
        <li>Pages: Landing, Dashboard, Create flows, Manage token pages</li>
        <li>Local storage keeps a list of tokens you created</li>
      </ul>
      <h2>Create flows</h2>
      <ul>
        <li>
          Stablecoin: metadata, pausable, confidential balances, permanent
          delegate
        </li>
        <li>Arcade Token: metadata, pausable, permanent delegate, allowlist</li>
        <li>Tokenized Security: stablecoin set + scaled UI amount</li>
        <li>ACL mode: choose allowlist (closed-loop) or blocklist</li>
        <li>
          Single-signer side-effects: Token ACL + ABL set up automatically
        </li>
      </ul>
      <h2>Clusters and RPC</h2>
      <p>
        The app defaults to Devnet. Use the cluster selector in the header to
        switch. RPC and subscriptions come from the cluster context.
      </p>
      <h2>Wallets</h2>
      <p>
        Connect a Solana wallet supported by <code>@solana/wallet-adapter</code>
        . You need SOL for fees on the chosen cluster.
      </p>
    </div>
  );
}
