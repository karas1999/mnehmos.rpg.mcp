import { z } from 'zod';
import { createActionRouter, type ActionDefinition, type McpResponse } from '../../utils/action-router.js';
import { RichFormatter } from '../utils/formatter.js';
import type { SessionContext } from '../types.js';
import { CampaignPackSchema } from '../../campaign/schema.js';
import { loadCampaignPack, validateCampaignPack } from '../../campaign/loader.js';

const ACTIONS = ['validate', 'load'] as const;
type CampaignAction = typeof ACTIONS[number];

const ValidateSchema = z.object({
    action: z.literal('validate'),
    pack: CampaignPackSchema,
});

const LoadSchema = z.object({
    action: z.literal('load'),
    pack: CampaignPackSchema,
});

const definitions: Record<CampaignAction, ActionDefinition> = {
    validate: {
        schema: ValidateSchema,
        handler: async ({ pack }) => validateCampaignPack(pack),
        aliases: ['check', 'lint'],
        description: 'Validate a Campaign Pack v1 without changing game state',
    },
    load: {
        schema: LoadSchema,
        handler: async ({ pack }, ctx?: SessionContext) => {
            if (!ctx) throw new Error('No session context');
            return loadCampaignPack(pack, ctx);
        },
        aliases: ['import', 'install'],
        description: 'Load a validated Campaign Pack v1 into the current database',
    },
};

const router = createActionRouter({
    actions: ACTIONS,
    definitions,
    threshold: 0.6,
});

export const CampaignManageTool = {
    name: 'campaign_manage',
    description: `Validate and load portable Campaign Pack v1 modules.

Campaign Packs use stable human-readable refs for locations and characters.
The loader creates a world (or targets an existing one), materializes locations,
connects the map, creates characters, places them, installs DM secrets, and
loads narrative context.

Actions: validate, load
Aliases: check/lint->validate, import/install->load

Use validate before load when a pack was generated or edited outside the engine.
Loading is guarded by a campaign import marker and refuses duplicate imports.`,
    actionSchemas: router.actionSchemas,
    inputSchema: z.object({
        action: z.string().describe('Action: validate, load'),
        pack: z.any().optional().describe('Campaign Pack v1 object; validated against the action-specific schema'),
    }),
};

export async function handleCampaignManage(args: unknown, ctx: SessionContext): Promise<McpResponse> {
    const response = await router(args as Record<string, unknown>, ctx);
    const raw = response.content?.[0]?.text ?? '{}';
    let parsed: Record<string, any>;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return response;
    }

    let output = '';
    if (parsed.error) {
        output = RichFormatter.header('Campaign Error', 'X');
        output += RichFormatter.alert(parsed.message ?? String(parsed.error), 'error');
    } else if ((args as Record<string, unknown>).action === 'validate') {
        output = RichFormatter.header(`Campaign Pack Valid: ${parsed.name}`, 'PACK');
        output += RichFormatter.keyValue({
            'Campaign ID': parsed.campaignId,
            'Version': parsed.version,
            'Locations': parsed.counts?.locations ?? 0,
            'Characters': parsed.counts?.characters ?? 0,
            'Secrets': parsed.counts?.secrets ?? 0,
        });
        if (parsed.warnings?.length) {
            output += RichFormatter.section('Warnings');
            output += RichFormatter.list(parsed.warnings);
        }
    } else {
        output = RichFormatter.header('Campaign Pack Loaded', 'PACK');
        output += RichFormatter.keyValue({
            'Campaign ID': parsed.campaignId,
            'Version': parsed.version,
            'World ID': parsed.worldId,
            'Locations': parsed.counts?.locations ?? 0,
            'Characters': parsed.counts?.characters ?? 0,
            'Secrets': parsed.counts?.secrets ?? 0,
        });
    }

    output += RichFormatter.embedJson(parsed, 'CAMPAIGN_MANAGE');
    return { content: [{ type: 'text', text: output }] };
}

