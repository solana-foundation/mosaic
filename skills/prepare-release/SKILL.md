---
name: prepare-release
description: Cut a release of the published mosaic packages - find the last version that actually reached npm, audit changeset coverage for everything merged since, author any missing changeset, run `changeset version`, check the invariants the publish workflow depends on, commit, and open the release pull request. Use when asked to prepare or cut a release, version the packages, bump versions, or publish a new version.
argument-hint: '[major | minor | patch | explicit version]'
---

# prepare-release

Prepare a release of `@solana/mosaic-sdk` and `@solana/mosaic-cli`, and open the pull request whose merge publishes them.

Requested release: `$ARGUMENTS` (a bump level or explicit version; if that placeholder arrives unsubstituted, or empty, derive the version from the pending changesets instead).

## Why this is delicate

`.github/workflows/publish-packages.yml` runs on every push to `main`. Its `detect` job counts `.changeset/*.md`, and the `publish-packages` job runs **only when that count is zero**. Emptying `.changeset/` is therefore not bookkeeping, it is the release trigger — **merging the pull request you are about to open is what publishes to npm.**

Two consequences shape everything below.

- A pull request that bumps versions but leaves a changeset behind publishes nothing, and the workflow run is still green, because a skipped job is a green job. This has already happened: `151cae6` bumped both packages to `0.2.1` and left `.changeset/make-published-cli-runnable.md` in the tree, so `0.2.1` never reached npm and nobody noticed until the next release.
- Anything else carrying a changeset that merges between this pull request opening and merging re-arms `detect`, suppresses the publish, and forces the bump to be regenerated.

Phases 1–6 run unattended. Phase 7 pushes and opens the pull request, and requires explicit confirmation first.

## What this skill will and will not do

It creates **one** commit, on a **freshly created** `release/*` branch. Invoking it is the authorization for that commit. It never amends, never commits on `main` or on any pre-existing branch, never force-pushes, and never pushes or opens a pull request without the Phase 7 confirmation. It never merges the pull request, and it never publishes to npm directly.

---

## Phase 1 — preflight

Abort with a single line naming the problem if any of this fails.

1. Run from the repository root. Working tree clean (`git status --porcelain` empty) and `HEAD` on the `baseBranch` from `.changeset/config.json` (`main`).
2. Resolve the remotes. Do not hardcode them:
    - **Base repo** — the value of `changelog[1].repo` in `.changeset/config.json` (currently `solana-foundation/mosaic`). The pull request targets this repo, and it is also the repo npm trusted publishing is keyed to. Find the matching git remote by URL; it may be named `upstream`.
    - **Push remote** — the remote you can push to. In a fork checkout that is `origin` (e.g. `eldarik/mosaic`); in a direct checkout it is the same remote as the base repo.
3. `git fetch --all --tags --prune`, then require local `main` to be **exactly** the base remote's tip: `git rev-parse HEAD` must equal `git rev-parse <base-remote>/main`. "Not behind" is not enough — if local `main` is ahead, the release branch would be cut from that local `HEAD` and carry unpublished local commits into the release pull request, and the ancestor check in guard 2 would still pass. Ahead or diverged is an abort, same as behind; tell the user to reset or move their local commits aside, never do it for them.
4. `gh auth status`, then `gh repo view <base-repo> --json viewerPermission`. `WRITE`/`ADMIN` means the branch can live in the base repo; anything less (`READ`, `TRIAGE`) means the pull request must be cross-repo from the fork, which is fine — opening a pull request from a fork needs no write access to the base.

Report which remote is which and whether the pull request will be cross-repo, so nothing downstream is a surprise.

## Phase 2 — find the release that actually shipped

`package.json` is not evidence that a version was published. Build and show this table before deciding anything:

| package              | `package.json` | latest git tag | npm `latest` |
| -------------------- | -------------- | -------------- | ------------ |
| `@solana/mosaic-sdk` |                |                |              |
| `@solana/mosaic-cli` |                |                |              |

Sources:

```bash
node -p "require('./packages/sdk/package.json').version"
node -p "require('./packages/cli/package.json').version"
git tag --list '@solana/mosaic-*@*' --sort=-v:refname | head
npm view @solana/mosaic-sdk version
npm view @solana/mosaic-cli version
```

Tags are created by the publish workflow (`createGithubReleases: true`), so **a version with no tag and no npm entry was never published**, however confidently `package.json` claims it.

**Each package has its own boundary.** `.changeset/config.json` has empty `fixed` and `linked` arrays, so the SDK and CLI are versioned independently and their published tags can diverge (an SDK-only release, or one package stranded and the other not). Never collapse them into one boundary: picking the newer package's tag silently drops the other package's unreleased commits from the audit. Record a boundary per package — its own last _published_ tag — and carry both into Phase 3.

Interpreting the table, per package:

- **All three agree** — the ordinary case. That package's boundary is that tag.
- **`package.json` is ahead of npm and the tag** — a previous bump never published. The boundary for the commit range is the last _published_ version's tag, not the last `chore(release): version packages` commit. Surface this and let the user choose:
    - **Re-publish the stranded version** — only valid when every pending changeset was already consumed into the stranded version's CHANGELOG section (it was left behind, not new) and nothing uncovered has merged since. This is the **deletion-only path**: the pull request removes the stranded changesets and changes nothing else. `changeset publish` then picks up the versions already in `package.json`. Do **not** run `pnpm version:packages` on this path — with the stranded changeset still pending it would consume it again and bump past the stranded version. Phases 4–7 each note what differs.
    - **Burn it and move on** — `changeset version` bumps from `package.json`, so a patch on top of an unpublished `0.2.1` produces `0.2.2` and `0.2.1` stays burned. Skipping a version is harmless. This is the normal path; the stranded changeset is consumed again, so check its note does not end up duplicated in the new CHANGELOG section.

Also locate the previous release commit for reference: `git log --oneline --grep='^chore(release)' -5`.

If `$ARGUMENTS` names an explicit version or bump level, reconcile it with what the changesets imply. **Never hand-edit a version in `package.json` to reach a target** — raise the bump level in a changeset's frontmatter instead and let `changeset version` compute it, otherwise the CHANGELOG heading and the package version drift apart.

## Phase 3 — audit changeset coverage

### 3a. What is pending

Mirror the workflow's own filter exactly, so your count and `detect`'s count can never disagree:

```bash
find .changeset -maxdepth 1 -name '*.md' ! -iname 'README.md'
```

Read each one: frontmatter tells you the bump per package, the body is the release note that will be copied verbatim into the CHANGELOGs.

### 3b. What merged since each boundary

Walk each package from its own boundary (Phase 2):

```bash
git log <sdk-boundary-tag>..HEAD --format='%h %s' --name-only -- packages/sdk/
git log <cli-boundary-tag>..HEAD --format='%h %s' --name-only -- packages/cli/
```

When the boundaries coincide the two ranges are the same; when they diverge, a commit can be relevant to one package and outside the other's range entirely.

Package directories are not the only inputs to what ships. The root `package.json`'s `pnpm.overrides` decide which Solana dependencies the packages are actually built and tested against, whatever their own manifests declare, and the lockfile and shared build config feed every package's build. Walk those once per package, each from that package's own boundary — never from the older of the two for both:

```bash
SHARED='package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json turbo.json'
git log <sdk-boundary-tag>..HEAD --format='%h %s' --name-only -- $SHARED
git log <cli-boundary-tag>..HEAD --format='%h %s' --name-only -- $SHARED
```

A hit counts only for the package whose range it appears in. When the boundaries diverge, a shared change between the older and newer tag already shipped in the newer package; walking both from the older tag would mark it `UNCOVERED` there and call for a duplicate changeset, an unnecessary bump, and a repeated release note.

For each hit, read the diff and decide, for the package whose range it is in, whether it changes that package's resolved dependencies or build output — an override bump, a lockfile change under a published package's dependency tree, a compiler option in `tsconfig.base.json`. If it does, it is release-relevant for that package even though no file under `packages/` changed. Lockfile churn confined to `apps/app/` or to dev-only tooling is not.

A commit is **release-relevant** for a package if it touches that package's directory, or one of the shared inputs above, in a way a consumer could observe. Ignore commits confined to:

- `apps/app/` — private, and listed in the changesets `ignore` array
- `.github/`, `scripts/`, lint/format/editor config (`eslint.config.js`, `.prettierrc.cjs`, `.prettierignore`, `.editorconfig`), `README`/docs, and test-only changes

### 3c. Map commits to changesets

A commit is covered for a package if it added one of the pending changeset files that names that package (directly, or the SDK via `updateInternalDependencies` for the CLI), or if such a changeset's body plainly describes its work. A commit needs coverage only for the packages whose 3b range contains it. Print the mapping as a short table — package, commit, subject, covering changeset or `UNCOVERED`.

On the deletion-only path (Phase 2) any `UNCOVERED` row, or any pending changeset not already in the stranded CHANGELOG section, means that path is not available — fall back to burning the version.

### 3d. Write the missing changesets

For each uncovered release-relevant commit, read its diff and write `.changeset/<kebab-slug>.md`.

Follow the repo's conventions, which differ from the changesets defaults:

- **Filename** — a hand-written descriptive slug (`make-published-cli-runnable.md`, `hoo-904-confidential-policy-and-das-gate.md`, `token-2022-0-18-kit-v8.md`), not the auto-generated `olive-donkeys-shave` style.
- **Frontmatter** — single-quoted package names.
- **Body** — long-form release notes, not a one-liner. A summary sentence, then `##` sections (`## Dependencies`, `## Breaking changes`, `**New — …**`) as the size of the change warrants, markdown tables for version matrices, backticked API names, and links to the originating pull requests. Assume this text is what a consumer reads when deciding whether to upgrade.

```markdown
---
'@solana/mosaic-sdk': patch
'@solana/mosaic-cli': patch
---

Fix the published CLI failing to run under Node ESM: resolve `@solana/zk-sdk`'s wasm import via a bin-level resolve hook, …
```

Bump levels:

- **major** — a breaking change to a public export, an exported type, or CLI behaviour a script could depend on
- **minor** — new exports, new commands, new optional behaviour
- **patch** — fixes and internals

List `@solana/mosaic-cli` explicitly only when the CLI itself changed. `updateInternalDependencies: "patch"` already carries an SDK bump into the CLI through the `workspace:*` dependency, and it writes the `Updated dependencies` block in `packages/cli/CHANGELOG.md` for you.

### 3e. Warn about changesets in open pull requests

What can still land on `main` is an open pull request, so inspect the **current tip** of each one — not ref history, which also reports changesets that were later consumed or deleted and says nothing about which branch holds them or at what bump level.

```bash
gh pr list --repo <base-repo> --base main --state open --limit 200 \
  --json number,title,headRefName,files \
  --jq '.[] | {number, title, headRefName, changesets: [.files[].path | select(test("^\\.changeset/[^/]+\\.md$")) | select(test("(?i)/readme\\.md$") | not)]} | select(.changesets | length > 0)'
```

`files` lists paths the pull request touches, which includes deletions. For each hit, read the file at the pull request's tip to confirm it still exists there and to get its frontmatter:

```bash
git fetch <base-remote> pull/<n>/head
git show FETCH_HEAD:.changeset/<file>.md    # missing here = the PR deletes it; ignore
```

Report pull request number, title, changeset file, and the bump level per package.

Open pull requests carrying changesets change what the next version ought to be, and merging one of them after this pull request opens will suppress the publish. Name them and their bump levels so the version choice is deliberate — for example an unmerged branch holding two `major` entries means the next release is very likely a major, and cutting a patch now is probably wrong.

## Phase 4 — version

```bash
git switch -c release/next
pnpm version:packages                     # changeset version
node -p "require('./packages/sdk/package.json').version"   # the new version
git branch -m release/<version>
pnpm format                               # CI runs format:check; changesets output is not prettier-clean
```

Then check `git status`. Expect four files — both `package.json`s and both `CHANGELOG.md`s — plus the deletion of every consumed changeset. `pnpm-lock.yaml` normally does **not** change, because workspace dependencies resolve as links; include it only if it actually did.

Read the two CHANGELOG diffs before continuing. Two quirks of `@changesets/changelog-github` are expected and are left as generated:

- Entries are attributed to the commit that _added the changeset_, not to the pull requests the note describes, and the `[#PR]` prefix is absent entirely when that commit had no associated pull request.
- A changeset naming both packages has its full body duplicated verbatim into both CHANGELOGs.

### Deletion-only path (re-publishing a stranded version)

Skip `pnpm version:packages` entirely — it would consume the stranded changeset a second time and bump past the version you mean to publish:

```bash
node -p "require('./packages/sdk/package.json').version"   # the stranded version
git switch -c release/<stranded-version>
git rm .changeset/<each stranded changeset>.md
```

Then `git status` must show only those deletions. No `package.json`, `CHANGELOG.md` or lockfile changes.

## Phase 5 — guards

These exist because each one has failed in practice. Stop on any failure; do not "fix it in the pull request".

1. **`.changeset/` is empty of `*.md`, and the deletions are staged.** Re-run the `find` from 3a — it must return nothing — and confirm `git diff --cached --name-status` (after `git add -A`) shows a `D` line for every consumed file. A deletion that exists in the working tree but not in the commit is exactly how `0.2.1` was lost.
2. **The branch sits on the tip of the base branch.** `git fetch <base-remote> && git merge-base --is-ancestor <base-remote>/main HEAD`. A stale base is the root cause of the `0.2.1` miss: the branch commit deleted the changeset, the base had re-added it, and the squash-merge carried the base's copy back onto `main`. Rebase rather than merge. If the release genuinely must be stacked on an unmerged branch, open the pull request as a **draft** and rebase onto `main` before it is marked ready.
3. **Versions and CHANGELOGs agree.** Every published package's version changed, and each CHANGELOG gained a top section whose heading matches its new version exactly. On the deletion-only path the check inverts: no version changed, no CHANGELOG changed, and each CHANGELOG's existing top heading already equals its `package.json` version — otherwise the stranded bump was incomplete and this path cannot fix it.
4. **`scripts/check-release-consistency.sh`** — run it if it exists; it encodes guard 1 as a CI job. Its absence means it has not landed yet, not that something is wrong.
5. **The base branch is green.** `gh run list --repo <base-repo> --branch main --workflow ci.yml --limit 1`. The publish job re-runs `pnpm check`, `pnpm test:unit` and `scripts/cli-package-smoke.sh` _after_ the merge, so a red base means a failed publish with the release commit already on `main`. Optionally run `pnpm check && pnpm test:unit` locally to be sure.

## Phase 6 — commit

```bash
git add -A                                # stages the changeset deletions too
git status --short                        # every consumed changeset shows as D
git commit -F <message-file>
```

`git add -A` is not incidental. Guard 1 checks the staged deletions for a reason: a consumed changeset that is deleted in the working tree but absent from the commit is exactly how `0.2.1` was lost.

Message:

```
chore(release): version packages for <version>
```

Body: the changesets consumed, and one `package  old → new` line each. No trailers.

On the deletion-only path the title is `chore(release): publish stranded <version>` and the body names the removed changesets and why they were stranded. Use the same title for the pull request in Phase 7, and replace the body's opening paragraph with one saying it only removes changesets already consumed into `<version>`, with no version or CHANGELOG changes.

## Phase 7 — preview, confirm, then push and open the pull request

Show, in one message: the full `git diff` of the commit, the pull request title, and the complete pull request body. Ask once for confirmation. Do not push anything before the answer.

On approval:

```bash
git push -u <push-remote> release/<version>
gh pr create --repo <base-repo> --base main \
  --head <fork-owner>:release/<version> \
  --title "chore(release): version packages for <version>" \
  --body-file <file>
```

Drop `<fork-owner>:` when the branch is in the base repo. Pass `--draft` when guard 2 flagged a stale or stacked base. Write the body to a file rather than passing it inline, so backticks and newlines survive.

If `gh pr create` fails — no permission, no `gh`, network — do not treat it as fatal. Print the compare URL and the path to the body file so the pull request can be opened by hand:

```
https://github.com/<base-repo>/compare/main...<fork-owner>:release/<version>?expand=1
```

### Pull request body

```markdown
Consumes `<changeset files>` and bumps `@solana/mosaic-sdk` <old> → <new> and `@solana/mosaic-cli` <old> → <new>, writing both CHANGELOGs. Generated by `pnpm version:packages`, no hand edits. `pnpm-lock.yaml` is untouched — workspace deps resolve as links, so a version bump produces no lockfile churn.

## Merging this is what publishes

`.changeset/` being empty is what `publish-packages.yml` treats as the release signal. The `detect` job counts `.changeset/*.md`; this pull request takes that count to zero, so merging it runs the publish job.

## Before merging

- [ ] This branch is rebased onto the tip of `main`. A stale base lets the squash-merge restore a consumed changeset, which silently suppresses the publish.
- [ ] Nothing else carrying a changeset merges in between. A pending entry makes `detect` skip publish entirely, and this bump would need regenerating.
- [ ] npm trusted publishing is configured for **both** packages → repo `<base-repo>`, workflow `.github/workflows/publish-packages.yml`, no environment. Trusted publishing keys on repository + workflow path, so renaming that file invalidates it.

## Note on the generated CHANGELOGs

<only when it applies — attribution to the changeset-adding commit rather than the described pull requests, and the SDK body duplicated verbatim into the CLI changelog. Both cosmetic, left as generated.>

## After merging

- [ ] `Version & Publish Packages` ran on the merge commit, and `publish-packages` **actually executed** — a skipped job is a green job, so check the job, not the run.
- [ ] Tags `@solana/mosaic-sdk@<new>` and `@solana/mosaic-cli@<new>` exist.
- [ ] `npm view @solana/mosaic-sdk version` and `npm view @solana/mosaic-cli version` report `<new>`.
```

Omit sections that do not apply. Keep whatever attribution line the tool you are running requires; the template deliberately carries none.

## Phase 8 — report

The pull request URL, the versions, the changesets consumed, and the after-merge checks that are still outstanding. Nothing else.
