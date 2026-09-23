import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { startHttpServerTransport } from '../../../src/server/transport/http';
import { closeDb, getDb, useSingleUserDatabase } from '../../../src/storage/index';

const AUTH = 'single-user-service-token';

describe('single-user HTTP transport', () => {
    let server: Server;
    let client: Client;
    let dataDir: string;

    beforeEach(async () => {
        closeDb();
        dataDir = mkdtempSync(join(tmpdir(), 'rpg-single-user-http-'));
        useSingleUserDatabase(join(dataDir, 'rpg.db'));

        server = await startHttpServerTransport(
            () => {
                const mcp = new McpServer({ name: 'test', version: '0.0.0' });
                mcp.tool(
                    'storage_probe',
                    'Prove that single-user HTTP can reach the configured database without tenant context.',
                    z.object({ value: z.string() }).shape,
                    async ({ value }) => {
                        const db = getDb();
                        db.exec('CREATE TABLE IF NOT EXISTS single_user_probe (value TEXT NOT NULL)');
                        db.prepare('INSERT INTO single_user_probe (value) VALUES (?)').run(value);
                        const row = db.prepare('SELECT value FROM single_user_probe ORDER BY rowid DESC LIMIT 1').get() as { value: string };
                        return { content: [{ type: 'text' as const, text: row.value }] };
                    }
                );
                return mcp;
            },
            0,
            { host: '127.0.0.1', authToken: AUTH, singleUser: true }
        );

        const port = (server.address() as AddressInfo).port;
        client = new Client({ name: 'single-user-http-test', version: '0.0.0' });
        await client.connect(new StreamableHTTPClientTransport(
            new URL(`http://127.0.0.1:${port}/mcp`),
            { requestInit: { headers: { authorization: `Bearer ${AUTH}` } } }
        ));
    });

    afterEach(async () => {
        await client?.close().catch(() => {});
        await new Promise<void>(resolve => server.close(() => resolve()));
        closeDb();
        rmSync(dataDir, { recursive: true, force: true });
    });

    it('runs storage-backed MCP tools without a tenant header', async () => {
        const result = await client.callTool({
            name: 'storage_probe',
            arguments: { value: 'gateway-ready' },
        });

        expect(result.isError).not.toBe(true);
        expect(result.content).toEqual([{ type: 'text', text: 'gateway-ready' }]);
    });

    it('reports single-user mode in health and disables campaign deletion', async () => {
        const port = (server.address() as AddressInfo).port;
        const base = `http://127.0.0.1:${port}`;
        const health = await fetch(`${base}/health`);
        expect(health.status).toBe(200);
        expect(await health.json()).toMatchObject({
            status: 'ok',
            transport: 'http',
            mode: 'single-user',
        });

        const deletion = await fetch(`${base}/campaign`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${AUTH}` },
        });
        expect(deletion.status).toBe(404);
    });
});
