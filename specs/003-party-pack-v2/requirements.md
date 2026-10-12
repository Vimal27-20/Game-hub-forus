# 003 — Party Pack v2: Requirements

- **Status:** Implemented (approved 2026-10-12: all six games, Back opens a pause menu)
- **Owner:** @Vimal27-20
- **Related:** [001-core-platform](../001-core-platform/requirements.md). Delivery is the live website (TV browser at `/tv`); the store apps in spec 002 are parked.

## Problem

HUDDLE is played on the live site with the TV's web browser. Today:

- **Back doesn't work on the TV.** In a TV browser, the remote's Back button navigates the browser away from the page instead of leaving the game.
- **A dropped phone can't really come back.** A player whose phone locks or refreshes reconnects to the room, but no game restores them. Bumper Brawl eliminates them for good.
- **There are no menus or settings.** There's no way to change game length, rounds or difficulty, and the join link is long to type.
- **Results feel slow and thin.** There's a fixed 3–4 s wait between rounds, no running scoreboard, and no overall standings across games.
- **Games repeat quickly.** There are only 45 quiz questions, 65 drawing words and 7 Undercover categories, and each physics game plays identically every round.
- **There are only five games.**

## Goals

- Back on any TV remote pauses or exits a game, and never leaves the site by accident.
- A player who drops comes back into the same game with the same score, mid-round.
- A game night of about 2 hours plays without seeing the same question, word or arena twice.
- Eleven games, each with its own settings and tuned feel.

## Non-goals

- Accounts or saved history across nights. Session standings reset when the TV page is closed.
- Resuming a game after the **TV** page itself reloads. The room and players survive, but the game in progress restarts from the lobby. Rebuilding mid-game TV state isn't worth the complexity.
- Online matchmaking between different households.
- Store apps (spec 002).

## Requirements

### R1 — Back and pause on the TV

**User story:** As the person holding the TV remote, I want Back to get me out of a game, so that I never get stuck or kicked out of the site.

1. WHILE the TV page is open THE SYSTEM SHALL keep a browser-history entry, so that the remote's Back (and the browser's back) is caught by the page and does not leave the site.
2. WHEN Back is pressed during a game THE SYSTEM SHALL pause the game, freezing timers and physics, and show a pause menu with **Resume**, **Restart game**, **Settings** and **Quit to menu**, with Resume focused.
3. WHEN Back is pressed while the pause menu is open THE SYSTEM SHALL quit to the main menu. Back then Back always exits a game.
4. WHILE paused THE SYSTEM SHALL show "Paused" on every phone, and the 👑 player SHALL be able to resume or quit from their phone.
5. WHEN Back is pressed on the results screen THE SYSTEM SHALL go to the main menu. WHEN Back is pressed in the main menu THE SYSTEM SHALL do nothing.

### R2 — Resume after re-entry

**User story:** As a player whose phone locked or whose browser closed, I want to open the link again and be back in the game, so that I don't lose my place or points.

1. WHEN a phone reopens the site in the same browser while its room still exists THE SYSTEM SHALL rejoin the same seat automatically, with no name or code entry needed.
2. WHEN a player rejoins during a game THE SYSTEM SHALL restore them into the running game with their score, character and the current controller screen within 2 seconds.
3. IF a player disconnects during a game THEN THE SYSTEM SHALL keep their score and slot. Physics games SHALL bring them back at the next round start, or immediately if the round allows it. Turn-based games SHALL skip their turn rather than stall.
4. THE SYSTEM SHALL keep a disconnected player's seat for 15 minutes (up from 3).
5. WHEN the TV page reloads THE SYSTEM SHALL restore the room, players, session standings and settings, and return to the main menu.

### R3 — Easy links and menus

**User story:** As a host, I want simple links and clear menus, so that anyone can get started without help.

1. THE SYSTEM SHALL accept a short join link `<site>/<ROOMCODE>`, for example `huddle-hub-btwi.onrender.com/ABCD`. It SHALL open the phone controller with the code filled in, and the TV SHALL show this short link.
2. THE SYSTEM SHALL make `<site>/` a simple chooser with two large options: **Start on this TV** and **Join with my phone**.
3. The TV main menu SHALL have sections **Games**, **Settings** and **How to play**, all usable with only the remote's arrows, OK and Back.
4. The games list SHALL be grouped by type (Action, Brains, Social, Creative), with each game showing its player count, length and controls.
5. The 👑 phone SHALL mirror the menu, letting the VIP pick a game, change settings, and pause, resume or quit.

### R4 — Settings

**User story:** As a host, I want to tune game length and difficulty, so that games fit our group.

1. THE SYSTEM SHALL offer room settings: **Game length** (Quick / Standard / Long), **Difficulty** (Chill / Normal / Wild), **Sound** (on/off and volume) and **Phone vibration** (on/off).
2. Each game SHALL declare its own settings (for example rounds, timer, arena size or physics variant), with defaults derived from the room's game length and difficulty.
3. WHEN a game is started THE SYSTEM SHALL show its active settings on the TV for 3 seconds before the countdown.
4. THE SYSTEM SHALL remember settings on the TV across page reloads.

### R5 — Fast, rich results

**User story:** As a player, I want to see scores change as they happen and get to the next game fast, so that the energy never drops.

1. THE SYSTEM SHALL show a live score strip on the TV during every game, and score changes SHALL animate within 300 ms of the event.
2. WHEN a round ends THE SYSTEM SHALL show a round scoreboard with points gained this round. The 👑 player or the TV remote SHALL be able to skip it with OK, otherwise it closes after at most 4 seconds.
3. WHEN a game ends THE SYSTEM SHALL show the final results within 1 second, including a podium, every player's score, and at least one fun award (for example "Most knockouts" or "Fastest answer").
4. WHEN a game ends THE SYSTEM SHALL update **session standings**: overall points across all games tonight, shown in the main menu and on the results screen.
5. WHEN results are shown THE SYSTEM SHALL send each phone its rank, score and award at the same moment.
6. Results SHALL offer **Play again**, **Next game** (suggests a game not yet played tonight) and **Menu**.

### R6 — Always fresh

**User story:** As a regular player, I want every game to feel different each time, so that game night doesn't get repetitive.

1. THE SYSTEM SHALL not repeat a quiz question, drawing word, secret word, prompt or estimation question within a session until its bank is exhausted. The used-content memory SHALL survive TV page reloads.
2. Content banks SHALL have at least: quiz 150 questions in 6+ categories; drawing 200 words; Undercover 15 categories of 8 words each; every new content game 60 prompts.
3. Each physics game SHALL pick a different arena, layout or modifier each round from a pool of at least 4, and SHALL not repeat the previous round's choice.
4. Quiz Clash SHALL mix in at least 2 question styles beyond plain 4-choice (for example true/false and "closest number wins").

### R7 — New games

**User story:** As a group, we want more and different kinds of games.

1. THE SYSTEM SHALL add the new games listed in [§ New game list](#new-game-list), each using the game plug-in contract (spec 001 R8) plus the settings (R4), pause (R1) and rejoin (R2) hooks.
2. Each new game SHALL be playable from 2 players unless noted, and SHALL finish in 2–6 minutes on Standard length.
3. Each new game SHALL use a distinct mechanic. No two games in the hub SHALL share the same core loop.

### R8 — Game feel and physics

**User story:** As a player, I want physics games to feel smooth and fair on any TV.

1. Physics games SHALL simulate with a fixed time step of 1/120 s, independent of the TV's frame rate, so that behaviour is identical on 30, 60 or 120 Hz screens.
2. Each physics game SHALL document its tuning constants (speed, friction, mass, restitution) in one block, with Difficulty applying documented multipliers.
3. Phone input SHALL be smoothed on the TV so that network jitter doesn't cause jerky movement. The added latency SHALL stay below 50 ms.
4. A round SHALL never start with players overlapping or touching a hazard.

### R9 — Quality

1. All game logic that doesn't need the canvas (scoring, content picking, round flow) SHALL be covered by unit tests.
2. Each game SHALL pass a scripted bot playthrough in tests: start, play every round with simulated input, include a disconnect and rejoin, and reach results without errors.
3. TV code SHALL remain ES2019 and run at 60 fps on a 2021 TV browser with 8 players.

## New game list

Six new games, each with a mechanic the hub doesn't have yet:

| # | Game | Type | Mechanic | Phone controls | Players |
|---|---|---|---|---|---|
| 1 | ⛳ **Mini Golf Mayhem** | Action · Physics | Everyone putts at the same hole at once, and balls collide. Holes have bumpers, moving walls and slopes. Fewest strokes wins. | Drag back to aim, release to shoot | 1–12 |
| 2 | 🐍 **Light Trails** | Action · Reflex | Tron-style light cycles: turn left or right, avoid every trail, and be the last one riding. Power-ups appear in later rounds. | Two big ◀ ▶ buttons + BOOST | 2–12 |
| 3 | 🌋 **Lava Rise** | Action · Platformer | Jump up a scrolling tower of platforms as lava rises. Players can bonk each other. | Joystick + JUMP | 1–12 |
| 4 | 🤠 **Quick Draw** | Reflex | Wait for the signal, then tap first. Includes fake-out signals, and tapping early is a penalty. | One big button | 2–12 |
| 5 | 🎭 **Fake Out** | Social · Bluffing | Everyone writes a fake answer to a weird true fact, then everyone tries to spot the real one. You score for finding the truth and for fooling others. | Type an answer, then vote | 3–12 |
| 6 | 📏 **Close Call** | Brains · Estimation | "How many…?" questions with number answers. The closest guess wins, and an exact hit gets a bonus. | Number pad | 1–12 |

The existing five games get the freshness (R6), settings (R4), pause (R1) and rejoin (R2) upgrades.

## Decisions

- All six new games are approved as listed.
- Back during a game opens the pause menu, and Back again quits to the menu (R1.2, R1.3).
