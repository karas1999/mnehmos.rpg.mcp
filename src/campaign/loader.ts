import type { SessionContext } from '../server/types.js';
import type { McpResponse } from '../utils/action-router.js';
import { CampaignPackSchema, oppositeDirection, type CampaignPack } from './schema.js';
import { handleWorldManage } from '../server/consolidated/world-manage.js';
import { handleSpatialManage } from '../server/consolidated/spatial-manage.js';
import { handleCharacterManage } from '../server/consolidated/character-manage.js';
import { handleSecretManage } from '../server/consolidated/secret-manage.js';
import { handleNarrativeManage } from '../server/consolidated/narrative-manage.js';
import { getDb } from '../storage/index.js';
import { WorldRepository } from '../storage/repos/world.repo.js';
import { SpatialRepository } from '../storage/repos/spatial.repo.js';
import type { Exit } from '../schema/spatial.js';

export interface CampaignPackValidation {
    valid: true;
    campaignId: string;
    name: string;
    version: string;
    counts: {
        locations: number;
        connections: number;
        characters: number;
        secrets: number;
        narrative: number;
    };
    warnings: string[];
}

export interface CampaignLoadResult {
    success: true;
    campaignId: string;
    version: string;
    worldId: string;
    networkId?: string;
    markerNoteId: string;
    counts: CampaignPackValidation['counts'];
    refs: {
        locations: Record<string, string>;
        characters: Record<string, string>;
    };
}

export function validateCampaignPack(input: unknown): CampaignPackValidation {
    const pack = CampaignPackSchema.parse(input);
    const warnings: string[] = [];
    if (pack.locations.length === 0) warnings.push('Pack contains no locations.');
    if (pack.characters.length === 0) warnings.push('Pack contains no characters.');
    if (pack.narrative.length === 0) warnings.push('Pack contains no narrative entries.');

    return {
        valid: true,
        campaignId: pack.manifest.id,
        name: pack.manifest.name,
        version: pack.manifest.version,
        counts: countsFor(pack),
        warnings,
    };
}

export async function loadCampaignPack(input: unknown, ctx: SessionContext): Promise<CampaignLoadResult> {
    const pack = CampaignPackSchema.parse(input);
    const db = getDb();
    const worldRepo = new WorldRepository(db);
    const spatialRepo = new SpatialRepository(db);
    const locationIds = new Map<string, string>();
    const characterIds = new Map<string, string>();

    const worldId = await resolveWorld(pack, ctx, worldRepo);
    const existingMarker = await findCampaignMarker(worldId, pack.manifest.id, ctx);
    if (existingMarker) {
        const state = typeof existingMarker.metadata?.importStatus === 'string'
            ? existingMarker.metadata.importStatus
            : 'present';
        throw new Error(
            `Campaign pack "${pack.manifest.id}" is already present in world ${worldId} (status: ${state}).`
        );
    }

    const marker = await callHandler(handleNarrativeManage, {
        action: 'batch_add',
        worldId,
        notes: [{
            type: 'canonical_moment',
            content: `Campaign pack import marker: ${pack.manifest.name} v${pack.manifest.version}`,
        metadata: {
            campaignPack: true,
            campaignId: pack.manifest.id,
            version: pack.manifest.version,
            importStatus: 'loading',
            source: pack.manifest.source ?? null,
            author: pack.manifest.author ?? null,
            description: pack.manifest.description ?? null,
            manifestMetadata: pack.manifest.metadata,
        },
            visibility: 'dm_only',
            tags: ['campaign_pack', `campaign:${pack.manifest.id}`, `version:${pack.manifest.version}`],
            status: 'active',
        }],
    }, ctx);
    const markerNotes = Array.isArray(marker.notes) ? marker.notes : [];
    const markerNoteId = requireString(markerNotes[0] ?? {}, 'noteId', 'campaign import marker');

    try {
        const networkId = pack.locations.length > 0
            ? await createNetwork(pack, worldId, ctx)
            : undefined;

        for (const location of pack.locations) {
            const created = await callHandler(handleSpatialManage, {
                action: 'generate',
                name: location.name,
                baseDescription: location.description,
                biomeContext: location.biome,
                atmospherics: location.atmospherics,
                networkId,
                localX: location.localX,
                localY: location.localY,
            }, ctx);
            locationIds.set(location.ref, requireString(created, 'roomId', `location ${location.ref}`));
        }

        for (const connection of pack.connections) {
            const fromId = requireRef(locationIds, connection.from, 'location');
            const toId = requireRef(locationIds, connection.to, 'location');
            spatialRepo.addExit(fromId, buildExit(connection.direction, toId, connection));
            if (connection.bidirectional) {
                spatialRepo.addExit(
                    toId,
                    buildExit(
                        connection.reverseDirection ?? oppositeDirection(connection.direction),
                        fromId,
                        connection,
                    ),
                );
            }
        }

        for (const character of pack.characters) {
            const created = await callHandler(handleCharacterManage, {
                action: 'create',
                name: character.name,
                characterType: character.characterType,
                class: character.class,
                race: character.race,
                background: character.background,
                alignment: character.alignment,
                level: character.level,
                stats: character.stats,
                hp: character.hp,
                maxHp: character.maxHp,
                ac: character.ac,
                behavior: character.behavior,
                cantripsKnown: character.cantripsKnown,
                knownSpells: character.knownSpells,
                preparedSpells: character.preparedSpells,
                resistances: character.resistances,
                vulnerabilities: character.vulnerabilities,
                immunities: character.immunities,
                provisionEquipment: character.provisionEquipment,
                customEquipment: character.customEquipment,
                startingGold: character.startingGold,
                applySpeciesAbilityBonuses: false,
            }, ctx);
            const characterId = requireString(created, 'id', `character ${character.ref}`);
            characterIds.set(character.ref, characterId);

            if (character.locationRef) {
                await callHandler(handleSpatialManage, {
                    action: 'move',
                    characterId,
                    roomId: requireRef(locationIds, character.locationRef, 'location'),
                }, ctx);
            }
        }

        for (const secret of pack.secrets) {
            const linked = resolveEntity(secret.linkedEntity, locationIds, characterIds);
            await callHandler(handleSecretManage, {
                action: 'create',
                worldId,
                type: secret.type,
                category: secret.category,
                name: secret.name,
                publicDescription: secret.publicDescription,
                secretDescription: secret.secretDescription,
                linkedEntityId: linked?.id,
                linkedEntityType: linked?.kind,
                sensitivity: secret.sensitivity,
                leakPatterns: secret.leakPatterns,
                revealConditions: secret.revealConditions,
                notes: secret.notes,
            }, ctx);
        }

        if (pack.narrative.length > 0) {
            const notes = pack.narrative.map(note => {
                const linked = resolveEntity(note.entity, locationIds, characterIds);
                return {
                    type: note.type,
                    content: note.content,
                    metadata: {
                        ...note.metadata,
                        ...(note.ref ? { campaignRef: note.ref } : {}),
                        campaignId: pack.manifest.id,
                    },
                    visibility: note.visibility,
                    tags: Array.from(new Set([
                        ...note.tags,
                        `campaign:${pack.manifest.id}`,
                    ])),
                    status: note.status,
                    ...(linked ? {
                        entityId: linked.id,
                        entityType: linked.kind,
                    } : {}),
                };
            });

            for (let offset = 0; offset < notes.length; offset += 20) {
                await callHandler(handleNarrativeManage, {
                    action: 'batch_add',
                    worldId,
                    notes: notes.slice(offset, offset + 20),
                }, ctx);
            }
        }

        await callHandler(handleNarrativeManage, {
            action: 'update',
            noteId: markerNoteId,
            metadata: {
                importStatus: 'loaded',
                loadedAt: new Date().toISOString(),
                counts: countsFor(pack),
            },
        }, ctx);

        return {
            success: true,
            campaignId: pack.manifest.id,
            version: pack.manifest.version,
            worldId,
            networkId,
            markerNoteId,
            counts: countsFor(pack),
            refs: {
                locations: Object.fromEntries(locationIds),
                characters: Object.fromEntries(characterIds),
            },
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try {
            await callHandler(handleNarrativeManage, {
                action: 'update',
                noteId: markerNoteId,
                metadata: {
                    importStatus: 'failed',
                    failedAt: new Date().toISOString(),
                    error: message,
                },
            }, ctx);
        } catch {
            // Keep the original import failure.
        }
        throw error;
    }
}

async function resolveWorld(
    pack: CampaignPack,
    ctx: SessionContext,
    worldRepo: WorldRepository,
): Promise<string> {
    if (pack.world.mode === 'existing') {
        const existing = worldRepo.findById(pack.world.worldId);
        if (!existing) {
            throw new Error(`Existing world not found: ${pack.world.worldId}`);
        }
        return existing.id;
    }

    const seed = pack.world.seed ?? `campaign:${pack.manifest.id}`;
    const collision = worldRepo.findAll().find(world => world.seed === seed);
    if (collision) {
        throw new Error(
            `A world with campaign seed "${seed}" already exists (${collision.id}). ` +
            'Refusing to create a duplicate campaign world.'
        );
    }

    const created = await callHandler(handleWorldManage, {
        action: 'create',
        name: pack.world.name ?? pack.manifest.name,
        seed,
        width: pack.world.width,
        height: pack.world.height,
    }, ctx);
    const worldId = requireString(created, 'worldId', 'campaign world');

    if (pack.world.environment && Object.keys(pack.world.environment).length > 0) {
        await callHandler(handleWorldManage, {
            action: 'update',
            id: worldId,
            environment: pack.world.environment,
        }, ctx);
    }
    return worldId;
}

async function createNetwork(pack: CampaignPack, worldId: string, ctx: SessionContext): Promise<string> {
    const created = await callHandler(handleSpatialManage, {
        action: 'network_create',
        name: pack.network.name ?? `${pack.manifest.name} Locations`,
        networkType: pack.network.type,
        worldId,
        centerX: pack.network.centerX,
        centerY: pack.network.centerY,
        boundingBox: pack.network.boundingBox,
    }, ctx);
    return requireString(created, 'networkId', 'campaign location network');
}

async function findCampaignMarker(
    worldId: string,
    campaignId: string,
    ctx: SessionContext,
): Promise<{ id: string; metadata?: Record<string, unknown> } | undefined> {
    const result = await callHandler(handleNarrativeManage, {
        action: 'search',
        worldId,
        tags: ['campaign_pack', `campaign:${campaignId}`],
        limit: 1,
    }, ctx);
    const notes = Array.isArray(result.notes) ? result.notes : [];
    return notes[0] as { id: string; metadata?: Record<string, unknown> } | undefined;
}

async function callHandler(
    handler: (args: unknown, ctx: SessionContext) => Promise<McpResponse>,
    args: Record<string, unknown>,
    ctx: SessionContext,
): Promise<Record<string, any>> {
    const response = await handler(args, ctx);
    const parsed = extractPayload(response);
    if (parsed.error) {
        throw new Error(String(parsed.message ?? parsed.error));
    }
    return parsed;
}

export function extractPayload(response: McpResponse): Record<string, any> {
    const text = response.content?.find(part => part.type === 'text')?.text ?? '';
    if (!text) throw new Error('Tool handler returned no text payload');

    try {
        return JSON.parse(text) as Record<string, any>;
    } catch {
        const embedded = text.match(/<!-- [A-Z0-9_]+_JSON\s*\n([\s\S]*?)\n[A-Z0-9_]+_JSON -->/);
        if (embedded) {
            return JSON.parse(embedded[1]) as Record<string, any>;
        }
        const fenced = text.match(/```json\s*([\s\S]*?)```/i);
        if (fenced) {
            return JSON.parse(fenced[1]) as Record<string, any>;
        }
        throw new Error(`Unable to extract structured handler payload: ${text.slice(0, 180)}`);
    }
}

function resolveEntity(
    entity: { kind: 'character' | 'location'; ref: string } | undefined,
    locationIds: Map<string, string>,
    characterIds: Map<string, string>,
): { id: string; kind: 'character' | 'location' } | undefined {
    if (!entity) return undefined;
    if (entity.kind === 'location') {
        return { id: requireRef(locationIds, entity.ref, 'location'), kind: 'location' };
    }
    return { id: requireRef(characterIds, entity.ref, 'character'), kind: 'character' };
}

function buildExit(
    direction: Exit['direction'],
    targetNodeId: string,
    source: {
        type: Exit['type'];
        dc?: number;
        description?: string;
        travelTime?: number;
        terrain?: Exit['terrain'];
        difficulty?: number;
    },
): Exit {
    return {
        direction,
        targetNodeId,
        type: source.type,
        ...(source.dc !== undefined ? { dc: source.dc } : {}),
        ...(source.description ? { description: source.description } : {}),
        ...(source.travelTime !== undefined ? { travelTime: source.travelTime } : {}),
        ...(source.terrain ? { terrain: source.terrain } : {}),
        ...(source.difficulty !== undefined ? { difficulty: source.difficulty } : {}),
    };
}

function requireString(
    object: Record<string, any>,
    key: string,
    label: string,
): string {
    const value = object[key];
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${label} did not return ${key}`);
    }
    return value;
}

function requireRef(map: Map<string, string>, ref: string, label: string): string {
    const value = map.get(ref);
    if (!value) throw new Error(`Missing runtime ${label} mapping for ref: ${ref}`);
    return value;
}

function countsFor(pack: CampaignPack): CampaignPackValidation['counts'] {
    return {
        locations: pack.locations.length,
        connections: pack.connections.length,
        characters: pack.characters.length,
        secrets: pack.secrets.length,
        narrative: pack.narrative.length,
    };
}

