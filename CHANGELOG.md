# Changelog

Record meaningful milestones and changes in project direction. Routine code changes belong in Git history.

## 2026-09-23 - Fork Adopted for ChatGPT Solo RPG

### Why

The upstream RPG engine already provides strong deterministic mechanics, SQLite persistence, NPC memory, secrets, world state, and an MCP-oriented tool layer. The fork is being adopted to support a mobile-friendly solo RPG in which ChatGPT Chat mode acts as DM through the existing Karas Home Gateway.

### What

- Added the shared Project Playbook structure and current-state handoff documentation.
- Established `upstream` as the Mnehmos repository and reserved `main` for upstream synchronization.
- Created `karas-dev` as the long-lived fork development branch.
- Recorded the intended Gateway integration and generic Campaign Loader direction.
- Re-established local dependencies and verified the upstream baseline before fork-specific implementation begins.

### Result

`npm run build` succeeds. The full baseline test suite reports 148 test files passed and 1 skipped, with 2278 tests passed and 7 skipped.

The fork now has a documented development boundary while preserving a clean path for future upstream merges.

### Notes

The inherited Bastion campaign uses a bespoke bootstrap JSON plus `scripts/seed-bastion.ts`. It is useful implementation evidence, but the fork intends to replace that campaign-specific import path with a reusable Campaign Pack / Campaign Loader design.

## 2026-09-23 - Single-user HTTP Integration Path

### Why

Karas Home Gateway should aggregate the RPG engine without owning RPG business
logic or requiring a second external tunnel. The RPG server should also remain
independently usable outside the Gateway.

### What

- Added an explicit single-user HTTP mode for personal deployments.
- Reused the existing single-user SQLite path instead of requiring signed
  tenant headers.
- Kept service-token authentication on the HTTP MCP endpoint.
- Disabled the multi-tenant campaign-erasure route in single-user mode.
- Preserved the existing multi-tenant HTTP behavior as the default.

### Result

Karas Home Gateway can consume the RPG engine as a normal localhost MCP HTTP
provider while the RPG project remains a standalone MCP server. The targeted
single-user HTTP tests pass, and the full suite reports 2280 tests passed with
7 skipped.

The integration was also validated through an isolated Karas Home Gateway
instance. The Gateway discovered the mapped RPG capabilities, executed a seeded
dice roll through `rpg.math_manage`, and created a persistent test character
through `rpg.character_manage`.

The home machine's local Gateway/Hub configuration has been staged with an RPG
provider and launch recipe. The live Gateway was intentionally left running
unchanged so the active development connection would not be interrupted.

## 2026-09-23 - Campaign Pack v1

### Why

The inherited Bastion campaign proves that rich adventure content can be seeded
into the engine, but its importer is campaign-specific. New adventures should
not require a new TypeScript seeder with hard-coded runtime UUIDs and bespoke
mapping tables.

### What

- Added a portable Campaign Pack v1 schema with stable human-readable refs.
- Added cross-reference validation before storage is mutated.
- Added generic loading for new or existing worlds, spatial networks,
  arbitrary room graphs, characters and starting locations, secrets, and
  narrative notes.
- Added duplicate-import protection using campaign seeds and durable narrative
  import markers.
- Added the consolidated `campaign_manage` tool with `validate` and `load`
  actions while keeping its default MCP schema compact.
- Added `docs/Campaign-Packs.md` with the supported format and first-version
  limitations.

### Result

`npm run build` succeeds. The full suite reports 151 test files passed and 1
skipped, with 2287 tests passed and 7 skipped.

Campaign Pack v1 is intentionally non-atomic for now: a runtime failure can
leave partial state, but a failed import marker prevents a blind duplicate
retry. Rollback/resume semantics remain future work.

The Home Gateway and plugin were then reloaded. ChatGPT Chat discovered
`rpg.campaign_manage` directly and successfully ran a live `validate` call
through Karas Home Gateway into the RPG engine.

## 2026-09-23 - First Private Campaign Loaded

### Why

Campaign Pack v1 needed a real adventure, not only synthetic tests, to prove
the authoring and live-import workflow before normal play begins.

### What

- Added `.private/` to Git ignore rules so DM spoilers and local playtest packs
  cannot be committed accidentally.
- Authored the first private solo playtest campaign outside tracked source.
- Validated the pack both against the compiled schema and through the live
  `rpg.campaign_manage` Gateway path.
- Performed a full disposable-database load before touching the live save.
- Backed up the live single-user SQLite database, then loaded the campaign
  through the normal Gateway route.

### Result

The private campaign loaded successfully into the live RPG database and is
ready for player-character creation and the first session. No DM-only campaign
content is stored in tracked project files.

## 2026-09-24 - First Solo Playtest Rule Hardening

### Why

The first live solo session exposed several places where the engine's narrated
5e behavior was looser than its authoritative persisted mechanics. Those gaps
needed to be fixed before moving the always-on runtime and campaign save to
Karin Cloud.

### What

- Replaced the hard-coded d8 short-rest die with source-backed class Hit Dice.
- Persisted available Hit Dice in character resource pools, enforced spending,
  restored the correct amount on long rests, and grew the pool on level-up.
- Made Help, Dodge, and Ready consume actions and persist their mechanical
  effects across encounter reloads.
- Added a legal two-weapon off-hand Bonus Action attack path and structured
  advantage/disadvantage attack-roll output.
- Added nonlethal melee knockout semantics that leave a 0-HP target stable.
- Auto-equipped unambiguous defensive starter gear and centralized AC
  calculation so character creation and later equipment changes use one rule.
- Canonicalized starter torches, rations, and waterskins to source-backed SRD
  items instead of inert name-only placeholders.
- Made character updates reject unsupported fields instead of silently
  dropping them, and added behavior updates.
- Added generic persisted `featureChoices` for choices such as Ranger Favored
  Enemy and Natural Explorer, including Campaign Pack support.

### Result

`npm run build` succeeds. The full suite reports 151 test files passed and 1
skipped, with 2302 tests passed and 7 skipped.

The code is ready to be deployed and the first playtest save reconciled before
the runtime is migrated from the home PC to Karin Cloud.

