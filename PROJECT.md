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
- Upstream provides 31 consolidated tools plus 5 meta/event tools; this fork adds `campaign_manage`, for 32 consolidated tools and 37 MCP tools total.
- Streamable HTTP, stdio, TCP, Unix socket, and WebSocket transports already exist upstream.
- SQLite-backed persistence and per-campaign HTTP database support already exist upstream.
- The repository includes a complete Bastion campaign data set and a bespoke `scripts/seed-bastion.ts` importer. It demonstrates that rich campaign content can be materialized into the engine, but it is not a generic campaign-module loader.
- The HTTP transport now supports an explicit single-user mode so Karas Home Gateway can connect over localhost MCP HTTP without tenant headers.
- The integration was exercised end to end through an isolated Gateway instance: Gateway discovery succeeded, `rpg.math_manage` executed a deterministic dice roll, and `rpg.character_manage` persisted a test character through the single-user SQLite database.
- The home node is running the RPG provider through Karas Home Gateway. ChatGPT Chat has directly invoked `rpg.math_manage` through the normal plugin path.
- Campaign Pack v1 is implemented with `campaign_manage.validate` and `campaign_manage.load`, stable source refs, world creation/existing-world modes, arbitrary spatial graph connections, characters and placement, secrets, narrative imports, and duplicate-import markers.
- The Home plugin now exposes `rpg.campaign_manage`; ChatGPT Chat successfully called `campaign_manage.validate` through the live Karas Home Gateway/RPG chain.
- The first private Campaign Pack playtest, `The Third Bell of Mistlamp`, has been authored under ignored `.private/` DM material, validated in a disposable SQLite database, backed up, and loaded successfully through the live Gateway into the single-user RPG database.
- Current verification on 2026-09-23: `npm run build` and the full Vitest suite succeeded with 151 test files passed, 1 skipped; 2287 tests passed, 7 skipped.

## Architecture

### Upstream engine

- `src/engine/`: deterministic RPG mechanics such as combat, magic, spatial systems, world generation, and strategy.
- `src/storage/`: SQLite storage, repositories, migrations, and tenant/campaign database handling.
- `src/server/consolidated/`: 32 action-routed tool contracts and handlers in this fork.
- `src/campaign/`: Campaign Pack v1 schema, validation, and materialization logic.
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
localhost MCP HTTP provider
      |
      v
Upstream RPG engine + SQLite campaign state
```

Campaign source material flows through Campaign Pack v1 before being materialized into engine worlds, locations, characters, secrets, and narrative state. Additional mechanical sections can be added as the format proves itself.

## Key Decisions

- **Keep `main` close to upstream.** This minimizes friction when pulling future fixes and features from Mnehmos.
- **Use `karas-dev` for long-lived fork work.** The fork is expected to evolve beyond a single feature.
- **Develop primarily on the home PC and deploy to Karin Cloud.** The home PC is the development workstation; Karin Cloud is intended to be the always-on runtime.
- **Reuse Karas Home Gateway.** Gateway already provides the connection path used by ChatGPT, so RPG functionality should integrate behind it rather than duplicate transport and tunnel infrastructure.
- **Keep RPG independently usable.** Gateway will consume the RPG server through its existing localhost MCP HTTP adapter; the RPG project remains a complete standalone MCP server that can be published and used without Karas Home Gateway.
- **Use single-user HTTP for personal deployment.** The personal runtime uses one explicit SQLite database and service authentication, while upstream multi-tenant HTTP remains available and unchanged by default.
- **Keep the engine authoritative.** The inherited principle remains: the LLM describes and proposes; validated engine operations commit mechanical truth.
- **Prefer adapters over invasive forks.** Keeping upstream engine boundaries intact makes future upstream merges cheaper.
- **Generalize campaign loading.** Campaign Pack v1 replaces the need for a new campaign-specific TypeScript seeder for the supported core entities.
- **Keep Campaign Pack v1 honest.** Unsupported mechanical domains stay out of the schema instead of being silently accepted and dropped.

## Known Issues

### First solo playtest findings (2026-09-24)

- **Rest / Hit Dice are not rules-authoritative yet.** `rest_manage` hard-codes every character's Hit Die to d8. It also does not persist available/spent Hit Dice, so a level-1 character can currently request more Hit Dice than they actually have. Long rest therefore cannot correctly restore spent Hit Dice either. The fix should derive die size from the character's source-backed class and persist Hit Dice availability across rests/sessions.
- **Starter armor is granted but not equipped.** Character creation computes naked AC before provisioning, then grants starting armor without equipping it or recalculating AC. The first Ranger therefore spawned with Scale Mail in inventory but AC 13 instead of AC 16. Prefer deterministic auto-equip of defensive starting gear (armor, and shield when unambiguous) with authoritative AC recomputation; leave weapon-hand choices explicit.
- **Some provisioned starter items are not canonical/usable.** `Torches x10` currently becomes a generic plural `Torches` item, while the light-source rules recognize a canonical/singular Torch. During play this made the Ranger's starter torches unusable until they were replaced with the source-backed SRD Torch. Starting-equipment aliases/materialization need to preserve usable item mechanics.
- **Combat bonus-action attacks are missing.** `combat_action.attack` always validates and commits an Action, so a legal two-weapon off-hand Bonus Action attack is rejected after the main-hand attack. The combat API needs an authoritative two-weapon/off-hand path that consumes the Bonus Action and applies the correct damage modifier rules.
- **Help / Dodge / Ready are currently descriptive rather than authoritative.** In `combat_action`, these actions return text but do not commit action economy or persist their mechanical effects. In the playtest, Lyra's Help did not actually grant advantage to Dan's next attack. These actions need engine state, consumption/expiry semantics, and tests that verify the later roll is affected.
- **Nonlethal melee knockouts are not modeled.** There is no attack parameter/engine path for the 5e rule that a melee attack reducing a creature to 0 HP may knock it unconscious and stable instead of leaving normal 0-HP/death-save semantics. The first playtest required a manual condition/state bridge.
- **Character updates can silently discard unsupported fields.** `character_manage.create` accepts `behavior`, but `character_manage.update` does not; Zod strips the unknown field and reports success. This caused an attempted persistent Ranger-note update to become a no-op. Add the missing mutable field(s) and/or return a guiding error for unsupported update keys instead of silently succeeding.
- **Level-1 class choices are not structured on the character.** Ranger `Favored Enemy` and `Natural Explorer` have no durable character fields, so the playtest had to store them as a narrative rule note. A generic source-backed feature-choice representation is preferable to adding bespoke columns for every class.

- Campaign Pack v1 imports are not atomic transactions. A runtime failure can leave partial state; the failed import marker blocks blind retry until the state is inspected or reset.
- Campaign Pack v1 does not yet have dedicated sections for quests, parties, items/inventory, encounters, autonomous NPC minds, or mechanical factions.
- The final minimal ChatGPT-DM tool surface has not been reduced yet; the Gateway currently exposes the selected RPG tool set explicitly.
- Several inherited documents contain old point-in-time counts or architecture notes. `PROJECT.md` is the authority for this fork's current state; legacy snapshot documents should not be treated as current without verification.
- `npm ci` currently reports 13 dependency vulnerabilities (1 low, 4 moderate, 6 high, 2 critical). They have not yet been assessed for runtime relevance or safe remediation.

## Next

1. Fix rest correctness first: class-backed Hit Die size plus persistent Hit Dice spending/recovery.
2. Fix combat action economy used by the playtest: authoritative Help advantage, legal two-weapon Bonus Action attack, and nonlethal melee knockout semantics.
3. Fix character-creation/runtime integrity: auto-equip defensive starter gear and canonicalize usable starter items such as Torches.
4. Harden character persistence: avoid silent update no-ops and add a durable representation for class feature choices such as Ranger Favored Enemy / Natural Explorer.
5. Resume the private playtest after the high-impact mechanical fixes, then capture any new engine findings without adding campaign spoilers to tracked docs.
6. Define the first compact ChatGPT-DM tool surface exposed by Gateway, then establish the Karin Cloud deployment/update path.

