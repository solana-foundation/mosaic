# skills

Repeatable, multi-step repo procedures written out as agent-readable instructions — one directory per skill, each with a `SKILL.md`.

These files are deliberately agent-agnostic: plain markdown with YAML frontmatter, readable by any coding agent (or by a human following along). The only vendor-specific touches are in the frontmatter — an `argument-hint` key, and a `$ARGUMENTS` placeholder that Claude Code substitutes and other readers can treat as prose.

| skill                                         | what it does                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`prepare-release`](prepare-release/SKILL.md) | Cuts a release: audits changeset coverage since the last version that actually reached npm, runs `changeset version`, checks the invariants `publish-packages.yml` depends on, and opens the release pull request.       |
| [`ui-verify`](ui-verify/SKILL.md)             | Drives the dashboard in a headless browser with [agent-browser](https://agent-browser.dev) and an injected devnet test wallet, to verify a UI change end to end or run the smoke flows in `apps/app/e2e/agent-browser/`. |

## Registering these with your agent

Some agents only discover skills under their own config directory. Link, don't copy, so the files here stay the single source of truth:

```bash
# Claude Code
mkdir -p .claude/skills
ln -s ../../skills/prepare-release .claude/skills/prepare-release
ln -s ../../skills/ui-verify .claude/skills/ui-verify
```

`.claude/skills/` is gitignored, so this stays local to your checkout and never lands in a pull request. Re-run it in each new worktree. (The rest of `.claude/` is deliberately still trackable, so shared project config can be checked in later if the repo ever wants it.)
