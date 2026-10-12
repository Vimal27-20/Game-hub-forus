# Specs

HUDDLE is built spec-first. Every feature, game and platform change starts as a spec in this folder, gets reviewed, and only then gets code. The spec is the source of truth. When the code and the spec disagree, one of them is a bug.

## Layout

Each feature lives in its own numbered folder:

```
specs/
  _template/              copy this to start a new spec
  001-core-platform/      rooms, players, socket protocol (baseline)
  002-tv-store-apps/      webOS, Tizen, Android TV / Fire TV packaging
  NNN-short-name/
    requirements.md       WHAT and WHY: user stories + numbered acceptance criteria
    design.md             HOW: architecture, data, protocol, trade-offs
    tasks.md              the ordered checklist that implements the design
```

## Workflow

1. **Requirements.** Copy `_template/` to `specs/NNN-name/` using the next free number. Write user stories and acceptance criteria in EARS form, then open a PR with only `requirements.md` and set Status to `Draft`.
2. **Design.** Once the requirements are agreed, write `design.md`. Every requirement ID (R1, R2, …) must be addressed by something in the design.
3. **Tasks.** Break the design into small, ordered tasks in `tasks.md`. Each task names the requirement(s) it satisfies and how it is verified.
4. **Implement.** Work through the tasks in order and tick them off in the same PR as the code. Test names reference requirement IDs (for example `test('R3: …')`) so you can trace a requirement to the test that proves it.
5. **Done.** When every task is ticked and CI is green, set the spec Status to `Implemented`. Later behaviour changes update the spec in the same PR as the code.

## Writing acceptance criteria (EARS)

Each criterion uses one of these patterns, so it is testable and unambiguous:

| Pattern | Template |
|---|---|
| Always | THE SYSTEM SHALL … |
| Event | WHEN <trigger> THE SYSTEM SHALL … |
| State | WHILE <state> THE SYSTEM SHALL … |
| Unwanted | IF <condition> THEN THE SYSTEM SHALL … |
| Optional | WHERE <feature is enabled> THE SYSTEM SHALL … |

Number criteria within their requirement (for example R3.2) so tests and tasks can cite them.

## Status values

`Draft` → `Approved` → `In progress` → `Implemented` (→ `Superseded by NNN`)
