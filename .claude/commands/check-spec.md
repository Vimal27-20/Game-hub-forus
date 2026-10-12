---
description: Audit that code, tests and specs agree
---

Audit the repo for spec drift:

1. For every `specs/*/requirements.md`, list each requirement ID and find the test (by `R<n>` in the test name) or the manual check in `tasks.md` that covers it.
2. Compare the socket events and `{ui:…}` messages in `server/app.js`, `public/tv.js`, `public/play.js` and `public/games/*.js` with the protocol tables in `specs/001-core-platform/design.md`.
3. Check that the env vars, npm scripts and file paths mentioned in specs, README and CLAUDE.md exist.
4. Report the gaps as a table (item, where, suggested fix). Don't change files unless I ask.
