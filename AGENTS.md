# Agent Instructions

This project follows the shared Project Playbook.

Before making non-trivial changes:

1. Read `../project-playbook/PLAYBOOK.md`.
2. Read this project's `PROJECT.md`.
3. Read the relevant parts of `README.md`.
4. Read `CLAUDE.md` for inherited upstream build, test, and repository conventions.
5. Inspect the current Git working tree and the relevant implementation.

Project-specific instructions below override the shared playbook and inherited upstream agent notes when they conflict.

## Project-specific Instructions

- Treat `main` as the upstream-sync branch. Do not make fork-specific development commits directly on `main`.
- Use `karas-dev` as the long-lived integration branch unless the user explicitly chooses another branch.
- The canonical upstream remote is `https://github.com/Mnehmos/mnehmos.rpg.mcp.git`; preserve the ability to merge useful upstream changes into this fork.
- Keep fork-specific integration changes modular and avoid unnecessary edits to upstream engine internals when a boundary adapter can solve the problem.
- Current fork direction and handoff state live in `PROJECT.md`; do not rely on inherited snapshot documents for current status.

