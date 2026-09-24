import { handleRestManage, RestManageTool } from '../../../src/server/consolidated/rest-manage.js';
import { getDb, closeDb } from '../../../src/storage/index.js';
import { CharacterRepository } from '../../../src/storage/repos/character.repo.js';
import { randomUUID } from 'crypto';

describe('rest_manage consolidated tool', () => {
    let characterId: string;
    let db: ReturnType<typeof getDb>;
    let characterRepo: CharacterRepository;

    beforeEach(() => {
        closeDb();
        db = getDb(':memory:');
        characterRepo = new CharacterRepository(db);

        // Create a test character
        characterId = randomUUID();
        const now = new Date().toISOString();
        characterRepo.create({
            id: characterId,
            name: 'Test Fighter',
            characterType: 'pc',
            level: 5,
            hp: 20,
            maxHp: 45,
            ac: 16,
            stats: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
            createdAt: now,
            updatedAt: now
        });
    });

    const ctx = { worldId: '', partyId: '', encounterContext: null };

    describe('tool definition', () => {
        it('should have correct name and description', () => {
            expect(RestManageTool.name).toBe('rest_manage');
            expect(RestManageTool.description).toContain('rest');
        });

        it('should list both actions in description', () => {
            expect(RestManageTool.description).toContain('long');
            expect(RestManageTool.description).toContain('short');
        });
    });

    describe('action: long', () => {
        it('should restore HP to maximum', async () => {
            const result = await handleRestManage({
                action: 'long',
                characterId
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.restType).toBe('long');
            expect(parsed.newHp).toBe(parsed.maxHp);
            expect(parsed.hpRestored).toBe(25); // 45 - 20
        });

        it('should restore up to half the character total hit dice, minimum one', async () => {
            characterRepo.update(characterId, {
                resourcePools: { hit_dice: { current: 1, max: 5 } }
            });

            const result = await handleRestManage({
                action: 'long',
                characterId
            }, ctx);
            const parsed = JSON.parse(result.content[0].text);

            expect(parsed.hitDiceRecovered).toBe(2);
            expect(parsed.hitDiceRemaining).toBe(3);
            expect(parsed.hitDiceMax).toBe(5);
            expect(characterRepo.findById(characterId)?.resourcePools.hit_dice).toMatchObject({
                current: 3,
                max: 5
            });
        });

        it('should restore one hit die for a level-1 character', async () => {
            characterRepo.update(characterId, {
                level: 1,
                resourcePools: { hit_dice: { current: 0, max: 1 } }
            });

            const result = await handleRestManage({ action: 'long', characterId }, ctx);
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.hitDiceRecovered).toBe(1);
            expect(parsed.hitDiceRemaining).toBe(1);
            expect(parsed.hitDiceMax).toBe(1);
        });

        it('should accept alias "long_rest"', async () => {
            const result = await handleRestManage({
                action: 'long_rest',
                characterId
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.restType).toBe('long');
            expect(parsed._fuzzyMatch).toBeDefined();
        });

        it('should accept alias "full"', async () => {
            const result = await handleRestManage({
                action: 'full',
                characterId
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.restType).toBe('long');
        });

        it('should return error for non-existent character', async () => {
            const result = await handleRestManage({
                action: 'long',
                characterId: randomUUID()
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.error).toBe(true);
            expect(parsed.message).toContain('not found');
        });
    });

    describe('action: short', () => {
        it('should restore HP using hit dice', async () => {
            const result = await handleRestManage({
                action: 'short',
                characterId,
                hitDiceToSpend: 2
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.restType).toBe('short');
            expect(parsed.hitDiceSpent).toBe(2);
            expect(parsed.hitDieSize).toBe('d10');
            expect(parsed.rolls).toHaveLength(2);
            expect(parsed.newHp).toBeGreaterThanOrEqual(parsed.previousHp);
            expect(parsed.hitDiceRemaining).toBe(3);
            expect(parsed.hitDiceMax).toBe(5);
        });

        it('should persist spent hit dice and reject overspending', async () => {
            const first = await handleRestManage({
                action: 'short',
                characterId,
                hitDiceToSpend: 4
            }, ctx);
            const parsedFirst = JSON.parse(first.content[0].text);
            expect(parsedFirst.hitDiceRemaining).toBe(1);

            const second = await handleRestManage({
                action: 'short',
                characterId,
                hitDiceToSpend: 2
            }, ctx);
            const parsedSecond = JSON.parse(second.content[0].text);
            expect(parsedSecond.error).toBe(true);
            expect(parsedSecond.message).toContain('1 hit die');

            const persisted = characterRepo.findById(characterId);
            expect(persisted?.resourcePools.hit_dice).toMatchObject({ current: 1, max: 5 });
        });

        it('should derive a ranger hit die as d10', async () => {
            characterRepo.update(characterId, { characterClass: 'Ranger' });

            const result = await handleRestManage({
                action: 'short',
                characterId,
                hitDiceToSpend: 1
            }, ctx);
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.hitDieSize).toBe('d10');
        });

        it('should default to 1 hit die', async () => {
            const result = await handleRestManage({
                action: 'short',
                characterId
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.hitDiceSpent).toBe(1);
            expect(parsed.rolls).toHaveLength(1);
        });

        it('should accept alias "short_rest"', async () => {
            const result = await handleRestManage({
                action: 'short_rest',
                characterId
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.restType).toBe('short');
        });

        it('should accept alias "quick"', async () => {
            const result = await handleRestManage({
                action: 'quick',
                characterId
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.restType).toBe('short');
        });

        it('should not heal above maxHp', async () => {
            // First heal to near max
            characterRepo.update(characterId, { hp: 44 });

            const result = await handleRestManage({
                action: 'short',
                characterId,
                hitDiceToSpend: 5
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.newHp).toBeLessThanOrEqual(parsed.maxHp);
        });
    });

    describe('fuzzy matching', () => {
        it('should match typo "lng" to "long"', async () => {
            const result = await handleRestManage({
                action: 'lng',
                characterId
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.restType).toBe('long');
            expect(parsed._fuzzyMatch).toBeDefined();
        });

        it('should match typo "shrt" to "short"', async () => {
            const result = await handleRestManage({
                action: 'shrt',
                characterId
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.restType).toBe('short');
        });
    });

    describe('error handling', () => {
        it('should return guiding error for invalid action', async () => {
            const result = await handleRestManage({
                action: 'xyz',
                characterId
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.error).toBe('invalid_action');
            expect(parsed.suggestions).toBeDefined();
            expect(parsed.message).toContain('Did you mean');
        });

        it('should return error for missing action', async () => {
            const result = await handleRestManage({
                characterId
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.error).toBe(true);
            expect(parsed.message).toContain('action');
        });

        it('should return validation error for missing characterId', async () => {
            const result = await handleRestManage({
                action: 'long'
            }, ctx);

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.error).toBe('validation_error');
            expect(parsed.issues).toBeDefined();
        });
    });
});
