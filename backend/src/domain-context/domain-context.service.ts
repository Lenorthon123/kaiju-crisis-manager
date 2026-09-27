import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, PrismaTransaction } from '../prisma/prisma.service';
import {
  ActionKey,
  CatastropheLevel,
  DistrictCode,
  Edge,
  LinkType,
  NodeCode,
  PermissionMatrix,
  Role,
  TimingConfig,
  TopologyGraph,
} from '../domain';

type MutableMatrix = Record<ActionKey, Record<CatastropheLevel, Role[]>>;

export interface RetentionPolicy {
  base: number;
  for(districtId: string): number;
}

const ALL_ACTIONS: ActionKey[] = [
  'VIEW_RESOURCES',
  'RESERVE_OWN_QUARTER',
  'REQUEST_ADJACENT_TRANSFER',
  'ORGANIZE_TRANSIT',
  'REQUISITION',
  'LOWER_RETENTION_THRESHOLD',
];
const ALL_LEVELS: CatastropheLevel[] = [1, 2, 3, 4, 5];

@Injectable()
// Loads the city graph and the permission matrix from the database and hands
// them to the engine as plain values. Changing a rule is a row, not a deploy.
export class DomainContextService {
  private readonly logger = new Logger(DomainContextService.name);
  private graph: TopologyGraph | null = null;
  private matrix: PermissionMatrix | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get timing(): TimingConfig {
    return {
      baseLegHours: this.config.get<number>('TRANSFER_BASE_LEG_HOURS', 2),
      maritimeMultiplier: this.config.get<number>('TRANSFER_MARITIME_MULTIPLIER', 2),
    };
  }

  get defaultRetentionPct(): number {
    return this.config.get<number>('RETENTION_DEFAULT_PCT', 0.3);
  }

  get loweredRetentionPct(): number {
    return this.config.get<number>('RETENTION_LOWERED_PCT', 0.15);
  }

  async getGraph(): Promise<TopologyGraph> {
    if (this.graph) return this.graph;

    const rows = await this.prisma.topologyEdge.findMany();
    const seen = new Set<string>();
    const edges: Edge[] = [];
    for (const row of rows) {
      const key = [row.fromNode, row.toNode].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: row.fromNode as NodeCode,
        to: row.toNode as NodeCode,
        type: row.type as LinkType,
      });
    }

    if (edges.length === 0) {
      throw new Error('Topology is empty — run `npm run prisma:seed` before starting the API.');
    }

    this.graph = { edges };
    this.logger.log(`Topology loaded: ${edges.length} undirected edges`);
    return this.graph;
  }

  async getPermissionMatrix(): Promise<PermissionMatrix> {
    if (this.matrix) return this.matrix;

    const rows = await this.prisma.permissionRule.findMany();
    const matrix = {} as MutableMatrix;
    for (const action of ALL_ACTIONS) {
      matrix[action] = {} as Record<CatastropheLevel, Role[]>;
      for (const level of ALL_LEVELS) matrix[action][level] = [];
    }
    for (const row of rows) {
      const action = row.action as ActionKey;
      const level = row.level as CatastropheLevel;
      if (!matrix[action] || !matrix[action][level]) continue;
      matrix[action][level].push(row.role as Role);
    }

    this.matrix = matrix as PermissionMatrix;
    this.logger.log(`Permission matrix loaded: ${rows.length} rules`);
    return this.matrix;
  }

  async getCatastropheLevel(tx?: PrismaTransaction): Promise<CatastropheLevel> {
    const client = tx ?? this.prisma;
    // Read server-side, inside the caller's transaction. A browser left open
    // across a de-escalation must not act on the level it last saw.
    const state = await client.cityState.findUnique({ where: { id: 'singleton' } });
    if (!state) {
      throw new Error('City state row is missing — run `npm run prisma:seed`.');
    }
    return state.catastropheLevel as CatastropheLevel;
  }

  async getRetentionPolicy(tx?: PrismaTransaction): Promise<RetentionPolicy> {
    const client = tx ?? this.prisma;
    const overrides = await client.retentionOverride.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });

    const cityWide = overrides.find((o) => o.districtId === null);
    const base = cityWide ? Number(cityWide.pct) : this.defaultRetentionPct;

    const perDistrict = new Map<string, number>();
    for (const o of overrides) {
      if (o.districtId && !perDistrict.has(o.districtId)) {
        perDistrict.set(o.districtId, Number(o.pct));
      }
    }

    return {
      base,
      for: (districtId: string) => perDistrict.get(districtId) ?? base,
    };
  }

  invalidate(): void {
    this.graph = null;
    this.matrix = null;
  }

  isDistrictCode(value: string): value is DistrictCode {
    return ['A', 'E', 'W', 'X', 'Z'].includes(value);
  }
}
