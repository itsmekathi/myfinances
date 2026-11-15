import { CATEGORY_KINDS, DEFAULT_CATEGORIES_BY_KIND } from '@myfinances/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * Adds any missing default categories and subcategories (expense, income and investment) to a workspace.
 * Safe to run repeatedly; categories the user renamed or deleted are not re-added if a same-named one exists.
 */
export async function seedDefaultCategories(tx: Prisma.TransactionClient, workspaceId: string) {
  const existing = await tx.category.findMany({
    where: { workspaceId },
    select: { id: true, name: true, parentId: true, kind: true },
  });
  const key = (kind: string, parentId: string | null, name: string) =>
    `${kind}::${parentId ?? ''}::${name.toLowerCase()}`;
  const seen = new Map(existing.map((c) => [key(c.kind, c.parentId, c.name), c.id]));
  let added = 0;

  for (const kind of CATEGORY_KINDS) {
    for (const def of DEFAULT_CATEGORIES_BY_KIND[kind]) {
      let parentId = seen.get(key(kind, null, def.name));
      if (!parentId) {
        const created = await tx.category.create({
          data: { workspaceId, kind, name: def.name, icon: def.icon, color: def.color },
        });
        parentId = created.id;
        seen.set(key(kind, null, def.name), parentId);
        added++;
      }
      const missing = def.children.filter((name) => !seen.has(key(kind, parentId!, name)));
      if (missing.length) {
        await tx.category.createMany({
          data: missing.map((name) => ({ workspaceId, kind, parentId: parentId!, name, color: def.color })),
          skipDuplicates: true,
        });
        added += missing.length;
      }
    }
  }
  return added;
}
