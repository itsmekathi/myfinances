import { DEFAULT_CATEGORIES } from '@myfinances/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * Adds any missing default categories and subcategories to a workspace.
 * Safe to run repeatedly; categories the user renamed or deleted are not re-added if a same-named one exists.
 */
export async function seedDefaultCategories(tx: Prisma.TransactionClient, workspaceId: string) {
  const existing = await tx.category.findMany({
    where: { workspaceId },
    select: { id: true, name: true, parentId: true },
  });
  const key = (parentId: string | null, name: string) => `${parentId ?? ''}::${name.toLowerCase()}`;
  const seen = new Map(existing.map((c) => [key(c.parentId, c.name), c.id]));
  let added = 0;

  for (const def of DEFAULT_CATEGORIES) {
    let parentId = seen.get(key(null, def.name));
    if (!parentId) {
      const created = await tx.category.create({
        data: { workspaceId, name: def.name, icon: def.icon, color: def.color },
      });
      parentId = created.id;
      seen.set(key(null, def.name), parentId);
      added++;
    }
    const missing = def.children.filter((name) => !seen.has(key(parentId!, name)));
    if (missing.length) {
      await tx.category.createMany({
        data: missing.map((name) => ({ workspaceId, parentId: parentId!, name, color: def.color })),
        skipDuplicates: true,
      });
      added += missing.length;
    }
  }
  return added;
}
