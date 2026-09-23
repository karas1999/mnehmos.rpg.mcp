import { closeDb, getDb } from '../../../src/storage/index.js';
import { CampaignManageTool, handleCampaignManage } from '../../../src/server/consolidated/campaign-manage.js';
import { handleLoadToolSchema } from '../../../src/server/meta-tools.js';

const ctx = { sessionId: 'campaign-manage-test' };

function minimalPack() {
    return {
        schemaVersion: 1 as const,
        manifest: {
            id: 'minimal-pack',
            name: 'Minimal Pack',
            version: '1.0.0',
        },
        world: { mode: 'create' as const },
    };
}

function extractJson(text: string): Record<string, any> {
    const match = text.match(/<!-- CAMPAIGN_MANAGE_JSON\n([\s\S]*?)\nCAMPAIGN_MANAGE_JSON -->/);
    if (!match) throw new Error('Missing CAMPAIGN_MANAGE_JSON payload');
    return JSON.parse(match[1]);
}

describe('campaign_manage consolidated tool', () => {
    beforeEach(() => {
        closeDb();
        getDb(':memory:');
    });

    afterEach(() => {
        closeDb();
    });

    it('keeps the public schema compact while publishing action-specific pack schemas', async () => {
        expect(CampaignManageTool.name).toBe('campaign_manage');
        expect(CampaignManageTool.description).toContain('Campaign Pack v1');

        const publicShape = CampaignManageTool.inputSchema.parse({
            action: 'validate',
            pack: minimalPack(),
        });
        expect(publicShape.pack).toBeDefined();

        const schema = await handleLoadToolSchema({ toolName: 'campaign_manage' });
        expect('error' in schema).toBe(false);
        if ('error' in schema) throw new Error(schema.error);
        expect(schema.actionSchemas?.validate.required).toEqual(['action', 'pack']);
        expect(schema.actionSchemas?.load.required).toEqual(['action', 'pack']);
    });

    it('validates a pack without mutating storage', async () => {
        const response = await handleCampaignManage({
            action: 'validate',
            pack: minimalPack(),
        }, ctx);
        const parsed = extractJson(response.content[0].text);

        expect(parsed.valid).toBe(true);
        expect(parsed.campaignId).toBe('minimal-pack');
        expect(parsed.warnings).toEqual(expect.arrayContaining([
            'Pack contains no locations.',
            'Pack contains no characters.',
            'Pack contains no narrative entries.',
        ]));

        const db = getDb();
        const worlds = db.prepare('SELECT COUNT(*) AS count FROM worlds').get() as { count: number };
        expect(worlds.count).toBe(0);
    });
});
