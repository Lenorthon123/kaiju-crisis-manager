import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/errors/all-exceptions.filter';
import { PrismaService } from '../../src/prisma/prisma.service';
import { DomainContextService } from '../../src/domain-context/domain-context.service';
import {
  DISTRICTS,
  RESOURCES,
  REFERENCE_EDGES,
  REFERENCE_PERMISSION_MATRIX,
  ActionKey,
  CatastropheLevel,
} from '../../src/domain';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  context: DomainContextService;
  url: string;
}

const ALL_ACTIONS: ActionKey[] = [
  'VIEW_RESOURCES',
  'RESERVE_OWN_QUARTER',
  'REQUEST_ADJACENT_TRANSFER',
  'ORGANIZE_TRANSIT',
  'REQUISITION',
  'LOWER_RETENTION_THRESHOLD',
];

export const TEST_PASSWORD = 'test-password-1234';

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  await app.listen(0);

  return {
    app,
    prisma: app.get(PrismaService),
    context: app.get(DomainContextService),
    url: await app.getUrl(),
  };
}

// Rebuilt from the same reference-data module the engine reads, so the seeded
// figures and the annex cannot drift apart without a test noticing.
export async function resetDatabase(ctx: TestContext): Promise<void> {
  const { prisma } = ctx;

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

  for (const d of DISTRICTS) {
    await prisma.district.create({
      data: { code: d.code, name: d.name, hasSeaAccess: d.hasSeaAccess, isHub: d.isHub },
    });
  }

  for (const e of REFERENCE_EDGES) {
    await prisma.topologyEdge.createMany({
      data: [
        { fromNode: e.from, toNode: e.to, type: e.type },
        { fromNode: e.to, toNode: e.from, type: e.type },
      ],
      skipDuplicates: true,
    });
  }

  const districts = await prisma.district.findMany();
  const byCode = new Map(districts.map((d: { code: string; id: string }) => [d.code, d.id]));

  for (const r of RESOURCES) {
    const resource = await prisma.resourceType.create({
      data: { code: r.code, name: r.name, order: r.order },
    });
    for (const d of DISTRICTS) {
      const initial = r.distribution[d.code];
      await prisma.stock.create({
        data: {
          districtId: byCode.get(d.code) as string,
          resourceTypeId: resource.id,
          initialQuantity: initial,
          currentQuantity: initial,
          retentionBase: initial,
        },
      });
    }
  }

  for (const action of ALL_ACTIONS) {
    for (const level of [1, 2, 3, 4, 5] as CatastropheLevel[]) {
      for (const role of REFERENCE_PERMISSION_MATRIX[action][level]) {
        await prisma.permissionRule.create({ data: { action, level, role } });
      }
    }
  }

  await prisma.cityState.create({ data: { id: 'singleton', catastropheLevel: 1 } });

  const passwordHash = await argon2.hash(TEST_PASSWORD);
  for (const d of DISTRICTS) {
    await prisma.user.create({
      data: {
        email: `qc.${d.code.toLowerCase()}@test.local`,
        passwordHash,
        displayName: `QC ${d.name}`,
        role: 'QC',
        districtId: byCode.get(d.code) as string,
      },
    });
  }
  await prisma.user.create({
    data: { email: 'lc@test.local', passwordHash, displayName: 'LC', role: 'LC' },
  });
  await prisma.user.create({
    data: { email: 'cd@test.local', passwordHash, displayName: 'CD', role: 'CD' },
  });

  ctx.context.invalidate();
}

export async function setCatastropheLevel(ctx: TestContext, level: number): Promise<void> {
  await ctx.prisma.cityState.update({
    where: { id: 'singleton' },
    data: { catastropheLevel: level },
  });
}

export async function setStock(
  ctx: TestContext,
  districtCode: string,
  resourceCode: string,
  values: { current?: number; reserved?: number; committed?: number; retentionBase?: number },
): Promise<void> {
  const stock = await ctx.prisma.stock.findFirst({
    where: { district: { code: districtCode }, resourceType: { code: resourceCode } },
  });
  if (!stock) throw new Error(`No stock ${resourceCode} in ${districtCode}`);

  await ctx.prisma.stock.update({
    where: { id: stock.id },
    data: {
      currentQuantity: values.current ?? stock.currentQuantity,
      reservedQuantity: values.reserved ?? stock.reservedQuantity,
      committedOutbound: values.committed ?? stock.committedOutbound,
      retentionBase: values.retentionBase ?? stock.retentionBase,
    },
  });
}

export async function readStock(ctx: TestContext, districtCode: string, resourceCode: string) {
  const stock = await ctx.prisma.stock.findFirst({
    where: { district: { code: districtCode }, resourceType: { code: resourceCode } },
  });
  if (!stock) throw new Error(`No stock ${resourceCode} in ${districtCode}`);
  return stock as {
    currentQuantity: number;
    reservedQuantity: number;
    committedOutbound: number;
    retentionBase: number;
  };
}
