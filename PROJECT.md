# Project

## Goal

Adapt `mnehmos.rpg.mcp` into the persistent rules and world-state backend for a solo RPG experience where ChatGPT Chat mode acts as the DM through Karas Home Gateway.

The engine should remain the authoritative source of mechanical truth while ChatGPT handles narration, roleplay, interpretation, and pacing.

## Scope

- Preserve and reuse the upstream RPG engine, SQLite persistence, combat, character, inventory, quest, spatial, secret, narrative, and related rule systems.
- Integrate the useful engine capabilities behind the existing Karas Home Gateway rather than creating a separate public tunnel solely for this project.
- Design a compact Gateway-facing tool surface suitable for ChatGPT DM use.
- Replace the Bastion-specific seeding approach with a reusable Campaign Pack / Campaign Loader path so new adventures can be imported without writing a bespoke `seed-*.ts` script each time.
- Support persistent campaigns that can continue across ChatGPT sessions and from mobile ChatGPT.
- Keep useful upstream changes mergeable into this fork.

## Non-goals

- Reimplement the RPG rules engine from scratch.
- Build a new chat frontend or mobile app while ChatGPT itself is the intended player interface.
- Require Codex during normal gameplay.
- Run a second public tunnel or duplicate Gateway authentication unless a concrete technical need appears.
- Make the built-in autonomous NPC LLM runtime a requirement for the first playable version; ChatGPT can initially act as DM and primary NPC intelligence.

## Current Status

- Fork: `karas1999/mnehmos.rpg.mcp`.
- `origin/main` and `upstream/main` were identical at adoption commit `8b88726`.
- `main` is reserved for upstream synchronization; active fork development uses `karas-dev`.
- The upstream engine currently registers 31 consolidated tools, 2 meta tools, and 3 event tools, for 36 MCP tools total.
- Streamable HTTP, stdio, TCP, Unix socket, and WebSocket transports already exist upstream.
- SQLite-backed persistence and per-campaign HTTP database support already exist upstream.
- The repository includes a complete Bastion campaign data set and a bespoke `scripts/seed-bastion.ts` importer. It demonstrates that rich campaign content can be materialized into the engine, but it is not a generic campaign-module loader.
- No Karas Home Gateway adapter or generic Campaign Loader has been implemented yet.
- Baseline verified on 2026-09-23: `npm ci`, `npm run build`, and the full Vitest suite succeeded with 148 test files passed, 1 skipped; 2278 tests passed, 7 skipped.

## Architecture

### Upstream engine

- `src/engine/`: deterministic RPG mechanics such as combat, magic, spatial systems, world generation, and strategy.
- `src/storage/`: SQLite storage, repositories, migrations, and tenant/campaign database handling.
- `src/server/consolidated/`: 31 action-routed tool contracts and handlers.
- `src/server/`: MCP registration, meta/event tools, transports, and HTTP server behavior.
- `src/agent/`: optional OpenAI/OpenRouter-backed autonomous NPC runtime.
- `src/schema/`: Zod contracts and validation.
- `tests/`: engine, storage, server, transport, and schema verification.

### Fork direction

The intended runtime shape is:

```text
ChatGPT Chat mode
      |
      v
Karas Home Gateway
      |
      v
RPG adapter / compact DM tool surface
      |
      v
Upstream RPG engine + SQLite campaign state
```

Campaign source material should eventually flow through a generic Campaign Pack representation and loader before being materialized into engine entities, secrets, narrative notes, quests, locations, NPCs, and other persistent state.

## Key Decisions

- **Keep `main` close to upstream.** This minimizes friction when pulling future fixes and features from Mnehmos.
- **Use `karas-dev` for long-lived fork work.** The fork is expected to evolve beyond a single feature.
- **Develop primarily on the home PC and deploy to Karin Cloud.** The home PC is the development workstation; Karin Cloud is intended to be the always-on runtime.
- **Reuse Karas Home Gateway.** Gateway already provides the connection path used by ChatGPT, so RPG functionality should integrate behind it rather than duplicate transport and tunnel infrastructure.
- **Keep the engine authoritative.** The inherited principle remains: the LLM describes and proposes; validated engine operations commit mechanical truth.
- **Prefer adapters over invasive forks.** Keeping upstream engine boundaries intact makes future upstream merges cheaper.
- **Generalize campaign loading.** Bastion's bespoke bootstrap proves the concept, but future campaigns should use a reusable loader rather than campaign-specific TypeScript seeders.

## Known Issues

- There is no generic Campaign Pack schema or loader yet.
- The exact Gateway integration boundary and final ChatGPT-facing tool surface have not been designed.
- Several inherited documents contain old point-in-time counts or architecture notes. `PROJECT.md` is the authority for this fork's current state; legacy snapshot documents should not be treated as current without verification.
- `npm ci` currently reports 13 dependency vulnerabilities (1 low, 4 moderate, 6 high, 2 critical). They have not yet been assessed for runtime relevance or safe remediation.

## Next

1. Inspect Karas Home Gateway's provider/tool registration model and choose the smallest integration boundary for the RPG engine.
2. Define the first compact ChatGPT-DM tool surface exposed by Gateway.
3. Design a generic Campaign Pack schema and loader, using Bastion's bootstrap/seeder as evidence rather than as the final format.
4. Establish the Karin Cloud deployment/update path after the local integration is stable.

