---
description: Start a new spec (requirements first) for a feature, game or platform
argument-hint: <short feature description>
---

Start a new spec for: $ARGUMENTS

1. Read `specs/README.md`, `CLAUDE.md` and any existing spec this touches (`specs/*/requirements.md`).
2. Pick the next free number and a short kebab-case name, then copy `specs/_template/` to `specs/NNN-name/`.
3. Fill in **only `requirements.md`**: problem, goals, non-goals, and numbered requirements with EARS acceptance criteria (WHEN/IF/WHILE … THE SYSTEM SHALL …). Each criterion must be testable.
4. List any open questions at the bottom, and set Status to `Draft`.
5. Stop and show me the requirements. Don't write `design.md`, `tasks.md` or code until I approve.
