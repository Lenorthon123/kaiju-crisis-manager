import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainContextService } from '../domain-context/domain-context.service';
import { StockRow, StockView, toView } from './stock.view';

const STOCK_INCLUDE = {
  district: { select: { id: true, code: true } },
  resourceType: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: DomainContextService,
  ) {}

  listResourceTypes() {
    return this.prisma.resourceType.findMany({ orderBy: { order: 'asc' } });
  }

  async listStocks(districtCode?: string): Promise<StockView[]> {
    if (districtCode) {
      const district = await this.prisma.district.findUnique({ where: { code: districtCode } });
      if (!district) {
        throw new NotFoundException({
          code: 'UNKNOWN_DISTRICT',
          message: `Unknown quarter ${districtCode}.`,
        });
      }
    }

    const [rows, policy] = await Promise.all([
      this.prisma.stock.findMany({
        where: districtCode ? { district: { code: districtCode } } : undefined,
        include: STOCK_INCLUDE,
        orderBy: [{ district: { code: 'asc' } }, { resourceType: { order: 'asc' } }],
      }),
      this.context.getRetentionPolicy(),
    ]);

    return rows.map((row) => toView(row as StockRow, policy.for(row.district.id)));
  }

  async availabilityByResource(resourceCode: string): Promise<StockView[]> {
    const resource = await this.prisma.resourceType.findUnique({ where: { code: resourceCode } });
    if (!resource) {
      throw new NotFoundException({
        code: 'UNKNOWN_RESOURCE',
        message: `Unknown resource ${resourceCode}.`,
      });
    }

    const [rows, policy] = await Promise.all([
      this.prisma.stock.findMany({
        where: { resourceTypeId: resource.id },
        include: STOCK_INCLUDE,
        orderBy: { district: { code: 'asc' } },
      }),
      this.context.getRetentionPolicy(),
    ]);

    return rows.map((row) => toView(row as StockRow, policy.for(row.district.id)));
  }
}
