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

