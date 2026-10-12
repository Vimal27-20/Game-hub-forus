# Security policy

## Reporting a vulnerability

Please **don't** open a public issue. Use [GitHub private vulnerability reporting](https://github.com/Vimal27-20/Game-hub-forus/security/advisories/new) instead. You'll get a reply within 7 days.

## Scope and threat model

- **Phones are untrusted.** The server validates every socket payload. A player can't send host messages, kick players, or take over a room without its `hostKey`.
- **Player text is untrusted.** Names, guesses and clues are escaped with `esc()` before they are rendered on the TV.
- **Rejoin keys** (`key`, `hostKey`) are random 72-bit tokens. They are never broadcast to other players.
- **No accounts and no persistent personal data.** Rooms live in memory and disappear when they close.
- **CORS** is open by default (`ALLOWED_ORIGINS=*`) because nothing uses cookies or credentials. Production hosts can restrict it.

## Supported versions

Only the latest release receives security fixes.
