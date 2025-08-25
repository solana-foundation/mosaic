export default function DocsDepsPage() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1>SDK, CLI, and Dependencies</h1>
      <p>Key packages and where to find their READMEs in this repository.</p>

      <h2>Internal packages (paths)</h2>
      <ul>
        <li>
          <code>packages/sdk/README.md</code> — SDK developer guide
        </li>
        <li>
          <code>packages/cli/README.md</code> — CLI usage and commands
        </li>
        <li>
          <code>packages/ui/README.md</code> — UI user and developer guide
        </li>
        <li>
          <code>packages/abl/README.md</code> — Address-Based Lists (SRFC-37)
          bindings
        </li>
        <li>
          <code>packages/token-acl/README.md</code> — Token ACL program bindings
        </li>
        <li>
          <code>packages/tlv-account-resolution/README.md</code> — TLV helpers
        </li>
      </ul>

      <h2>How the UI uses them</h2>
      <ul>
        <li>
          Mint creation and management: <code>@mosaic/sdk</code>
        </li>
        <li>
          Access lists (allow/block): <code>@mosaic/abl</code>
        </li>
        <li>
          Freeze/thaw and permissionless thaw: <code>@mosaic/token-acl</code>
          (Token ACL)
        </li>
        <li>
          RPC and types: <code>gill</code> and wallet adapters
        </li>
      </ul>

      <h2>External references</h2>
      <ul>
        <li>
          <a
            className="text-primary underline underline-offset-4"
            href="https://www.solana-program.com/docs/token-2022"
            target="_blank"
            rel="noreferrer"
          >
            Solana Token-2022 Overview
          </a>
        </li>
        <li>
          <a
            className="text-primary underline underline-offset-4"
            href="https://www.solana-program.com/docs/token-2022/extensions"
            target="_blank"
            rel="noreferrer"
          >
            Token-2022 Extensions Guide
          </a>
        </li>
      </ul>
    </div>
  );
}
