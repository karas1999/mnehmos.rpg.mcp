import { z } from 'zod';
import {
    AtmosphericSchema,
    BiomeTypeSchema,
    TravelTerrainSchema,
} from '../schema/spatial.js';
import { RevealConditionSchema } from '../schema/secret.js';
import { WorldEnvironmentSchema } from '../schema/world.js';

export const CampaignRefSchema = z.string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'Use letters, numbers, dot, underscore, colon, or dash');

const StatsSchema = z.object({
    str: z.number().int().min(0).default(10),
    dex: z.number().int().min(0).default(10),
    con: z.number().int().min(0).default(10),
    int: z.number().int().min(0).default(10),
    wis: z.number().int().min(0).default(10),
    cha: z.number().int().min(0).default(10),
});

const CampaignManifestSchema = z.object({
    id: CampaignRefSchema.describe('Stable campaign-pack identifier'),
    name: z.string().min(1).max(120),
    version: z.string().min(1).max(40),
    description: z.string().max(2000).optional(),
    author: z.string().max(120).optional(),
    source: z.string().max(500).optional(),
    metadata: z.record(z.any()).optional().default({}),
});

const CreateWorldSchema = z.object({
    mode: z.literal('create'),
    name: z.string().min(1).max(120).optional(),
    seed: z.string().min(1).max(200).optional(),
    width: z.number().int().min(10).max(1000).default(50),
    height: z.number().int().min(10).max(1000).default(50),
    environment: WorldEnvironmentSchema.partial().optional(),
});

const ExistingWorldSchema = z.object({
    mode: z.literal('existing'),
    worldId: z.string().min(1),
});

const CampaignWorldSchema = z.discriminatedUnion('mode', [
    CreateWorldSchema,
    ExistingWorldSchema,
]).default({
    mode: 'create',
    width: 50,
    height: 50,
});

const CampaignNetworkSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    type: z.enum(['cluster', 'linear']).default('cluster'),
    centerX: z.number().int().min(0).default(0),
    centerY: z.number().int().min(0).default(0),
    boundingBox: z.object({
        minX: z.number().int().min(0),
        maxX: z.number().int().min(0),
        minY: z.number().int().min(0),
        maxY: z.number().int().min(0),
    }).optional(),
});

const CampaignLocationSchema = z.object({
    ref: CampaignRefSchema,
    name: z.string().min(1).max(100),
    description: z.string().min(10).max(2000),
    biome: BiomeTypeSchema.default('urban'),
    atmospherics: z.array(AtmosphericSchema).default([]),
    localX: z.number().int().min(0).optional(),
    localY: z.number().int().min(0).optional(),
});

const DirectionSchema = z.enum([
    'north', 'south', 'east', 'west', 'up', 'down',
    'northeast', 'northwest', 'southeast', 'southwest',
]);

const CampaignConnectionSchema = z.object({
    from: CampaignRefSchema,
    to: CampaignRefSchema,
    direction: DirectionSchema,
    type: z.enum(['OPEN', 'LOCKED', 'HIDDEN']).default('OPEN'),
    dc: z.number().int().min(5).max(30).optional(),
    description: z.string().max(500).optional(),
    travelTime: z.number().int().min(0).optional(),
    terrain: TravelTerrainSchema.optional(),
    difficulty: z.number().int().min(5).max(30).optional(),
    bidirectional: z.boolean().default(true),
    reverseDirection: DirectionSchema.optional(),
});

const CampaignCharacterSchema = z.object({
    ref: CampaignRefSchema,
    name: z.string().min(1).max(120),
    characterType: z.enum(['pc', 'npc', 'enemy', 'neutral']).default('npc'),
    class: z.string().min(1).default('Adventurer'),
    race: z.string().min(1).default('Human'),
    background: z.string().optional(),
    alignment: z.string().optional(),
    level: z.number().int().min(1).max(20).default(1),
    stats: StatsSchema.default({
        str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    }),
    hp: z.number().int().min(1).optional(),
    maxHp: z.number().int().min(1).optional(),
    ac: z.number().int().min(0).optional(),
    behavior: z.string().max(2000).optional(),
    cantripsKnown: z.array(z.string()).default([]),
    knownSpells: z.array(z.string()).default([]),
    preparedSpells: z.array(z.string()).default([]),
    resistances: z.array(z.string()).default([]),
    vulnerabilities: z.array(z.string()).default([]),
    immunities: z.array(z.string()).default([]),
    provisionEquipment: z.boolean().default(false),
    customEquipment: z.array(z.string()).optional(),
    startingGold: z.number().int().min(0).optional(),
    locationRef: CampaignRefSchema.optional(),
});

const CampaignEntityRefSchema = z.object({
    kind: z.enum(['character', 'location']),
    ref: CampaignRefSchema,
});

const CampaignSecretSchema = z.object({
    type: z.enum(['npc', 'location', 'item', 'quest', 'plot', 'mechanic', 'custom']),
    category: z.string().min(1),
    name: z.string().min(1),
    publicDescription: z.string().min(1),
    secretDescription: z.string().min(1),
    linkedEntity: CampaignEntityRefSchema.optional(),
    sensitivity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    leakPatterns: z.array(z.string()).default([]),
    revealConditions: z.array(RevealConditionSchema).default([]),
    notes: z.string().optional(),
});

const CampaignNarrativeSchema = z.object({
    ref: CampaignRefSchema.optional(),
    type: z.enum(['plot_thread', 'canonical_moment', 'npc_voice', 'foreshadowing', 'session_log']),
    content: z.string().min(1),
    metadata: z.record(z.any()).default({}),
    visibility: z.enum(['dm_only', 'player_visible']).default('dm_only'),
    tags: z.array(z.string()).default([]),
    entity: CampaignEntityRefSchema.optional(),
    status: z.enum(['active', 'resolved', 'dormant', 'archived']).default('active'),
});

export const CampaignPackSchema = z.object({
    schemaVersion: z.literal(1),
    manifest: CampaignManifestSchema,
    world: CampaignWorldSchema,
    network: CampaignNetworkSchema.default({
        type: 'cluster',
        centerX: 0,
        centerY: 0,
    }),
    locations: z.array(CampaignLocationSchema).default([]),
    connections: z.array(CampaignConnectionSchema).default([]),
    characters: z.array(CampaignCharacterSchema).default([]),
    secrets: z.array(CampaignSecretSchema).default([]),
    narrative: z.array(CampaignNarrativeSchema).default([]),
}).superRefine((pack, ctx) => {
    const locationRefs = new Set<string>();
    for (const [index, location] of pack.locations.entries()) {
        if (locationRefs.has(location.ref)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['locations', index, 'ref'],
                message: `Duplicate location ref: ${location.ref}`,
            });
        }
        locationRefs.add(location.ref);
    }

    const characterRefs = new Set<string>();
    for (const [index, character] of pack.characters.entries()) {
        if (characterRefs.has(character.ref)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['characters', index, 'ref'],
                message: `Duplicate character ref: ${character.ref}`,
            });
        }
        characterRefs.add(character.ref);
        if (character.locationRef && !locationRefs.has(character.locationRef)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['characters', index, 'locationRef'],
                message: `Unknown location ref: ${character.locationRef}`,
            });
        }
    }

    const occupiedDirections = new Set<string>();
    for (const [index, connection] of pack.connections.entries()) {
        if (!locationRefs.has(connection.from)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['connections', index, 'from'],
                message: `Unknown location ref: ${connection.from}`,
            });
        }
        if (!locationRefs.has(connection.to)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['connections', index, 'to'],
                message: `Unknown location ref: ${connection.to}`,
            });
        }
        if (connection.from === connection.to) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['connections', index],
                message: 'A connection cannot point a location to itself',
            });
        }

        const forwardKey = `${connection.from}:${connection.direction}`;
        if (occupiedDirections.has(forwardKey)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['connections', index, 'direction'],
                message: `Direction ${connection.direction} is already occupied from ${connection.from}`,
            });
        }
        occupiedDirections.add(forwardKey);

        if (connection.bidirectional) {
            const reverse = connection.reverseDirection ?? oppositeDirection(connection.direction);
            const reverseKey = `${connection.to}:${reverse}`;
            if (occupiedDirections.has(reverseKey)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['connections', index, 'reverseDirection'],
                    message: `Reverse direction ${reverse} is already occupied from ${connection.to}`,
                });
            }
            occupiedDirections.add(reverseKey);
        }
    }

    const validateEntityRef = (
        entity: z.infer<typeof CampaignEntityRefSchema> | undefined,
        path: Array<string | number>,
    ) => {
        if (!entity) return;
        const exists = entity.kind === 'location'
            ? locationRefs.has(entity.ref)
            : characterRefs.has(entity.ref);
        if (!exists) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path,
                message: `Unknown ${entity.kind} ref: ${entity.ref}`,
            });
        }
    };

    pack.secrets.forEach((secret, index) => {
        validateEntityRef(secret.linkedEntity, ['secrets', index, 'linkedEntity']);
    });
    pack.narrative.forEach((note, index) => {
        validateEntityRef(note.entity, ['narrative', index, 'entity']);
    });

    const narrativeRefs = new Set<string>();
    pack.narrative.forEach((note, index) => {
        if (!note.ref) return;
        if (narrativeRefs.has(note.ref)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['narrative', index, 'ref'],
                message: `Duplicate narrative ref: ${note.ref}`,
            });
        }
        narrativeRefs.add(note.ref);
    });
});

export type CampaignPack = z.infer<typeof CampaignPackSchema>;
export type CampaignDirection = z.infer<typeof DirectionSchema>;

export function oppositeDirection(direction: CampaignDirection): CampaignDirection {
    const opposites: Record<CampaignDirection, CampaignDirection> = {
        north: 'south',
        south: 'north',
        east: 'west',
        west: 'east',
        up: 'down',
        down: 'up',
        northeast: 'southwest',
        northwest: 'southeast',
        southeast: 'northwest',
        southwest: 'northeast',
    };
    return opposites[direction];
}

