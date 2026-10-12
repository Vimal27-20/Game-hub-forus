# Contributing

Thanks for helping make HUDDLE better. This repo is **spec-driven**: we agree on *what* and *how* in writing before any code is written.

## Setup

```bash
git clone https://github.com/Vimal27-20/Game-hub-forus.git
cd Game-hub-forus
npm install        # Node 22+ (see .nvmrc)
npm run dev        # http://localhost:3000/tv and /play
```

## The workflow

1. **Issue.** Open a bug report or a feature/game request. Features get the `needs-spec` label.
2. **Spec.** Copy `specs/_template/` to `specs/NNN-name/`. Open a PR containing `requirements.md` first; once it's agreed, add `design.md` and `tasks.md`. Small PRs are fine. See [specs/README.md](specs/README.md).
3. **Code.** Implement the tasks in order on a branch named `feat/NNN-short-name` or `fix/short-name`. Tick off tasks in `tasks.md` as you go.
4. **Test.** Name tests after requirement IDs, for example `test('R2: …')`. Run `npm run check`.
5. **PR.** Fill in the PR template, including which spec and requirements the PR covers. CI must pass.

Bug fixes and refactors that don't change behaviour don't need a spec. Say so in the PR.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`. Mention the spec when there is one, for example `feat(tug): sudden-death round (spec 004 R2)`.

## Code rules (short version)

The full rules are in [CLAUDE.md](CLAUDE.md).

- Browser code is plain ES2019 with no build step. No `?.` or `??`, because older TVs can't run them.
- Game logic stays on the TV; the server is only a relay.
- Per-platform TV code goes in `public/platform.js` only.
- Escape user text with `esc()` before it goes into HTML.

## Releasing

1. Bump `version` in `package.json` and `versionCode`/`versionName` in `android/app/build.gradle`.
2. Move the `Unreleased` items in `CHANGELOG.md` under the new version.
3. Commit with `chore(release): vX.Y.Z`, then tag `vX.Y.Z` and push the tag.
4. The **Release** workflow builds the store bundles and attaches them to the GitHub release. It needs the repo variable `HUDDLE_SERVER_URL`.
5. Submit to each store following [platforms/README.md](platforms/README.md).
