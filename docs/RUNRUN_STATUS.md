# RUNRUN Swarm Status

Date: 2026-04-27

## Current state
The repository currently contains the initial shell scaffold only. The next workstream is moving from shell to playable prototype.

## Active team breakdown

### Frontend coding teams
- Building the playable game shell in React + TypeScript.
- Implementing the runner canvas loop, lane switching input, obstacle spawning, score display, and restart flow.
- Preparing component boundaries so UI and game logic stay separated.

### Backend coding teams
- Defining the data flow for session score submission.
- Preparing minimal API contracts for highscores and future player persistence.
- Keeping the runtime logic client-first for the first playable build.

### Design teams
- Locking the visual direction for the runner game.
- Defining neon arcade styling, lane readability, obstacle contrast, and motion tone.
- Preparing asset direction for future sprites and background layers.

### Supabase teams
- Designing the highscores schema.
- Preparing auth-light guest submission flow and RLS-safe tables.
- Defining the minimum tables required for MVP scoreboard persistence.

## Additional squads in motion
- UI teams: refining HUD, score, pause, and restart layout.
- UX teams: simplifying first-run controls and failure recovery.
- Testing teams: writing smoke tests for lane changes, collisions, and restart behavior.
- QA teams: checking playability targets and edge cases.
- Security teams: reviewing score submission and environment exposure risks.
- DevOps teams: preparing build/deploy settings for later Vercel promotion.
- Copywriting teams: drafting in-game copy and title/score labels.
- Branding and Assets teams: defining the game name treatment and icon direction.
- Mobile teams: preparing the Capacitor packaging path.
- Integration teams: keeping Stripe and other integrations out of the MVP unless required.
- Ideas & Profitability teams: keeping the scope focused on a shippable core loop.
- Market Research teams: checking runner-game patterns and launch positioning.
- SEO teams: preparing metadata for the eventual web build.
- GitHub Research teams: identifying useful free starter patterns and open-source refs.
- Legal & Compliance teams: reviewing only if monetization or user data features expand.
- Performance teams: targeting lightweight rendering and fast frame pacing.

## Blockers
- No blocker on repo access.
- Main blocker is that the repo still needs the first real runner-mechanics commit.
- The initial shell exists, but the core loop, lanes, collisions, and score progression have not yet been pushed.

## Next push sequence
1. Push runner mechanics and lane switching logic.
2. Add obstacle spawning and collision detection.
3. Wire the score loop and restart flow.
4. Add minimal HUD and responsive game shell.
5. Follow with Supabase highscores and mobile packaging.
