/**
 * Seeds the reference data of the rules annex.
 *
 * Everything the rule engine consumes lives in the database: the city graph,
 * the permission matrix, the initial stocks and their frozen retention base.
 * Nothing here is duplicated as a conditional in the application code.
 */
import { PrismaClient, ActionKey, LinkType, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  DISTRICTS,
  RESOURCES,
} from '../src/domain/reference-data';
import { REFERENCE_EDGES } from '../src/domain/topology';
import { REFERENCE_PERMISSION_MATRIX } from '../src/domain/permissions';
import { retentionMinimum, RETENTION_DEFAULT_PCT } from '../src/domain/retention';
import { ActionKey as DomainActionKey, CatastropheLevel } from '../src/domain/types';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Kaiju!2026';

async function main() {
  // Boot-time seeding passes this flag: wiping a live database on every restart
  // would be a Thanos snap, not a deployment. The question is whether the
  // reference data is COMPLETE, not whether some rows happen to exist — a
  // half-seeded database is exactly the one that still needs seeding.
  if (process.env.SEED_ONLY_IF_EMPTY === 'true') {
    const [districts, resources, users] = await Promise.all([
      prisma.district.count(),
      prisma.resourceType.count(),
      prisma.user.count(),
    ]);
    const complete =
      districts === DISTRICTS.length && resources === RESOURCES.length && users > 0;
    if (complete) {
      console.log(
        `Reference data already complete (${districts} districts, ${resources} resources, ${users} officers) — seed skipped.`,
      );
      return;
    }
    console.log(
      `Reference data incomplete (${districts}/${DISTRICTS.length} districts, ${resources}/${RESOURCES.length} resources, ${users} officers) — seeding.`,
    );
  }

  console.log('> Resetting operational tables');
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.transferLeg.deleteMany(),
    prisma.transfer.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.retentionOverride.deleteMany(),
    prisma.catastropheLevelChange.deleteMany(),
    prisma.stock.deleteMany(),
    prisma.user.deleteMany(),
    prisma.permissionRule.deleteMany(),
    prisma.topologyEdge.deleteMany(),
    prisma.resourceType.deleteMany(),
    prisma.district.deleteMany(),
    prisma.cityState.deleteMany(),
  ]);

  console.log('> Districts');
  for (const d of DISTRICTS) {
    await prisma.district.create({
      data: {
        code: d.code,
        name: d.name,
        hasSeaAccess: d.hasSeaAccess,
        isHub: d.isHub,
        severity: 1,
      },
    });
  }

  console.log('> Topology (both directions, Bay included as the SEA pseudo-node)');
  for (const e of REFERENCE_EDGES) {
    const type = e.type as LinkType;
    await prisma.topologyEdge.createMany({
      data: [
        { fromNode: e.from, toNode: e.to, type },
        { fromNode: e.to, toNode: e.from, type },
      ],
      skipDuplicates: true,
    });
  }

  console.log('> Resource types and initial stocks');
  const districts = await prisma.district.findMany();
  const byCode = new Map(districts.map((d) => [d.code, d]));

  for (const r of RESOURCES) {
    const resource = await prisma.resourceType.create({
      data: { code: r.code, name: r.name, order: r.order },
    });

    for (const d of DISTRICTS) {
      const initial = r.distribution[d.code];
      await prisma.stock.create({
        data: {
          districtId: byCode.get(d.code)!.id,
          resourceTypeId: resource.id,
          initialQuantity: initial,
          currentQuantity: initial,
          retentionBase: initial,
        },
      });
    }
  }

  console.log('> Permission matrix');
  const actions = Object.keys(REFERENCE_PERMISSION_MATRIX) as DomainActionKey[];
  for (const action of actions) {
    for (const level of [1, 2, 3, 4, 5] as CatastropheLevel[]) {
      for (const role of REFERENCE_PERMISSION_MATRIX[action][level]) {
        await prisma.permissionRule.create({
          data: { action: action as ActionKey, level, role: role as Role },
        });
      }
    }
  }

  console.log('> City state (level 1 - Watch)');
  await prisma.cityState.create({ data: { id: 'singleton', catastropheLevel: 1 } });

  console.log('> Demo officers');
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  for (const d of DISTRICTS) {
    await prisma.user.create({
      data: {
        email: `qc.${d.name.toLowerCase()}@tokyork.gov`,
        passwordHash,
        displayName: `QC ${d.name}`,
        role: 'QC',
        districtId: byCode.get(d.code)!.id,
      },
    });
  }
  await prisma.user.create({
    data: {
      email: 'lc@tokyork.gov',
      passwordHash,
      displayName: 'Logistics Coordinator',
      role: 'LC',
    },
  });
  await prisma.user.create({
    data: {
      email: 'cd@tokyork.gov',
      passwordHash,
      displayName: 'City Director',
      role: 'CD',
    },
  });

  // --- sanity checks, so a broken seed fails loudly -------------------------
  const stockCount = await prisma.stock.count();
  if (stockCount !== DISTRICTS.length * RESOURCES.length) {
    throw new Error(`Expected ${DISTRICTS.length * RESOURCES.length} stock rows, got ${stockCount}`);
  }
  for (const r of RESOURCES) {
    const sum = Object.values(r.distribution).reduce((a, b) => a + b, 0);
    if (sum !== r.total) throw new Error(`${r.code}: distribution sums to ${sum}, annex says ${r.total}`);
  }

  console.log('\nSeed complete.');
  console.log(`  ${DISTRICTS.length} districts, ${RESOURCES.length} resources, ${stockCount} stock rows`);
  console.log(`  demo password: ${DEMO_PASSWORD}`);
  console.log('  sample retention: Apex / medical personnel ->', retentionMinimum(12, RETENTION_DEFAULT_PCT));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
