[🇧🇷 Português](CONTRIBUTING.md) · 🇺🇸 English

# Contributing to Faz AI

## Commands

```sh
npm install
npm run build
npm test
npm run typecheck
npm run validate
```

`npm run build` generates `dist/`. `npm test` also runs the linter and checks formatting;
`npm run format` formats everything. To make `git blame` skip the formatting-only commit:
`git config blame.ignoreRevsFile .git-blame-ignore-revs`. `npm run typecheck` checks the types.
`npm run validate` is the check before finishing a story or opening the PR: typecheck, eslint and
prettier on the files changed against `origin/develop`, `vitest related` and the end-to-end card
scenarios in `test/scenarios/`.

Press `F5` to open the Extension Development Host. The code is in `src/extension` (host and MCP
server), `src/webview` (React interface), `src/shared` (model, protocol and the board rules used by
both host and interface), `src/mcp-bridge` (the stdio bridge used by AI clients) and `src/cli` (the
board outside the editor).

To try the interface without the editor, `node dist/cli.js <folder> --data <test data folder>`
serves the board in the browser. The tests cover the extension's activation (with a fake editor in
`test/fakes/vscode.ts`) and the page server (`test/webServer.test.ts`).

`npm run test:cli-real` separately checks the provider contract with **installed Claude Code**, using
temporary project/configuration directories and local test API and MCP servers. It requires no login
and calls no remote model; the API controls responses so forbidden attempts do not depend on model
behavior. Positive controls load project, user, ancestor and additional-directory sentinels, plus a
skill, agent, hook and external MCP; the strict path must exclude them. The test also reproduces the
inherited additional-memory regression. A missing CLI or Windows platform fails explicitly. The seven
tests use the real gateway and measured transport with disposable on-disk SQLite; they also check
cancellation, forced termination, failure before release, no retry and private file cleanup. They do
not enable a production profile: managed policies, the real authentication/API environment,
Cursor/Kimi and accepted-task consumption still need validation.

## Workflow

New features are integrated into `develop`. Each change is a story on Faz AI's own board: the card
takes the story through the phases, and each story becomes one pull request to `develop`. Work still
in progress stays on its branches and cards. Integrating into `develop` does not publish the
extension. `main` only accepts changes through pull requests, and the release script already deals
with that.

## Changelog

The changelog follows Keep a Changelog, with one section per version and the **Added**, **Changed**,
**Removed** and **Fixed** headings. The top section is the next version (the one in `package.json`)
and includes only changes already integrated into `develop`.

## Release

With gitflow, the release starts from the branch you are on:

- on `develop`: `npm run release -- X.Y.Z` (the `package.json` version, which is the changelog's
  top section) requires an up-to-date, clean `develop`, runs the tests, creates the
  `release/vX.Y.Z` branch, commits and packages; `patch|minor|major` still work and rename an
  "Unreleased" section, if there is one;
- on a `hotfix/...`: the version commit goes on the fix's own branch, and its PR, if already open,
  is reused;
- on any other branch the script refuses and says where to run it from (the `--allow-branch`
  option no longer exists).

It then publishes to both stores, pushes the branch and opens the PR to main, which goes in with a
**merge commit** (never squash, so the stories' merge commit stays in the tag); the branch is not
deleted by that merge. The tag and the GitHub Release with the `.vsix` are created on `origin/main`,
without switching your folder's branch. Finally main goes back to `develop` through a PR, also with
a merge commit. If anything stops after publishing, `npm run release -- finish` picks up where it
left off: each step checks whether it was already done (PR, tag, release, main contained in
`develop`, branches) and does not publish again. If the way back to `develop` conflicts, resolve it
in the open PR and run `finish`. `--dry-run` rehearses without publishing. The options are at the
top of `scripts/release.mjs`.

For a hotfix (a Bug card, `hotfix/...` branch), run `npm run release` in the `hotfix/` worktree
**before** approving the card. Approved first, the PR goes into main without a version and the fix
only ships in the next release from `develop`.

Between packaging and publishing, the release opens the `.vsix` and checks the four showcase files
(`README.md`, `README_EN.md`, `CHANGELOG.md`, `CHANGELOG_EN.md`): the changelog needs the version
being released as its top heading, with no leftover "Não lançado"/"Unreleased" anywhere, and the
README needs the alpha-notice and thank-you blocks. If anything fails, the release refuses before
publishing to any store. If a "Não lançado"/"Unreleased" section still exists, the release renames it
to the version in every mode, including `--dry-run`; when the release doesn't get to commit (dry-run
or `--no-git`), the renamed CHANGELOGs are restored to their original content at the end.
`--allow-no-notes` is only required when that section is missing **and** the CHANGELOG's first
section isn't the version being released.

Two things to watch for:

- if you rewrite the text of a README notice block, update the `SHOWCASE` table in
  `scripts/releaseCheck.mjs` with the new text; otherwise the release refuses to publish a correct
  README, by design (false positive).
- a Ctrl+C in the middle of a release can leave the CHANGELOGs with the renamed heading on disk;
  undo with `git checkout CHANGELOG.md CHANGELOG_EN.md`.

## End-to-end tests

The e2e tests start a Docker container with a clean Ubuntu 24.04 to see the environment check and
each item's installation as on a new machine. They need Docker without `sudo`; sign-ins are yours,
done by you.

### Cursor

`npm run e2e:cursor` opens Cursor inside the container: no Node, git, gh, uv, Code Review Graph or
Cursor CLI. It is the computer's own Cursor, mounted read-only and without any of your settings (on
macOS, a Cursor downloaded into the image), and it comes with the extension packaged from the current
branch, in the `meu-app` test project. Links (sign-in, **Learn more**) open in the computer's
browser. Inside it, the `dev` user has passwordless `sudo`.

| Command                           | What it does                                                                |
| --------------------------------- | --------------------------------------------------------------------------- |
| `npm run e2e:cursor`              | from scratch: a new container, with the extension from the current branch   |
| `npm run e2e:cursor -- continuar` | the same container (sign-ins and installs stay), with the updated extension |
| `npm run e2e:cursor -- parar`     | closes Cursor and stops the container                                       |
| `npm run e2e:cursor -- remover`   | deletes the container, the image and the cache (`~/.cache/faz-ai-e2e`)      |

There are two modes, picked on their own:

- **Linux with a Wayland session and Cursor in `/usr/share/cursor`** (`.deb` package): the container
  uses the computer's Cursor, and the window opens on your screen.
- **macOS, or Linux without Wayland:** the image downloads Cursor for Linux from the official site (in
  the computer's architecture, ARM64 on an Apple Silicon Mac), and its screen opens in a browser tab,
  at `http://localhost:6080`, through noVNC. The first start downloads Cursor and takes a few minutes.
  The machine has the `python3` noVNC uses, like a freshly installed Ubuntu desktop.
  `FAZAI_E2E_MODO=novnc` forces this mode on a Linux with Wayland.

The files are in `scripts/e2e-cursor/`.

### Kimi Code

`npm run e2e:kimi` starts the container (no git, gh, uv, Code Review Graph or `kimi` CLI; only the
Node that runs the board and `socat`) and opens the Faz AI board of the current branch in it, through
`src/cli` (there is no editor in the container), on the `meu-app` test project. The Kimi Code CLI is
not in the image: you install it inside the container and run `kimi login`, following the
[script](scripts/e2e-kimi/ROTEIRO.md). Links (sign-in) open in your computer's browser. Inside, the
`dev` user has passwordless `sudo`. The result of the script is kept in `docs/decisoes/`.

| Command                         | What it does                                                           |
| ------------------------------- | ---------------------------------------------------------------------- |
| `npm run e2e:kimi`              | from scratch: a new container, with the board from the current branch  |
| `npm run e2e:kimi -- continuar` | the same container (sign-in and installs stay), with the updated board |
| `npm run e2e:kimi -- parar`     | stops the container                                                    |
| `npm run e2e:kimi -- remover`   | deletes the container and the image                                    |

The board opens at `http://localhost:7878` (`FAZAI_E2E_PORTA` changes the port, published only on
`127.0.0.1`). Needs a Kimi Code account for the sign-in.

## Setting up the environment

The repository has all the code, but a few items live outside git. On a fresh clone (another
machine, for example), they must be set up again:

| Item                                          | What it is for                                         | How to get it                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Node.js 22+ and git                           | build, tests and the `faz-ai` command                  | regular install                                                                                                         |
| `.mcp.json` and `.claude/settings.local.json` | connect the AI to the board; hold machine paths        | the board no longer creates them (only Cursor's `.cursor/mcp.json`); an old one only goes away if you remove it by hand |
| Board and attachments                         | live in the extension's storage, not in the repository | the folder's board starts empty on the other machine                                                                    |
| `.env.release` with `OVSX_PAT`                | publishing to Open VSX                                 | token at https://open-vsx.org/user-settings/tokens                                                                      |
| Azure CLI login                               | publishing to the VS Code Marketplace                  | `az login --allow-no-subscriptions`, with the account that owns the publisher                                           |
| Authenticated `gh`                            | creating the GitHub Release                            | `gh auth login`                                                                                                         |
| `.claude/skills/publicar-extensao/`           | the publishing walkthrough for the AI                  | copy the folder from the original machine                                                                               |

The last four are only needed to publish.
