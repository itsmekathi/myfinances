/**
 * One-off backfill: adds the default categories/subcategories to every existing workspace.
 * Idempotent. Run with: pnpm --filter @myfinances/api seed:subcategories
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedDefaultCategories } from '../src/workspaces/default-categories';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
    for (const ws of workspaces) {
      const added = await prisma.$transaction((tx) => seedDefaultCategories(tx, ws.id));
      console.log(`${ws.name}: added ${added} categories`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
