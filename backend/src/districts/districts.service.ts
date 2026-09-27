import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainContextService } from '../domain-context/domain-context.service';
import { EventsGateway } from '../realtime/events.gateway';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { DistrictCode, areAdjacent, buildRoutes, hasSeaAccess } from '../domain';

@Injectable()
export class DistrictsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: DomainContextService,
    private readonly events: EventsGateway,
  ) {}

  async listWithTopology() {
    const [districts, graph] = await Promise.all([
      this.prisma.district.findMany({ orderBy: { code: 'asc' } }),
      this.context.getGraph(),
    ]);

    return {
      districts: districts.map((d) => ({
        code: d.code,
        name: d.name,
        severity: d.severity,
        hasSeaAccess: d.hasSeaAccess,
        isHub: d.isHub,
        adjacentTo: districts
          .filter(
            (other) =>
              other.code !== d.code &&
              areAdjacent(graph, d.code as DistrictCode, other.code as DistrictCode),
          )
          .map((other) => other.code),
      })),
      edges: graph.edges,
    };
  }

  async routesBetween(from: string, to: string) {
    const graph = await this.context.getGraph();
    if (!this.context.isDistrictCode(from) || !this.context.isDistrictCode(to)) {
      throw new NotFoundException({
        code: 'UNKNOWN_DISTRICT',
        message: 'Both quarters must be one of A, E, W, X, Z.',
      });
    }

    return {
      from,
      to,
      adjacent: areAdjacent(graph, from, to),
      seaAccess: { from: hasSeaAccess(graph, from), to: hasSeaAccess(graph, to) },
      routes: buildRoutes(graph, from, to, this.context.timing),
    };
  }

  async updateSeverity(user: AuthenticatedUser, code: string, severity: number) {
    if (user.role !== 'CD') {
      throw new ForbiddenException({
        code: 'ROLE_NOT_PERMITTED_AT_LEVEL',
        message: 'Only the City Director may change a quarter severity.',
      });
    }

    const district = await this.prisma.district.findUnique({ where: { code } });
    if (!district) {
      throw new NotFoundException({
        code: 'UNKNOWN_DISTRICT',
        message: `Unknown quarter ${code}.`,
      });
    }

    const updated = await this.prisma.district.update({
      where: { code },
      data: { severity },
    });

    this.events.emitDistrictSeverityChanged(updated.code as DistrictCode, updated.severity);
    return updated;
  }
}
