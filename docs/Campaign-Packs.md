# Campaign Packs

Campaign Pack v1 is the portable adventure format for this fork. A pack describes initial durable facts; after load, the database is runtime truth.

## Workflow

Use campaign_manage:

1. validate checks schema and cross-references without changing state.
2. load materializes the pack into the current RPG database.

A load can create a world, or target an existing world, plus one spatial network, locations, arbitrary room connections, characters and starting locations, DM secrets, and narrative notes.

## Stable refs

Pack files use human-readable refs such as taproom, cellar, or innkeeper. The loader converts these to runtime UUIDs. Source packs should never hard-code database UUIDs.

Refs may contain letters, numbers, dot, underscore, colon, and dash. They must be unique within their entity collection.

## Minimal pack

    {
      "schemaVersion": 1,
      "manifest": {
        "id": "lantern-cellar",
        "name": "The Lantern Cellar",
        "version": "1.0.0"
      },
      "world": {
        "mode": "create"
      }
    }

This is valid, though validation warns if the pack has no locations, characters, or narrative.

## Core shape

    {
      "schemaVersion": 1,
      "manifest": {
        "id": "lantern-cellar",
        "name": "The Lantern Cellar",
        "version": "1.0.0"
      },
      "world": {
        "mode": "create",
        "name": "Lantern Vale",
        "seed": "lantern-cellar-v1",
        "width": 30,
        "height": 30
      },
      "network": {
        "name": "The Lantern Inn",
        "type": "cluster",
        "centerX": 5,
        "centerY": 5
      },
      "locations": [
        {
          "ref": "taproom",
          "name": "The Lantern Taproom",
          "description": "A timber taproom lit by a broad stone hearth.",
          "biome": "urban"
        },
        {
          "ref": "cellar",
          "name": "The Lantern Cellar",
          "description": "A damp stone cellar lined with old casks.",
          "biome": "dungeon",
          "atmospherics": ["DARKNESS"]
        }
      ],
      "connections": [
        {
          "from": "taproom",
          "to": "cellar",
          "direction": "down",
          "type": "HIDDEN",
          "dc": 14,
          "bidirectional": true
        }
      ],
      "characters": [
        {
          "ref": "mara",
          "name": "Mara Vale",
          "characterType": "npc",
          "class": "Commoner",
          "race": "Human",
          "level": 1,
          "hp": 8,
          "maxHp": 8,
          "ac": 10,
          "behavior": "Friendly in public, nervous about the cellar.",
          "locationRef": "taproom"
        }
      ],
      "secrets": [
        {
          "type": "npc",
          "category": "motivation",
          "name": "Mara has the cellar key",
          "publicDescription": "Mara avoids talking about the cellar.",
          "secretDescription": "Mara hides the key inside a flour jar.",
          "linkedEntity": {
            "kind": "character",
            "ref": "mara"
          },
          "sensitivity": "high"
        }
      ],
      "narrative": [
        {
          "ref": "missing-courier",
          "type": "plot_thread",
          "content": "A courier vanished after stopping at the inn.",
          "visibility": "dm_only",
          "tags": ["hook"],
          "entity": {
            "kind": "location",
            "ref": "cellar"
          },
          "metadata": {
            "hooks": ["Ask Mara about the courier"],
            "resolution_conditions": ["Discover what happened in the cellar"]
          }
        }
      ]
    }

## World modes

Create mode creates a world. If no seed is supplied, the loader uses campaign:<manifest.id>. Reusing the same seed is refused.

Existing mode requires a runtime worldId and imports into that world. A campaign marker prevents the same campaign id from being imported into that world twice.

## Locations and connections

Connections support OPEN, LOCKED, and HIDDEN. They are bidirectional by default. Reverse direction is inferred unless reverseDirection is provided.

Maps can contain loops and non-tree topology. Validation rejects duplicate directional exits from one location.

## Characters

Campaign Pack v1 does not infer stats from prose. Put required level, HP, AC, abilities, spells, or resistances in the pack.

provisionEquipment defaults to false, so importing a module does not silently invent class equipment.

## Secrets and narrative

Secrets use the existing DM secret system and may link to a character or location by ref.

Use narrative entries for lore that does not need a mechanical entity yet, including factions, history, timeline facts, pantheon notes, bestiary lore, plot threads, NPC voice notes, and foreshadowing.

## Import safety

Validation runs before writes.

The loader creates an import marker with state loading, then changes it to loaded or failed. Duplicate imports are refused.

Campaign Pack v1 is not yet an atomic transaction. A runtime failure after some entities were created may leave partial state. The failed marker deliberately blocks a blind retry. Inspect or reset the campaign state before retrying.

Rollback and resume semantics are future work.

## Not yet materialized by v1

The first version does not have dedicated pack sections for quests, parties, items/inventory, encounters, autonomous NPC agent minds, mechanical factions, or campaign-specific custom schemas.

Put non-mechanical lore in narrative until those sections earn a stable design.

## Design rule

The pack is source material. The database is runtime truth. After import, use normal engine tools to evolve the campaign instead of reapplying the pack.
