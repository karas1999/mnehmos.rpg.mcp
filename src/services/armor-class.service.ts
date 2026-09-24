import type { InventoryRepository } from '../storage/repos/inventory.repo.js';

type InventoryEntries = ReturnType<InventoryRepository['getInventoryWithDetails']>['items'];

/**
 * Rebuild AC from equipped armor/shields.
 *
 * This is shared by character creation and later equip/unequip operations so
 * there is one authoritative interpretation of armor item properties.
 */
export function calculateEquippedArmorClass(
    dexterity: number,
    items: InventoryEntries,
): number {
    const dexMod = Math.floor((dexterity - 10) / 2);
    let armorBase = 10 + dexMod;
    let equipmentBonus = 0;

    for (const entry of items) {
        if (!entry.equipped || !entry.item.properties) continue;
        const props = entry.item.properties as Record<string, unknown>;
        if (typeof props.acBonus === 'number') equipmentBonus += props.acBonus;

        const baseAC = typeof props.baseAC === 'number'
            ? props.baseAC
            : typeof props.ac === 'number'
                ? props.ac
                : null;
        if (baseAC === null || entry.slot !== 'armor') continue;

        const maxDexBonus = typeof props.maxDexBonus === 'number'
            ? props.maxDexBonus
            : typeof props.strengthRequired === 'number'
                ? 0
                : Number.POSITIVE_INFINITY;
        const dexContribution = maxDexBonus === 0 ? 0 : Math.min(dexMod, maxDexBonus);
        armorBase = Math.max(armorBase, baseAC + dexContribution);
    }

    return armorBase + equipmentBonus;
}
