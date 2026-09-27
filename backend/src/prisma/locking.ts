import { Prisma } from '@prisma/client';
import { PrismaTransaction } from './prisma.service';

// Two teams, one crate, same millisecond. Without this lock both read "1 left",
// both pass the retention check and both write.
// Ids are sorted: locking the same two rows in opposite orders deadlocks.
export async function lockStocks(tx: PrismaTransaction, stockIds: string[]): Promise<void> {
  const ordered = [...new Set(stockIds)].sort();
  if (ordered.length === 0) return;

  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "stocks" WHERE id IN (${Prisma.join(ordered)}) ORDER BY id FOR UPDATE`,
  );
}

export async function lockCityState(tx: PrismaTransaction): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "city_state" WHERE id = 'singleton' FOR UPDATE`);
}
