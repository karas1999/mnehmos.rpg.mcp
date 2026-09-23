import { closeDb, getDb } from '../../src/storage/index.js';
import { CampaignPackSchema } from '../../src/campaign/schema.js';
import { loadCampaignPack, validateCampaignPack } from '../../src/campaign/loader.js';
import { WorldRepository } from '../../src/storage/repos/world.repo.js';
import { SpatialRepository } from '../../src/storage/repos/spatial.repo.js';
import { CharacterRepository } from '../../src/storage/repos/character.repo.js';
import { SecretRepository } from '../../src/storage/repos/secret.repo.js';

const ctx = { sessionId: 'campaign-loader-test' };

function samplePack() {
    return {
        schemaVersion: 1 as const,
        manifest: {
            id: 'smoke-inn',
            name: 'The Smoke Inn',
            version: '1.0.0',
            author: 'Test Suite',
        },
        world: {
            mode: 'create' as const,
            name: 'Smoke Valley',
            seed: 'smoke-inn-test-seed',
            width: 20,
            height: 20,
            environment: {
                timeOfDay: 'evening',
            },
        },
        network: {
            name: 'Smoke Inn',
            type: 'cluster' as const,
            centerX: 4,
            centerY: 6,
        },
        locations: [
            {
                ref: 'taproom',
                name: 'The Smoke Inn Taproom',
                description: 'A low timber taproom warmed by a broad stone hearth.',
                biome: 'urban' as const,
                localX: 0,
                localY: 0,
            },
            {
                ref: 'cellar',
                name: 'The Smoke Inn Cellar',
                description: 'A damp stone cellar lined with dusty casks and old shelves.',
                biome: 'dungeon' as const,
                atmospherics: ['DARKNESS'] as const,
                localX: 0,
                localY: 1,
            },
        ],
        connections: [
            {
                from: 'taproom',
                to: 'cellar',
                direction: 'down' as const,
                type: 'HIDDEN' as const,
                dc: 14,
                description: 'A disguised trapdoor beneath the rug.',
                bidirectional: true,
            },
        ],
        characters: [
            {
                ref: 'mara',
                name: 'Mara Vale',
                characterType: 'npc' as const,
                class: 'Commoner',
                race: 'Human',
                level: 1,
                hp: 8,
                maxHp: 8,
                ac: 10,
                behavior: 'Friendly in public, nervous when anyone mentions the cellar.',
                locationRef: 'taproom',
            },
        ],
        secrets: [
            {
                type: 'npc' as const,
                category: 'motivation',
                name: 'Mara has the cellar key',
                publicDescription: 'Mara avoids talking about the cellar.',
                secretDescription: 'Mara hides the cellar key inside the kitchen flour jar.',
                linkedEntity: { kind: 'character' as const, ref: 'mara' },
                sensitivity: 'high' as const,
                leakPatterns: ['flour jar'],
            },
        ],
        narrative: [
            {
                ref: 'missing-courier',
                type: 'plot_thread' as const,
                content: 'A courier vanished after stopping at the Smoke Inn.',
                visibility: 'dm_only' as const,
                tags: ['hook', 'missing-person'],
                entity: { kind: 'location' as const, ref: 'cellar' },
                metadata: {
                    urgency: 'medium',
                    hooks: ['Ask Mara about the courier'],
                    resolution_conditions: ['Discover what happened in the cellar'],
                },
            },
        ],
    };
}

describe('Campaign Pack v1', () => {
    beforeEach(() => {
        closeDb();
        getDb(':memory:');
    });

    afterEach(() => {
        closeDb();
    });

    it('validates stable references and reports pack counts', () => {
        const result = validateCampaignPack(samplePack());

        expect(result.valid).toBe(true);
        expect(result.campaignId).toBe('smoke-inn');
        expect(result.counts).toEqual({
            locations: 2,
            connections: 1,
            characters: 1,
            secrets: 1,
            narrative: 1,
        });
        expect(result.warnings).toEqual([]);
    });

    it('rejects broken cross references before touching storage', () => {
        const pack = samplePack();
        pack.characters[0].locationRef = 'nowhere';

        expect(() => CampaignPackSchema.parse(pack)).toThrow(/Unknown location ref: nowhere/);

        const db = getDb();
        const worlds = db.prepare('SELECT COUNT(*) AS count FROM worlds').get() as { count: number };
        expect(worlds.count).toBe(0);
    });

    it('loads a portable pack into engine state with resolved runtime ids', async () => {
        const result = await loadCampaignPack(samplePack(), ctx);
        const db = getDb();

        const world = new WorldRepository(db).findById(result.worldId);
        expect(world?.name).toBe('Smoke Valley');
        expect(world?.environment?.timeOfDay).toBe('evening');

        const spatial = new SpatialRepository(db);
        const taproom = spatial.findById(result.refs.locations.taproom);
        const cellar = spatial.findById(result.refs.locations.cellar);
        expect(taproom?.networkId).toBe(result.networkId);
        expect(cellar?.networkId).toBe(result.networkId);
        expect(taproom?.exits).toEqual(expect.arrayContaining([
            expect.objectContaining({
                direction: 'down',
                targetNodeId: cellar?.id,
                type: 'HIDDEN',
                dc: 14,
            }),
        ]));
        expect(cellar?.exits).toEqual(expect.arrayContaining([
            expect.objectContaining({
                direction: 'up',
                targetNodeId: taproom?.id,
                type: 'HIDDEN',
                dc: 14,
            }),
        ]));

        const mara = new CharacterRepository(db).findById(result.refs.characters.mara);
        expect(mara?.name).toBe('Mara Vale');
        expect(mara?.currentRoomId).toBe(taproom?.id);

        const secrets = new SecretRepository(db).find({
            worldId: result.worldId,
            linkedEntityId: mara?.id,
        });
        expect(secrets).toHaveLength(1);
        expect(secrets[0].secretDescription).toContain('flour jar');

        const notes = db.prepare(
            'SELECT type, content, metadata, tags, entity_id FROM narrative_notes WHERE world_id = ? ORDER BY created_at'
        ).all(result.worldId) as Array<{
            type: string;
            content: string;
            metadata: string;
            tags: string;
            entity_id: string | null;
        }>;

        const marker = notes.find(note => note.content.startsWith('Campaign pack import marker:'));
        expect(marker).toBeDefined();
        expect(JSON.parse(marker!.metadata)).toMatchObject({
            campaignPack: true,
            campaignId: 'smoke-inn',
            importStatus: 'loaded',
        });

        const plot = notes.find(note => note.type === 'plot_thread');
        expect(plot?.entity_id).toBe(cellar?.id);
        expect(JSON.parse(plot!.tags)).toContain('campaign:smoke-inn');
    });

    it('refuses to create a second world from the same campaign seed', async () => {
        await loadCampaignPack(samplePack(), ctx);

        await expect(loadCampaignPack(samplePack(), ctx))
            .rejects
            .toThrow(/campaign seed .* already exists/i);
    });

    it('uses the campaign marker to block duplicate imports into an existing world', async () => {
        const first = await loadCampaignPack(samplePack(), ctx);
        const pack = samplePack();
        pack.world = {
            mode: 'existing' as const,
            worldId: first.worldId,
        };

        await expect(loadCampaignPack(pack, ctx))
            .rejects
            .toThrow(/already present in world/i);
    });
});

