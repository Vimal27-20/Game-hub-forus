# NNN — Feature name: Design

- **Status:** Draft
- **Requirements:** [requirements.md](requirements.md)

## Overview

One paragraph: the approach, and why it was chosen over the alternatives.

## Architecture

Which components change (server, TV host, phone controller, a game, the build or a platform package) and how data flows between them. Add a diagram if it helps.

## Interfaces

New or changed socket events, `{ui:…}` messages, HTTP endpoints, config or env vars. Give exact names and payload shapes. These are contracts, and the tests assert them.

## Requirement coverage

| Requirement | Covered by |
|---|---|
| R1 | … |

## Error handling and edge cases

Disconnects, reconnects, late joiners, players over the game's max, invalid input.

## Alternatives considered

- **Option** — why it was rejected.

## Risks

- Risk and how it is mitigated.
