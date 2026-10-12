---
description: Implement the next unchecked task(s) of an approved spec
argument-hint: <spec folder, e.g. 003-new-game> [task number]
---

Implement spec `specs/$ARGUMENTS`.

1. Read `requirements.md`, `design.md` and `tasks.md` in that folder, plus `CLAUDE.md`.
2. If `design.md` or `tasks.md` is missing, write it first (design must cover every requirement ID), show me, and stop.
3. Otherwise take the next unchecked task (or the task number given). Implement it following the CLAUDE.md rules. Add or extend tests named after the requirement IDs.
4. Run `npm run check`. Fix any failure before moving on.
5. Tick the task in `tasks.md`. Update the spec, README or CHANGELOG if behaviour, protocol, env vars or paths changed.
6. Report what changed, which requirement IDs are now covered, and the test results. Don't commit unless I ask.
