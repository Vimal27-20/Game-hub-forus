# 001 — Core platform: Requirements

- **Status:** Implemented
- **Owner:** @Vimal27-20
- **Note:** This is the baseline spec. It records how the hub already behaves, so later changes have a contract to diff against.

## Problem

A group in one room wants to play party games on the TV without anyone installing an app. The TV must host the game, and every phone must work as a controller after scanning a QR code.

## Goals

- A phone goes from scanning the QR code to sitting in the lobby in under 10 seconds.
- A phone that locks or refreshes rejoins its own seat without any user action.
- Adding a new game takes one file and no server changes.

## Non-goals

- Accounts, profiles or persistent leaderboards. Trophies last for one session only.
- Running game logic on the server. The server only relays messages (see design).
- Rooms with more than 12 players.

## Requirements

### R1 — Hub server endpoints

**User story:** As a TV or phone, I want stable HTTP endpoints, so that I can find the join URL and render the QR code.

1. THE SYSTEM SHALL serve the TV page at `/tv`, the controller page at `/play` and a chooser page at `/`.
2. WHEN `/api/info` is requested THE SYSTEM SHALL return `{ base }`, using `PUBLIC_URL` if set, otherwise the request host, and replacing `localhost` with the machine's LAN IP.
3. WHEN `/api/qr?u=<url>` is requested THE SYSTEM SHALL return an SVG QR code for the first 300 characters of `u`.
4. THE SYSTEM SHALL answer `/healthz` with `{ ok: true }` for host health checks.
5. THE SYSTEM SHALL allow cross-origin requests to `/api/*` and the socket from the origins in `ALLOWED_ORIGINS` (default `*`), so packaged TV apps can connect.

### R2 — Room creation

**User story:** As the TV, I want a short room code, so that players can type it if they can't scan.

1. WHEN a host emits `host:create` THE SYSTEM SHALL create a room with a unique 4-letter code that excludes `I` and `O`, and return `{ code, hostKey, players }`.

### R3 — Joining

**User story:** As a player, I want to join with a name and room code, so that I appear on the TV.

1. WHEN a phone emits `player:join` with a valid code and name THE SYSTEM SHALL add the player, return `{ ok, id, key, name, char, hostOnline }`, and notify the host with `player:join` and an updated `players` list.
2. THE SYSTEM SHALL trim names, strip `<` and `>`, and cap them at 14 characters.
3. IF the room does not exist or the name is empty THEN THE SYSTEM SHALL return `{ error }` with a human-readable message.
4. IF the room already has 12 players THEN THE SYSTEM SHALL reject the join with a "room is full" error.
5. THE SYSTEM SHALL make the first connected player the VIP (👑), and SHALL pass VIP to the next connected player when the VIP disconnects.
6. THE SYSTEM SHALL never broadcast a player's secret rejoin `key`.

### R4 — Characters

1. WHEN a player picks a character THE SYSTEM SHALL reserve it, and IF another player already holds it THEN THE SYSTEM SHALL return an error.

### R5 — Message relay

1. WHEN a player emits `in` THE SYSTEM SHALL forward `{ id, d }` to the room's host only.
2. WHEN the host emits `host:send` THE SYSTEM SHALL deliver `msg` to the named player, or to every player when `to` is `'all'`.
3. IF a non-host socket emits `host:send` or `host:kick` THEN THE SYSTEM SHALL ignore it.

### R6 — Phone reconnect

1. WHEN a phone rejoins with its `key` THE SYSTEM SHALL restore the same seat (id, name, character).
2. IF a disconnected phone does not return within 15 minutes THEN THE SYSTEM SHALL free its seat. (Raised from 3 minutes by spec 003 R2.4.)
3. WHEN the same key connects from a second device THE SYSTEM SHALL kick the older socket.

### R7 — TV reconnect

1. WHEN the TV disconnects THE SYSTEM SHALL tell the phones `host:gone` and keep the room for 10 minutes.
2. WHEN the TV reconnects with the matching `code` and `hostKey` THE SYSTEM SHALL restore the room and tell the phones `host:back`.
3. IF the `hostKey` does not match THEN THE SYSTEM SHALL create a new room instead of handing over the existing one.
4. IF the TV does not return within 10 minutes THEN THE SYSTEM SHALL emit `room:closed` and delete the room.

### R8 — Game plug-in contract

**User story:** As a game author, I want to add a game as one file, so that the hub, lobby and results work automatically.

1. THE SYSTEM SHALL load each game from `public/games/<id>.js` through `Hub.register(def)`, using the contract in [design.md](design.md#game-plug-in-contract).
2. WHEN a game calls `ctx.end(results)` THE SYSTEM SHALL rank the players, award a session trophy to each winner with a positive score, show the podium, and send each phone its result.
